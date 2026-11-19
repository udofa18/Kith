/**
 * Browser-side feed media client.
 *
 * The original is uploaded from the browser to the existing `posts` bucket (the uploader
 * owns that folder under Storage RLS), then one authenticated request asks the server to
 * validate and pre-generate variants. The post keeps using its existing `media` array;
 * the server-side `feed_media` row is the canonical processing record.
 */
import { auth } from '../../firebase';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from '../storage';
import {
  FEED_MEDIA_BUCKET,
  feedMediaOriginalPath,
  isFeedMediaId,
  type FeedMediaStatus,
} from './config';
import type { FeedMediaRecord, FeedPostImage } from './types';
import {
  feedImageExtension,
  validateFeedImageDimensions,
  validateFeedImageFile,
} from './validate';

export type FeedImageUploadStage = 'uploading' | 'processing';

export interface UploadFeedImageOptions {
  onProgress?: (percent: number) => void;
  onStage?: (stage: FeedImageUploadStage) => void;
}

export interface UploadedFeedImage {
  media: FeedMediaRecord | null;
  postMedia: FeedPostImage;
  /** False when the original uploaded but variant generation failed. */
  processed: boolean;
}

async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to upload images');
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** Oriented dimensions as the browser sees them (EXIF rotation applied). */
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read. Try a different file.'));
    };
    image.src = url;
  });
}

function recordToPostImage(
  record: FeedMediaRecord | null,
  originalUrl: string,
  fallback: { path: string; mediaId: string; mimeType: string; width: number; height: number },
): FeedPostImage {
  const width = record?.width || fallback.width;
  const height = record?.height || fallback.height;
  return {
    type: 'image',
    url: record?.url || originalUrl,
    path: record?.originalPath || fallback.path,
    mediaId: record?.id || fallback.mediaId,
    mimeType: record?.mimeType || fallback.mimeType,
    width,
    height,
    aspectRatio: record?.aspectRatio || (width > 0 && height > 0 ? width / height : undefined),
    status: record?.status ?? 'failed',
    variants: record?.variants ?? {},
    placeholder: record?.placeholder ?? null,
    error: record?.error ?? null,
  };
}

/**
 * Upload one image and start processing. Upload failures reject (so publishing stops);
 * processing failures resolve with the original attached and a retryable status.
 */
export async function uploadFeedImage(
  file: File,
  options: UploadFeedImageOptions = {},
): Promise<UploadedFeedImage> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to upload images');

  const declarationError = validateFeedImageFile(file);
  if (declarationError) throw new Error(declarationError);

  const extension = feedImageExtension(file.type);
  if (!extension) throw new Error('Unsupported image type');

  const dimensions = await readImageDimensions(file);
  const dimensionError = validateFeedImageDimensions(dimensions.width, dimensions.height);
  if (dimensionError) throw new Error(dimensionError);

  const mediaId = crypto.randomUUID();
  const path = feedMediaOriginalPath(user.uid, mediaId, extension);
  const storageRef = ref(null, `${FEED_MEDIA_BUCKET}/${path}`);

  options.onStage?.('uploading');
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    // The media id is unique and the original is never overwritten.
    cacheControl: '31536000, immutable',
  });
  task.on('state_changed', (snapshot) => {
    if (!snapshot.totalBytes) return;
    options.onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
  });
  await task.done;
  const url = await getDownloadURL(storageRef);

  options.onStage?.('processing');
  const fallback = {
    path,
    mediaId,
    mimeType: file.type,
    width: dimensions.width,
    height: dimensions.height,
  };

  let response: Response;
  try {
    response = await fetch('/api/media/feed/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ mediaId, path, mimeType: file.type }),
    });
  } catch (error) {
    // Network failure: keep the uploaded original and let the feed retry later.
    const message = error instanceof Error ? error.message : 'Image optimization could not start';
    return {
      media: null,
      postMedia: {
        ...recordToPostImage(null, url, fallback),
        status: 'failed' satisfies FeedMediaStatus,
        error: message,
      },
      processed: false,
    };
  }

  const body = (await response.json().catch(() => ({}))) as {
    media?: FeedMediaRecord;
    error?: string;
  };

  if (!response.ok || !body.media) {
    // Rejected before processing (bad format/dimensions/path): remove the orphaned
    // original and do not publish it.
    await deleteObject(storageRef).catch((cleanupError) => {
      console.warn('[media] could not remove rejected upload:', cleanupError);
    });
    throw new Error(body.error || `Image processing failed (${response.status})`);
  }

  return {
    media: body.media,
    postMedia: recordToPostImage(body.media, url, fallback),
    processed: body.media.status === 'ready',
  };
}

/** Retry variant generation for a media row the caller owns. */
export async function retryFeedMedia(mediaId: string): Promise<FeedMediaRecord> {
  if (!isFeedMediaId(mediaId)) throw new Error('This image cannot be retried');
  const response = await fetch('/api/media/feed/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ mediaId }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    media?: FeedMediaRecord;
    error?: string;
  };
  if (!response.ok || !body.media) {
    throw new Error(body.error || `Retry failed (${response.status})`);
  }
  if (body.media.status !== 'ready') {
    throw new Error(body.media.error || 'Image optimization failed again');
  }
  return body.media;
}

/** Point processed media rows at the post they were published with. Best effort. */
export async function attachFeedMediaToPost(postId: string, mediaIds: string[]): Promise<void> {
  const ids = mediaIds.filter(isFeedMediaId);
  if (!postId || ids.length === 0) return;
  await fetch('/api/media/feed/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ postId, mediaIds: ids }),
  });
}

export function feedMediaFromRecord(record: FeedMediaRecord): FeedPostImage {
  return recordToPostImage(record, record.url, {
    path: record.originalPath,
    mediaId: record.id,
    mimeType: record.mimeType,
    width: record.width,
    height: record.height,
  });
}
