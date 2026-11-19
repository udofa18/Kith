import { describe, expect, it } from 'vitest';
import {
  FEED_MEDIA_LIMITS,
  FEED_MEDIA_VARIANTS,
  feedMediaOriginalPath,
  feedMediaVariantPath,
  isFeedMediaId,
  isFeedMediaOriginalPath,
  planFeedVariants,
} from '../src/lib/media/config';
import {
  validateFeedImageBatch,
  validateFeedImageDimensions,
  validateFeedImageFile,
} from '../src/lib/media/validate';

const image = (name: string, size: number) => ({ name, type: 'image/jpeg', size });

describe('feed media configuration', () => {
  it('publishes the required limits and variant plan', () => {
    expect(FEED_MEDIA_LIMITS.maxImagesPerPost).toBe(4);
    expect(FEED_MEDIA_LIMITS.maxImageBytes).toBe(10 * 1024 * 1024);
    expect(FEED_MEDIA_LIMITS.maxTotalImageBytesPerPost).toBe(30 * 1024 * 1024);
    expect(FEED_MEDIA_LIMITS.maxDimension).toBe(12_000);
    expect(FEED_MEDIA_LIMITS.minDimension).toBe(32);
    expect(FEED_MEDIA_VARIANTS.map((v) => [v.maxWidth, v.quality])).toEqual([
      [320, 72],
      [640, 78],
      [960, 80],
      [1600, 82],
    ]);
  });

  it('plans only variants that actually shrink the image', () => {
    expect(planFeedVariants(2000, 1000).map((v) => v.name)).toEqual([
      'thumbnail',
      'feed-640',
      'feed-960',
      'feed-1600',
    ]);
    // 500 × 400 only has one useful target; the larger ones would upscale.
    expect(planFeedVariants(500, 400).map((v) => v.name)).toEqual(['thumbnail']);
    expect(planFeedVariants(200, 150)).toEqual([]);
    expect(planFeedVariants(400, 100).map((v) => v.name)).toEqual(['thumbnail']);
    expect(planFeedVariants(0, 100)).toEqual([]);
  });

  it('keeps storage paths anchored to the uploader and media id', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const path = feedMediaOriginalPath('user-1', id, 'jpg');
    expect(path).toBe(`user-1/feed-media/${id}/original.jpg`);
    expect(feedMediaVariantPath('user-1', id, 'feed-960')).toBe(
      `user-1/feed-media/${id}/variants/feed-960.webp`,
    );
    expect(isFeedMediaOriginalPath('user-1', id, path)).toBe(true);
    expect(isFeedMediaOriginalPath('user-2', id, path)).toBe(false);
    expect(isFeedMediaOriginalPath('user-1', id, `${path}/../../other.jpg`)).toBe(false);
    expect(isFeedMediaOriginalPath('user-1', id, `user-1/feed-media/${id}/original.svg`)).toBe(false);
    expect(isFeedMediaId(id)).toBe(true);
    expect(isFeedMediaId('../../etc/passwd')).toBe(false);
  });
});

describe('client-side feed image validation', () => {
  it('accepts the supported image declarations and rejects the rest', () => {
    expect(validateFeedImageFile(image('a.jpg', 1024))).toBeNull();
    expect(validateFeedImageFile({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toContain(
      'not a supported image',
    );
    expect(validateFeedImageFile(image('huge.jpg', FEED_MEDIA_LIMITS.maxImageBytes + 1))).toContain(
      'larger than',
    );
    expect(validateFeedImageFile(image('empty.jpg', 0))).toContain('empty');
  });

  it('enforces the image count and per-post total without dropping valid files', () => {
    const files = [image('1.jpg', 8 * 1024 * 1024), image('2.jpg', 8 * 1024 * 1024), image('3.jpg', 8 * 1024 * 1024), image('4.jpg', 8 * 1024 * 1024), image('5.jpg', 1000)];
    const batch = validateFeedImageBatch(files);
    // The fourth 8 MB file would exceed 30 MB, but the small fifth file still fits.
    expect(batch.accepted.map((file) => file.name)).toEqual(['1.jpg', '2.jpg', '3.jpg', '5.jpg']);
    expect(batch.errors.join(' ')).toContain('larger than 30 MB');

    const count = validateFeedImageBatch(Array.from({ length: 5 }, (_, i) => image(`${i}.jpg`, 1000)));
    expect(count.accepted).toHaveLength(4);
    expect(count.errors.join(' ')).toContain('up to 4 images');

    const alreadyFull = validateFeedImageBatch([image('x.jpg', 1000)], 4);
    expect(alreadyFull.accepted).toHaveLength(0);
    expect(alreadyFull.errors.join(' ')).toContain('up to 4 images');

    // A later selection must share the budget with images already in the composer.
    const nearLimit = validateFeedImageBatch([image('late.jpg', 6 * 1024 * 1024)], 2, 25 * 1024 * 1024);
    expect(nearLimit.accepted).toHaveLength(0);
    expect(nearLimit.errors.join(' ')).toContain('larger than 30 MB');

    const stillFits = validateFeedImageBatch([image('ok.jpg', 2 * 1024 * 1024)], 2, 25 * 1024 * 1024);
    expect(stillFits.accepted.map((file) => file.name)).toEqual(['ok.jpg']);
  });

  it('checks minimum and maximum dimensions', () => {
    expect(validateFeedImageDimensions(64, 64)).toBeNull();
    expect(validateFeedImageDimensions(31, 64)).toContain('at least 32');
    expect(validateFeedImageDimensions(12_001, 64)).toContain('at most 12,000');
    expect(validateFeedImageDimensions(Number.NaN, 64)).toContain('could not be read');
  });
});
