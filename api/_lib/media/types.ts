import type { FeedMediaStatus, FeedVariantName } from '../../../src/lib/media/config.js';
import type { FeedMediaVariants } from '../../../src/lib/media/types.js';

/** Canonical processing row, independent of the database's snake_case shape. */
export interface FeedMediaRow {
  id: string;
  userId: string;
  postId: string | null;
  bucket: string;
  originalPath: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
  hasAlpha: boolean;
  isAnimated: boolean;
  status: FeedMediaStatus;
  variants: FeedMediaVariants;
  placeholder: string | null;
  error: string | null;
  attemptCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateFeedMediaInput {
  id: string;
  userId: string;
  bucket: string;
  originalPath: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
  hasAlpha: boolean;
  isAnimated: boolean;
}

export interface ReadyFeedMediaPatch {
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  aspectRatio: number;
  format: string;
  hasAlpha: boolean;
  isAnimated: boolean;
  variants: FeedMediaVariants;
  placeholder: string | null;
}

export interface FeedMediaRepository {
  getById(id: string): Promise<FeedMediaRow | null>;
  getByOriginalPath(userId: string, path: string): Promise<FeedMediaRow | null>;
  create(input: CreateFeedMediaInput): Promise<FeedMediaRow>;
  markProcessing(id: string, attemptCount: number): Promise<FeedMediaRow>;
  markReady(id: string, patch: ReadyFeedMediaPatch): Promise<FeedMediaRow>;
  markFailed(id: string, message: string): Promise<FeedMediaRow>;
  attachToPost(mediaIds: string[], userId: string, postId: string): Promise<number>;
  listAbandoned(beforeIso: string): Promise<FeedMediaRow[]>;
  delete(id: string): Promise<void>;
}

export interface MediaStorage {
  download(path: string): Promise<Buffer>;
  upload(
    path: string,
    data: Buffer,
    contentType: string,
    cacheControl?: string,
  ): Promise<void>;
  remove(paths: string[]): Promise<void>;
  publicUrl(path: string): string;
}

export type VariantName = FeedVariantName;
