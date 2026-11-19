import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  attachFeedMedia,
  cleanupAbandonedFeedMedia,
  processFeedMedia,
  retryFeedMedia,
  type ProcessFeedMediaDeps,
} from '../api/_lib/media/service';
import type {
  CreateFeedMediaInput,
  FeedMediaRepository,
  FeedMediaRow,
  MediaStorage,
} from '../api/_lib/media/types';
import { FEED_MEDIA_VARIANTS, feedMediaOriginalPath } from '../src/lib/media/config';

const USER = 'user-1';
const OTHER = 'user-2';
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID_2 = '123e4567-e89b-42d3-a456-426614174001';
const animatedGif = readFileSync(new URL('./fixtures/animated.gif', import.meta.url));

class MemoryRepository implements FeedMediaRepository {
  rows = new Map<string, FeedMediaRow>();

  async getById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row, variants: { ...row.variants } } : null;
  }

  async getByOriginalPath(userId: string, path: string) {
    for (const row of this.rows.values()) {
      if (row.userId === userId && row.originalPath === path) return { ...row };
    }
    return null;
  }

  async create(input: CreateFeedMediaInput) {
    const existing = await this.getByOriginalPath(input.userId, input.originalPath);
    if (existing) return existing;
    const row: FeedMediaRow = {
      ...input,
      postId: null,
      bucket: input.bucket,
      status: 'pending',
      variants: {},
      placeholder: null,
      error: null,
      attemptCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async markProcessing(id: string, attemptCount: number) {
    const row = this.rows.get(id);
    if (!row) throw new Error('missing');
    Object.assign(row, {
      status: 'processing' as const,
      attemptCount,
      error: null,
      updatedAt: new Date().toISOString(),
    });
    return { ...row };
  }

  async markReady(id: string, patch: Parameters<FeedMediaRepository['markReady']>[1]) {
    const row = this.rows.get(id);
    if (!row) throw new Error('missing');
    Object.assign(row, patch, {
      status: 'ready' as const,
      error: null,
      updatedAt: new Date().toISOString(),
    });
    return { ...row };
  }

  async markFailed(id: string, message: string) {
    const row = this.rows.get(id);
    if (!row) throw new Error('missing');
    Object.assign(row, {
      status: 'failed' as const,
      error: message,
      updatedAt: new Date().toISOString(),
    });
    return { ...row };
  }

  async attachToPost(mediaIds: string[], userId: string, postId: string) {
    let attached = 0;
    for (const id of mediaIds) {
      const row = this.rows.get(id);
      if (row && row.userId === userId) {
        row.postId = postId;
        attached += 1;
      }
    }
    return attached;
  }

  async listAbandoned(beforeIso: string) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          (row.status === 'pending' || row.status === 'processing') &&
          !row.postId &&
          !!row.createdAt &&
          row.createdAt < beforeIso,
      )
      .map((row) => ({ ...row }));
  }

  async delete(id: string) {
    this.rows.delete(id);
  }
}

class MemoryStorage implements MediaStorage {
  files = new Map<string, Buffer>();
  uploads: string[] = [];
  removed: string[] = [];
  failUploads = false;

  async download(path: string) {
    const file = this.files.get(path);
    if (!file) throw new Error('Object not found');
    return file;
  }

  async upload(path: string, data: Buffer) {
    if (this.failUploads) throw new Error('Storage upload failed');
    this.files.set(path, data);
    this.uploads.push(path);
  }

  async remove(paths: string[]) {
    for (const path of paths) {
      this.files.delete(path);
      this.removed.push(path);
    }
  }

  publicUrl(path: string) {
    return `https://demo.supabase.co/storage/v1/object/public/posts/${path}`;
  }
}

let jpeg: Buffer;
let repository: MemoryRepository;
let storage: MemoryStorage;
let deps: ProcessFeedMediaDeps;

const seeded = async (id: string, path: string, buffer: Buffer) => {
  storage.files.set(path, buffer);
  return processFeedMedia({ userId: USER, mediaId: id, path, declaredMime: 'image/jpeg' }, deps);
};

beforeAll(async () => {
  jpeg = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: '#3a7bd5' },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
});

