/**
 * Feed media orchestration.
 *
 * The original upload is the source of truth. A row is created once per uploaded path,
 * variants are written under immutable paths, and repeated requests return the existing
 * ready row instead of processing again. Any processing failure leaves the original in
 * place and records `failed` so the owner can retry.
 */
import {
  FEED_MEDIA_BUCKET,
  FEED_MEDIA_LIMITS,
  feedMediaVariantPath,
  isFeedMediaId,
  isFeedMediaOriginalPath,
} from '../../../src/lib/media/config.js';
import type { FeedMediaStatus, FeedVariantName } from '../../../src/lib/media/config.js';
import type { FeedMediaVariants } from '../../../src/lib/media/types.js';
import {
  MediaError,
  inspectFeedImage,
  renderFeedPlaceholder,
  renderFeedVariants,
} from './processor.js';
import type { FeedMediaRepository, FeedMediaRow, MediaStorage } from './types.js';

export const STALE_PROCESSING_MS = 5 * 60_000;
export const ABANDONED_AFTER_MS = 24 * 60 * 60_000;

export interface ProcessFeedMediaInput {
  userId: string;
  mediaId: string;
  path: string;
  declaredMime?: string | null;
}

export interface ProcessFeedMediaDeps {
  repository: FeedMediaRepository;
  storage: MediaStorage;
  now?: () => number;
}

export interface ProcessFeedMediaResult {
  row: FeedMediaRow;
  reused: boolean;
}

/** Bound Sharp work per function instance; the DB status prevents cross-instance duplicates. */
function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

export const withProcessingSlot = createLimiter(2);

function publicErrorMessage(error: unknown): string {
  if (error instanceof MediaError) return error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return 'Image optimization failed. Try again.';
}

function variantPaths(row: FeedMediaRow): string[] {
  return Object.values(row.variants)
    .map((variant) => variant?.path)
    .filter((path): path is string => !!path);
}

function staleProcessing(row: FeedMediaRow, now: number): boolean {
  const updated = row.updatedAt ? Date.parse(row.updatedAt) : NaN;
  return !Number.isFinite(updated) || now - updated > STALE_PROCESSING_MS;
}

async function markFailed(
  repository: FeedMediaRepository,
  row: FeedMediaRow,
  error: unknown,
): Promise<FeedMediaRow> {
  try {
    return await repository.markFailed(row.id, publicErrorMessage(error));
  } catch (dbError) {
    console.error('[media] could not persist failure state:', dbError);
    return { ...row, status: 'failed' as FeedMediaStatus, error: publicErrorMessage(error) };
  }
}

const inFlight = new Map<string, Promise<ProcessFeedMediaResult>>();

/**
 * Validate, process and store one uploaded feed image.
 *
 * - Ready rows are returned untouched (idempotent).
 * - Fresh `processing` rows are treated as in-flight and returned.
 * - Stale `processing` / `failed` / `pending` rows are retried.
 * - Validation errors before a row exists are thrown (the upload is not publishable).
 *
 * Concurrent requests for the same media id share one run on this instance. The database
 * status stops later requests (including from other instances) once a run is marked
 * processing; a truly simultaneous cross-instance race can repeat the work, but it writes
 * the same deterministic variant paths, so the result stays idempotent.
 */
