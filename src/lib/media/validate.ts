import {
  FEED_MEDIA_EXTENSION_BY_MIME,
  FEED_MEDIA_LIMITS,
  isAllowedFeedMime,
  type FeedMediaMime,
} from './config';

export interface FeedImageFileMeta {
  name: string;
  type: string;
  size: number;
}

export interface FeedImageBatch {
  accepted: FeedImageFileMeta[];
  errors: string[];
}

const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** File extension for an accepted declared MIME type. */
export function feedImageExtension(type: string): string | null {
  return isAllowedFeedMime(type) ? FEED_MEDIA_EXTENSION_BY_MIME[type as FeedMediaMime] : null;
}

/** Validates the declaration only; the server decodes the actual bytes as well. */
export function validateFeedImageFile(file: FeedImageFileMeta): string | null {
  if (!isAllowedFeedMime(file.type)) {
    return `${file.name || 'This file'} is not a supported image. Use JPEG, PNG, WebP, GIF or AVIF.`;
  }
  if (file.size <= 0) return `${file.name || 'This image'} is empty.`;
  if (file.size > FEED_MEDIA_LIMITS.maxImageBytes) {
    return `${file.name || 'This image'} is larger than ${mb(FEED_MEDIA_LIMITS.maxImageBytes)}.`;
  }
  return null;
}

export function validateFeedImageDimensions(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'That image could not be read. Try a different file.';
  }
  if (width < FEED_MEDIA_LIMITS.minDimension || height < FEED_MEDIA_LIMITS.minDimension) {
    return `Images must be at least ${FEED_MEDIA_LIMITS.minDimension} × ${FEED_MEDIA_LIMITS.minDimension} pixels.`;
  }
  if (width > FEED_MEDIA_LIMITS.maxDimension || height > FEED_MEDIA_LIMITS.maxDimension) {
    return `Images can be at most ${FEED_MEDIA_LIMITS.maxDimension.toLocaleString()} × ${FEED_MEDIA_LIMITS.maxDimension.toLocaleString()} pixels.`;
  }
  return null;
}

/**
 * Validates a batch before any upload starts: per-file type/size, image count and the
 * combined size limit. Returns the files that fit, so a valid image is not dropped just
 * because a later one in the selection is too large.
 */
export function validateFeedImageBatch(
  files: FeedImageFileMeta[],
  existingImageCount = 0,
  existingImageBytes = 0,
): FeedImageBatch {
  const accepted: FeedImageFileMeta[] = [];
  const errors: string[] = [];
  // Images already in the composer count toward the same per-post budget.
  let total = Math.max(0, existingImageBytes);

  for (const file of files) {
    const fileError = validateFeedImageFile(file);
    if (fileError) {
      errors.push(fileError);
      continue;
    }
    if (existingImageCount + accepted.length >= FEED_MEDIA_LIMITS.maxImagesPerPost) {
      errors.push(`A post can include up to ${FEED_MEDIA_LIMITS.maxImagesPerPost} images.`);
      continue;
    }
    if (total + file.size > FEED_MEDIA_LIMITS.maxTotalImageBytesPerPost) {
      errors.push(
        `Those images together are larger than ${mb(FEED_MEDIA_LIMITS.maxTotalImageBytesPerPost)}.`,
      );
      continue;
    }
    total += file.size;
    accepted.push(file);
  }

  return { accepted, errors: [...new Set(errors)] };
}