beforeEach(() => {
  repository = new MemoryRepository();
  storage = new MemoryStorage();
  deps = { repository, storage };
});

describe('feed media processing service', () => {
  it('creates one row, stores every planned variant and reports ready', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    const result = await seeded(ID, path, jpeg);

    expect(result.reused).toBe(false);
    expect(result.row.status).toBe('ready');
    expect(result.row).toMatchObject({ userId: USER, width: 2000, height: 1000, attemptCount: 1 });
    expect(Object.keys(result.row.variants)).toHaveLength(FEED_MEDIA_VARIANTS.length);
    expect(storage.uploads).toHaveLength(FEED_MEDIA_VARIANTS.length);
    for (const variant of Object.values(result.row.variants)) {
      expect(storage.files.has(variant!.path)).toBe(true);
      expect(variant!.path.startsWith(`${USER}/feed-media/${ID}/variants/`)).toBe(true);
    }
    // The original is still in storage, untouched.
    expect(storage.files.get(path)?.equals(jpeg)).toBe(true);
  });

  it('is idempotent: a repeated request reuses the ready row and overwrites nothing', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    await seeded(ID, path, jpeg);
    const uploadsAfterFirst = [...storage.uploads];

    const repeated = await seeded(ID, path, jpeg);
    expect(repeated.reused).toBe(true);
    expect(repeated.row.status).toBe('ready');
    expect(storage.uploads).toEqual(uploadsAfterFirst);
    expect(repository.rows.size).toBe(1);
  });

  it('preserves the original after a processing failure and succeeds on retry', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    storage.files.set(path, jpeg);
    storage.failUploads = true;

    const failed = await processFeedMedia(
      { userId: USER, mediaId: ID, path, declaredMime: 'image/jpeg' },
      deps,
    );
    expect(failed.row.status).toBe('failed');
    expect(failed.row.error).toContain('Storage upload failed');
    expect(storage.files.get(path)?.equals(jpeg)).toBe(true);

    storage.failUploads = false;
    const retried = await retryFeedMedia(ID, USER, deps);
    expect(retried.row.status).toBe('ready');
    expect(Object.keys(retried.row.variants)).toHaveLength(4);
    expect(retried.row.attemptCount).toBe(2);
    expect(storage.files.get(path)?.equals(jpeg)).toBe(true);
  });

  it('rejects another user, a mismatched path, or a malformed id before reading storage', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    storage.files.set(path, jpeg);

    await expect(
      processFeedMedia({ userId: OTHER, mediaId: ID, path }, deps),
    ).rejects.toMatchObject({ code: 'invalid_path', status: 400 });

    await expect(
      processFeedMedia({ userId: USER, mediaId: ID, path: 'user-1/feed-media/elsewhere/original.jpg' }, deps),
    ).rejects.toMatchObject({ code: 'invalid_path' });

    await expect(
      processFeedMedia({ userId: USER, mediaId: '../../x', path }, deps),
    ).rejects.toMatchObject({ code: 'invalid_path' });

    // A ready row cannot be pointed at a different object either.
    await seeded(ID, path, jpeg);
    const otherPath = feedMediaOriginalPath(USER, ID_2, 'jpg');
    await expect(
      processFeedMedia({ userId: USER, mediaId: ID, path: otherPath }, deps),
    ).rejects.toMatchObject({ code: 'invalid_path' });
  });

  it('does not create a record for corrupted uploads', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    storage.files.set(path, Buffer.from('not an image'));

    await expect(
      processFeedMedia({ userId: USER, mediaId: ID, path, declaredMime: 'image/jpeg' }, deps),
    ).rejects.toMatchObject({ code: 'invalid_image' });
    expect(repository.rows.size).toBe(0);
  });

  it('reports a missing original instead of creating a dangling record', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    await expect(
      processFeedMedia({ userId: USER, mediaId: ID, path, declaredMime: 'image/jpeg' }, deps),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    expect(repository.rows.size).toBe(0);
  });

  it('deduplicates concurrent requests for the same media id', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'jpg');
    storage.files.set(path, jpeg);
    const [a, b] = await Promise.all([
      processFeedMedia({ userId: USER, mediaId: ID, path, declaredMime: 'image/jpeg' }, deps),
      processFeedMedia({ userId: USER, mediaId: ID, path, declaredMime: 'image/jpeg' }, deps),
    ]);
    expect(a.row.id).toBe(b.row.id);
    expect(repository.rows.size).toBe(1);
    expect(storage.uploads).toHaveLength(4);
  });

  it('processes a multi-image post as independent records', async () => {
    const ids = [ID, ID_2, '123e4567-e89b-42d3-a456-426614174002', '123e4567-e89b-42d3-a456-426614174003'];
    for (const [index, id] of ids.entries()) {
      const path = feedMediaOriginalPath(USER, id, 'jpg');
      storage.files.set(path, jpeg);
      const result = await processFeedMedia(
        { userId: USER, mediaId: id, path, declaredMime: 'image/jpeg' },
        deps,
      );
      expect(result.row.status).toBe('ready');
      expect(result.row.id).toBe(id);
      expect(Object.keys(result.row.variants)).toHaveLength(4);
      expect(result.row.originalPath).toBe(path);
      expect(index).toBeLessThan(4);
    }
    expect(repository.rows.size).toBe(4);
    expect(storage.uploads).toHaveLength(16);
  });

  it('keeps animated GIFs on the original without generating variants', async () => {
    const path = feedMediaOriginalPath(USER, ID, 'gif');
    storage.files.set(path, animatedGif);

    const result = await processFeedMedia(
      { userId: USER, mediaId: ID, path, declaredMime: 'image/gif' },
      deps,
    );
    expect(result.row.status).toBe('ready');
    expect(result.row.isAnimated).toBe(true);
    expect(result.row.variants).toEqual({});
    expect(storage.uploads).toEqual([]);
    expect(storage.files.get(path)?.equals(animatedGif)).toBe(true);
  });

  it('links owned media to a post and rejects another user’s media', async () => {
    const path1 = feedMediaOriginalPath(USER, ID, 'jpg');
    const path2 = feedMediaOriginalPath(USER, ID_2, 'jpg');
    await seeded(ID, path1, jpeg);
    await seeded(ID_2, path2, jpeg);

    expect(await attachFeedMedia(repository, USER, 'post-1', [ID, ID_2])).toBe(2);
    expect(repository.rows.get(ID)?.postId).toBe('post-1');

    repository.rows.get(ID_2)!.userId = OTHER;
    await expect(attachFeedMedia(repository, USER, 'post-2', [ID_2])).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
  });

  it('cleans only abandoned pending/processing uploads, never failed originals', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60_000).toISOString();
    const pendingPath = feedMediaOriginalPath(USER, ID, 'jpg');
    const failedPath = feedMediaOriginalPath(USER, ID_2, 'jpg');
    storage.files.set(pendingPath, jpeg);
    storage.files.set(failedPath, jpeg);
    const pending = await repository.create({
      id: ID,
      userId: USER,
      bucket: 'posts',
      originalPath: pendingPath,
      mimeType: 'image/jpeg',
      bytes: jpeg.length,
      width: 2000,
      height: 1000,
      aspectRatio: 2,
      format: 'jpeg',
      hasAlpha: false,
      isAnimated: false,
    });
    const failed = await repository.create({
      id: ID_2,
      userId: USER,
      bucket: 'posts',
      originalPath: failedPath,
      mimeType: 'image/jpeg',
      bytes: jpeg.length,
      width: 2000,
      height: 1000,
      aspectRatio: 2,
      format: 'jpeg',
      hasAlpha: false,
      isAnimated: false,
    });
    repository.rows.get(pending.id)!.createdAt = old;
    repository.rows.get(failed.id)!.createdAt = old;
    await repository.markFailed(failed.id, 'failed earlier');

    const result = await cleanupAbandonedFeedMedia(deps, new Date().toISOString());
    expect(result.deleted).toBe(1);
    expect(repository.rows.has(ID)).toBe(false);
    expect(repository.rows.has(ID_2)).toBe(true);
    expect(storage.files.has(pendingPath)).toBe(false);
    expect(storage.files.has(failedPath)).toBe(true);
  });
});