export function processFeedMedia(
  input: ProcessFeedMediaInput,
  deps: ProcessFeedMediaDeps,
): Promise<ProcessFeedMediaResult> {
  const key = `${input.userId}:${input.mediaId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const promise = processFeedMediaInternal(input, deps).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

async function processFeedMediaInternal(
  input: ProcessFeedMediaInput,
  deps: ProcessFeedMediaDeps,
): Promise<ProcessFeedMediaResult> {
  const { userId, mediaId, path, declaredMime } = input;
  const { repository, storage } = deps;
  const now = deps.now ?? Date.now;

  if (!isFeedMediaId(mediaId)) {
    throw new MediaError('invalid_path', 'Invalid media id', 400);
  }
  if (!isFeedMediaOriginalPath(userId, mediaId, path)) {
    throw new MediaError('invalid_path', 'Invalid media path', 400);
  }

  const existing = await repository.getById(mediaId);
  if (existing) {
    if (existing.userId !== userId) {
      throw new MediaError('forbidden', 'This media belongs to another account', 403);
    }
    if (existing.originalPath !== path) {
      throw new MediaError('conflict', 'Media path does not match its record', 409);
    }
    if (existing.status === 'ready') return { row: existing, reused: true };
    if (existing.status === 'processing' && !staleProcessing(existing, now())) {
      return { row: existing, reused: true };
    }
  }

  return withProcessingSlot(async () => {
    let row = existing;

    try {
      const original = await storage.download(path).catch((error) => {
        throw new MediaError(
          'not_found',
          error instanceof Error ? error.message : 'The uploaded image could not be found',
          404,
        );
      });

      // Validate before creating a database record; rejected files never enter the feed.
      const info = await inspectFeedImage(original, declaredMime);

      if (!row) {
        row = await repository.create({
          id: mediaId,
          userId,
          bucket: FEED_MEDIA_BUCKET,
          originalPath: path,
          mimeType: info.mimeType,
          bytes: info.bytes,
          width: info.width,
          height: info.height,
          aspectRatio: info.aspectRatio,
          format: info.format,
          hasAlpha: info.hasAlpha,
          isAnimated: info.isAnimated,
        });
      }

      if (row.status === 'ready') return { row, reused: true };
      const processing = await repository.markProcessing(row.id, row.attemptCount + 1);
      row = processing;

      const rendered = await renderFeedVariants(original, info);
      const variants: FeedMediaVariants = {};
      for (const variant of rendered) {
        const variantPath = feedMediaVariantPath(userId, mediaId, variant.name);
        await storage.upload(variantPath, variant.buffer, variant.mimeType);
        variants[variant.name as FeedVariantName] = {
          path: variantPath,
          width: variant.width,
          height: variant.height,
          bytes: variant.bytes,
          mimeType: variant.mimeType,
        };
      }

      const placeholder = await renderFeedPlaceholder(original);

      const ready = await repository.markReady(row.id, {
        mimeType: info.mimeType,
        bytes: info.bytes,
        width: info.width,
        height: info.height,
        aspectRatio: info.aspectRatio,
        format: info.format,
        hasAlpha: info.hasAlpha,
        isAnimated: info.isAnimated,
        variants,
        placeholder,
      });
      return { row: ready, reused: false };
    } catch (error) {
      if (row) return { row: await markFailed(repository, row, error), reused: false };
      throw error;
    }
  });
}

/** Retry uses the stored path; callers cannot inject a new one. */
export async function retryFeedMedia(
  mediaId: string,
  userId: string,
  deps: ProcessFeedMediaDeps,
): Promise<ProcessFeedMediaResult> {
  if (!isFeedMediaId(mediaId)) {
    throw new MediaError('invalid_path', 'Invalid media id', 400);
  }
  const row = await deps.repository.getById(mediaId);
  if (!row) throw new MediaError('not_found', 'Media not found', 404);
  if (row.userId !== userId) {
    throw new MediaError('forbidden', 'This media belongs to another account', 403);
  }
  return processFeedMedia(
    {
      userId,
      mediaId: row.id,
      path: row.originalPath,
      declaredMime: row.mimeType,
    },
    deps,
  );
}

/** Attaches already-owned media rows to a post. Caller verifies post ownership first. */
export async function attachFeedMedia(
  repository: FeedMediaRepository,
  userId: string,
  postId: string,
  mediaIds: string[],
): Promise<number> {
  const unique = [...new Set(mediaIds.filter(isFeedMediaId))].slice(
    0,
    FEED_MEDIA_LIMITS.maxImagesPerPost * 4,
  );
  if (unique.length === 0) return 0;

  for (const id of unique) {
    const row = await repository.getById(id);
    if (!row || row.userId !== userId) {
      throw new MediaError('forbidden', 'One of those images belongs to another account', 403);
    }
  }
  return repository.attachToPost(unique, userId, postId);
}

/**
 * Removes never-published uploads that are still pending/processing. Failed and ready
 * originals are intentionally kept: a post may reference them, and retry must not require
 * re-uploading.
 */
export async function cleanupAbandonedFeedMedia(
  deps: ProcessFeedMediaDeps,
  beforeIso = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString(),
): Promise<{ deleted: number; failed: number }> {
  const rows = await deps.repository.listAbandoned(beforeIso);
  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await deps.storage.remove([row.originalPath, ...variantPaths(row)]);
      await deps.repository.delete(row.id);
      deleted += 1;
    } catch (error) {
      console.error(`[media] cleanup failed for ${row.id}:`, error);
      failed += 1;
    }
  }
  return { deleted, failed };
}
