/**
 * Supabase Storage uploads.
 *
 * This is a small compatibility layer for the handful of Firebase Storage calls the app used:
 * `ref`, `uploadBytes`, `uploadBytesResumable` and `getDownloadURL`. Keeping the same shape meant
 * the upload sites only needed their import changed.
 *
 * The first segment of the old path is the bucket:
 *   avatars/<uid>/photo.png → bucket `avatars`, key `<uid>/photo.png`
 *
 * Public buckets return a normal public URL. `private_products` returns a `supabase://` marker
 * instead: only the server can sign a URL for a paid file, after checking the purchase.
 */
import { auth } from '../firebase';
import { ensureSupabaseRoleClaim } from './authClaim';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');

/** Buckets whose files can be read with a plain public URL. */
const PUBLIC_BUCKETS = new Set([
  'avatars',
  'posts',
  'products',
  'previews',
  'editor',
  'article_covers',
  'statuses',
  'messages',
  'events',
  'communities',
  'channels',
]);

export interface StorageRef {
  bucket: string;
  /** Path inside the bucket. */
  path: string;
  /** Bucket plus path, the same value the old Firebase ref used. */
  fullPath: string;
}

export interface UploadSnapshot {
  ref: StorageRef;
  bytesTransferred: number;
  totalBytes: number;
}

export interface UploadTask {
  ref: StorageRef;
  snapshot: UploadSnapshot;
  on(
    event: 'state_changed',
    progress: ((snapshot: UploadSnapshot) => void) | null,
    error?: ((error: Error) => void) | null,
    complete?: (() => void) | null,
  ): () => void;
  cancel(): void;
  done: Promise<StorageRef>;
}

/** Split a legacy `folder/<uid>/file` path into bucket + key. */
export function ref(_storage: unknown, path: string): StorageRef {
  const fullPath = path.replace(/^\/+/, '');
  const slash = fullPath.indexOf('/');
  const bucket = slash === -1 ? fullPath : fullPath.slice(0, slash);
  const key = slash === -1 ? '' : fullPath.slice(slash + 1);
  if (!bucket) throw new Error('Storage path is missing a bucket');
  return { bucket, path: key, fullPath };
}

function storageUrl(bucket: string, path: string): string {
  if (!SUPABASE_URL) throw new Error('Supabase is not configured');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;
}

/** Same claim refresh as `src/supabase.ts`, so uploads are treated as authenticated. */
async function accessToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to upload files');
  const token = await user.getIdToken();
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload?.role !== 'authenticated') {
      await ensureSupabaseRoleClaim(token);
      return user.getIdToken(true);
    }
  } catch {
    await ensureSupabaseRoleClaim(token);
    return user.getIdToken(true);
  }
  return token;
}

const pendingUploads = new WeakMap<StorageRef, Promise<StorageRef>>();

function startUpload(storageRef: StorageRef, file: File, contentType?: string): UploadTask {
  let progressHandler: ((snapshot: UploadSnapshot) => void) | null = null;
  let errorHandler: ((error: Error) => void) | null = null;
  let completeHandler: (() => void) | null = null;

  const snapshot: UploadSnapshot = {
    ref: storageRef,
    bytesTransferred: 0,
    totalBytes: file.size,
  };

  let settleResolve: (value: StorageRef) => void = () => {};
  let settleReject: (error: Error) => void = () => {};
  const done = new Promise<StorageRef>((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });

  let xhr: XMLHttpRequest | null = null;
  let finished = false;

  const emitProgress = () => progressHandler?.({ ...snapshot });

  const fail = (error: Error) => {
    if (finished) return;
    finished = true;
    errorHandler?.(error);
    settleReject(error);
  };

  const succeed = () => {
    if (finished) return;
    finished = true;
    snapshot.bytesTransferred = snapshot.totalBytes;
    emitProgress();
    completeHandler?.();
    settleResolve(storageRef);
  };

  Promise.resolve()
    .then(async () => {
      const token = await accessToken();
      const request = new XMLHttpRequest();
      xhr = request;
      request.open('POST', storageUrl(storageRef.bucket, storageRef.path), true);
      request.setRequestHeader('Authorization', `Bearer ${token}`);
      request.setRequestHeader('x-upsert', 'true');
      request.setRequestHeader('cache-control', '3600');
      request.setRequestHeader('Content-Type', contentType || file.type || 'application/octet-stream');

      request.upload.onprogress = event => {
        if (!event.lengthComputable) return;
        snapshot.bytesTransferred = event.loaded;
        snapshot.totalBytes = event.total;
        emitProgress();
      };

      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          succeed();
          return;
        }
        let message = `Upload failed (${request.status})`;
        try {
          const body = JSON.parse(request.responseText);
          message = body?.message || body?.error || message;
        } catch {
          if (request.responseText) message = request.responseText;
        }
        fail(new Error(message));
      };
      request.onerror = () => fail(new Error('Upload failed. Check your connection and try again.'));
      request.onabort = () => fail(new Error('Upload cancelled'));

      request.send(file);
    })
    .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));

  const task: UploadTask = {
    ref: storageRef,
    snapshot,
    on(_event, progress, error, complete) {
      progressHandler = progress ?? null;
      errorHandler = error ?? null;
      completeHandler = complete ?? null;
      // Late listeners still get the latest progress.
      if (snapshot.bytesTransferred > 0 && !finished) emitProgress();
      return () => {
        progressHandler = null;
        errorHandler = null;
        completeHandler = null;
      };
    },
    cancel() {
      xhr?.abort();
    },
    done,
  };

  pendingUploads.set(storageRef, done);
  // Progress-style callers handle errors through `on('state_changed', …)`. Mark the promise as
  // handled so those callers don't trigger an unhandled rejection; awaiters still see the error.
  void done.catch(() => {});
  return task;
}

/** Upload a file and resolve once Supabase has stored it. Returns the same shape Firebase did. */
export async function uploadBytes(
  storageRef: StorageRef,
  file: File,
  metadata?: { contentType?: string },
): Promise<{ ref: StorageRef; metadata: { contentType: string; size: number } }> {
  const task = startUpload(storageRef, file, metadata?.contentType);
  await task.done;
  return {
    ref: storageRef,
    metadata: { contentType: metadata?.contentType || file.type, size: file.size },
  };
}

/** Upload a file and return a task with `on('state_changed', progress, error, complete)`. */
export function uploadBytesResumable(
  storageRef: StorageRef,
  file: File,
  metadata?: { contentType?: string },
): UploadTask {
  return startUpload(storageRef, file, metadata?.contentType);
}

/**
 * Resolve a downloadable URL for a stored file.
 * Public buckets get a public URL; private files get a `supabase://` marker for the server.
 */
export async function getDownloadURL(storageRef: StorageRef): Promise<string> {
  const pending = pendingUploads.get(storageRef);
  if (pending) await pending;

  if (PUBLIC_BUCKETS.has(storageRef.bucket)) {
    if (!SUPABASE_URL) throw new Error('Supabase is not configured');
    const encoded = storageRef.path.split('/').map(encodeURIComponent).join('/');
    return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(storageRef.bucket)}/${encoded}`;
  }
  return `supabase://${storageRef.bucket}/${storageRef.path}`;
}

/** Remove a file. Used when a creator replaces an upload. */
export async function deleteObject(storageRef: StorageRef): Promise<void> {
  if (!SUPABASE_URL || !storageRef.path) return;
  const token = await accessToken();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(storageRef.bucket)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [storageRef.path] }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to delete file (${response.status})`);
  }
}
