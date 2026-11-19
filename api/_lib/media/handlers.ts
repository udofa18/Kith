/**
 * HTTP handlers for `/api/media/feed/*`.
 *
 * Every route except cleanup requires a Firebase ID token. Storage paths are validated
 * against the caller's uid and media id inside the service; the API never accepts an
 * arbitrary remote URL or a storage path outside the caller's folder.
 */
import { firestoreAdmin, uidFromAuthHeader } from '../firebaseApp.js';
import { MediaError } from './processor.js';
import { supabaseFeedMediaRepository } from './repository.js';
import {
  attachFeedMedia,
  cleanupAbandonedFeedMedia,
  processFeedMedia,
  retryFeedMedia,
} from './service.js';
import { createSupabaseMediaStorage } from './storage.js';
import type { FeedMediaRepository, FeedMediaRow, MediaStorage } from './types.js';

export interface MediaHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export interface MediaDeps {
  repository: FeedMediaRepository;
  storage: MediaStorage;
}

export const defaultMediaDeps: MediaDeps = {
  repository: supabaseFeedMediaRepository,
  storage: createSupabaseMediaStorage(),
};

const fail = (status: number, error: string): MediaHandlerResult => ({ status, body: { error } });

function publicRecord(row: FeedMediaRow, storage: MediaStorage) {
  return {
    ...row,
    url: storage.publicUrl(row.originalPath),
  };
}

function errorResult(error: unknown): MediaHandlerResult {
  if (error instanceof MediaError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  console.error('[media] unexpected error:', error);
  return fail(500, 'Image processing failed. Please try again.');
}

export async function handleProcessFeedMedia(
  body: Record<string, unknown>,
  authorization?: string,
  deps: MediaDeps = defaultMediaDeps,
): Promise<MediaHandlerResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');

  const mediaId = typeof body.mediaId === 'string' ? body.mediaId : '';
  const path = typeof body.path === 'string' ? body.path : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : null;
  if (!mediaId || !path) return fail(400, 'mediaId and path are required');

  try {
    const { row } = await processFeedMedia(
      { userId: uid, mediaId, path, declaredMime: mimeType },
      deps,
    );
    return {
      status: 200,
      body: { media: publicRecord(row, deps.storage) },
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function handleRetryFeedMedia(
  body: Record<string, unknown>,
  authorization?: string,
  deps: MediaDeps = defaultMediaDeps,
): Promise<MediaHandlerResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const mediaId = typeof body.mediaId === 'string' ? body.mediaId : '';
  if (!mediaId) return fail(400, 'mediaId is required');

  try {
    const { row } = await retryFeedMedia(mediaId, uid, deps);
    return {
      status: 200,
      body: { media: publicRecord(row, deps.storage) },
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function handleFeedMediaStatus(
  mediaId: string | undefined,
  authorization?: string,
  deps: MediaDeps = defaultMediaDeps,
): Promise<MediaHandlerResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (!mediaId) return fail(400, 'id is required');

  try {
    const row = await deps.repository.getById(mediaId);
    // Do not disclose another account's media existence.
    if (!row || row.userId !== uid) return fail(404, 'Media not found');
    return {
      status: 200,
      body: { media: publicRecord(row, deps.storage) },
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function handleAttachFeedMedia(
  body: Record<string, unknown>,
  authorization?: string,
  deps: MediaDeps = defaultMediaDeps,
): Promise<MediaHandlerResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');

  const postId = typeof body.postId === 'string' ? body.postId : '';
  const mediaIds = Array.isArray(body.mediaIds)
    ? body.mediaIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(postId)) return fail(400, 'Invalid post');
  if (mediaIds.length === 0) return fail(400, 'mediaIds are required');

  try {
    // Firestore remains the posts source of truth, so ownership is checked there.
    const snapshot = await firestoreAdmin().collection('posts').doc(postId).get();
    if (!snapshot.exists) return fail(404, 'Post not found');
    const authorUid = snapshot.data()?.authorUid;
    if (authorUid !== uid) return fail(403, 'You do not own this post');

    const attached = await attachFeedMedia(deps.repository, uid, postId, mediaIds);
    return { status: 200, body: { attached } };
  } catch (error) {
    if (error instanceof MediaError) return errorResult(error);
    console.error('[media] could not attach media to post:', error);
    return fail(503, 'Could not link media to the post');
  }
}

export async function handleCleanupFeedMedia(
  deps: MediaDeps = defaultMediaDeps,
): Promise<MediaHandlerResult> {
  try {
    const result = await cleanupAbandonedFeedMedia({ repository: deps.repository, storage: deps.storage });
    return { status: 200, body: { ...result } };
  } catch (error) {
    console.error('[media] cleanup failed:', error);
    return fail(500, 'Cleanup failed');
  }
}
