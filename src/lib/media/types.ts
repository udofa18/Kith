import type { FeedMediaStatus, FeedVariantName } from './config';

/** Metadata stored for one generated file. Paths are relative to the storage bucket. */
export interface FeedMediaVariant {
  path: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: 'image/webp';
}

export type FeedMediaVariants = Partial<Record<FeedVariantName, FeedMediaVariant>>;

/** Server response shape from the feed media API endpoints. */
export interface FeedMediaRecord {
  id: string;
  userId: string;
  postId: string | null;
  bucket: string;
  originalPath: string;
  /** Public URL for the untouched original, the source of truth for full-resolution viewing. */
  url: string;
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
  /** Tiny blurred WebP data URI used while the feed image loads. */
  placeholder: string | null;
  error: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * The shape written into a post's existing `media` array.
 *
 * Historical posts store only `{ type, url }`; every new field is optional so they keep
 * rendering without migration. `url` and `type` remain for compatibility with the profile
 * grid and older readers.
 */
export interface FeedPostImage {
  type: 'image';
  url: string;
  path?: string;
  mediaId?: string;
  mimeType?: string;
  alt?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
  status?: FeedMediaStatus;
  variants?: FeedMediaVariants;
  placeholder?: string | null;
  error?: string | null;
}

/** Any image-shaped media item, including legacy `{ type, url }` records. */
export type FeedImageLike = Pick<FeedPostImage, 'url'> &
  Partial<Omit<FeedPostImage, 'type' | 'url'>> & { type?: 'image' | 'video' };

export interface FeedPostVideo {
  type: 'video';
  url: string;
}

export type FeedPostMedia = FeedPostImage | FeedPostVideo;
