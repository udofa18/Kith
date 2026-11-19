/**
 * Sharp-based feed image processor.
 *
 * The uploaded original is never modified. This module only decodes it, validates the
 * real bytes, and produces WebP variants that fit inside fixed bounds without cropping
 * or upscaling. Animated images are reported as animated and deliberately receive no
 * variants, so the original GIF keeps its animation.
 */
import sharp from 'sharp';
import type { Metadata } from 'sharp';
import {
  FEED_MEDIA_FORMAT_BY_MIME,
  FEED_MEDIA_LIMITS,
  FEED_MEDIA_MIME_BY_FORMAT,
  FEED_MEDIA_VARIANTS,
  isAllowedFeedMime,
  planFeedVariants,
  type FeedMediaMime,
  type FeedVariantName,
  type FeedVariantSpec,
} from '../../../src/lib/media/config.js';

export type MediaErrorCode =
  | 'file_too_large'
  | 'invalid_image'
  | 'unsupported_format'
  | 'dimensions_too_small'
  | 'dimensions_too_large'
  | 'empty_file'
  | 'mime_mismatch'
  | 'invalid_path'
  | 'not_found'
  | 'forbidden'
  | 'conflict';

export class MediaError extends Error {
  code: MediaErrorCode;
  status: number;

  constructor(code: MediaErrorCode, message: string, status = 422) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.status = status;
  }
}

/** Remove EXIF/GPS by never calling `withMetadata()`. EXIF rotation is applied instead. */
sharp.cache(false);

export interface FeedImageInfo {
  format: string;
  mimeType: FeedMediaMime;
  declaredMime: string | null;
  /** Display dimensions after EXIF orientation is applied. */
  width: number;
  height: number;
  bytes: number;
  aspectRatio: number;
  hasAlpha: boolean;
  isAnimated: boolean;
  pages: number;
  orientation: number;
}

export interface RenderedVariant {
  name: FeedVariantName;
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  mimeType: 'image/webp';
}

export interface ProcessedImage {
  info: FeedImageInfo;
  variants: RenderedVariant[];
  placeholder: string | null;
}

function failOnError() {
  return { failOn: 'error' as const, limitInputPixels: FEED_MEDIA_LIMITS.maxDimension ** 2 };
}

/** Validates declared type, byte size, real decoded format and dimensions. */
export async function inspectFeedImage(
  buffer: Buffer,
  declaredMime?: string | null,
): Promise<FeedImageInfo> {
  if (buffer.length === 0) throw new MediaError('empty_file', 'That image is empty.');
  if (buffer.length > FEED_MEDIA_LIMITS.maxImageBytes) {
    throw new MediaError('file_too_large', 'That image is larger than 10 MB.', 413);
  }
  if (declaredMime && !isAllowedFeedMime(declaredMime)) {
    throw new MediaError(
      'unsupported_format',
      'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.',
    );
  }

  let metadata: Metadata;
  try {
    // `failOn: 'error'` makes truncated or malformed files fail instead of half-decoding.
    metadata = await sharp(buffer, { ...failOnError(), animated: true }).metadata();
  } catch {
    throw new MediaError('invalid_image', 'That file is not a valid image.');
  }

  const format = metadata.format;
  const mimeType = format ? FEED_MEDIA_MIME_BY_FORMAT[format] : undefined;
  if (!format || !mimeType) {
    throw new MediaError(
      'unsupported_format',
      'Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF.',
    );
  }

  // The declaration must agree with the bytes. A renamed file is rejected rather than
  // served under a misleading content type.
  if (declaredMime && FEED_MEDIA_FORMAT_BY_MIME[declaredMime as FeedMediaMime] !== format) {
    throw new MediaError(
      'mime_mismatch',
      'That file’s contents do not match its image type. Try re-exporting it.',
    );
  }

  const pages = Math.max(1, metadata.pages ?? 1);
  const rawWidth = metadata.width ?? 0;  // Animated GIF/WebP metadata reports the stacked height; the visible height is pageHeight.
  const rawHeight = pages > 1 ? (metadata.pageHeight ?? metadata.height ?? 0) : (metadata.height ?? 0);
  const orientation = metadata.orientation ?? 1;
  const swap = orientation >= 5 && orientation <= 8;
  const width = swap ? rawHeight : rawWidth;
  const height = swap ? rawWidth : rawHeight;

  if (!width || !height) {
    throw new MediaError('invalid_image', 'That image has no readable dimensions.');
  }
  if (width < FEED_MEDIA_LIMITS.minDimension || height < FEED_MEDIA_LIMITS.minDimension) {
    throw new MediaError(
      'dimensions_too_small',
      `Images must be at least ${FEED_MEDIA_LIMITS.minDimension} × ${FEED_MEDIA_LIMITS.minDimension} pixels.`,
    );
  }
  if (width > FEED_MEDIA_LIMITS.maxDimension || height > FEED_MEDIA_LIMITS.maxDimension) {
    throw new MediaError(
      'dimensions_too_large',
      `Images can be at most ${FEED_MEDIA_LIMITS.maxDimension} × ${FEED_MEDIA_LIMITS.maxDimension} pixels.`,
    );
  }

  return {
    format,
    mimeType,
    declaredMime: declaredMime ?? null,
    width,
    height,
    bytes: buffer.length,
    aspectRatio: width / height,
    hasAlpha: !!metadata.hasAlpha,
    isAnimated: pages > 1,
    pages,
    orientation,
  };
}

function variantPipeline(buffer: Buffer, spec: FeedVariantSpec, hasAlpha: boolean) {
  const pipeline = sharp(buffer, { ...failOnError(), animated: false })
    .rotate()
    .resize({
      width: spec.maxWidth,
      height: spec.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
    })
    .toColourspace('srgb');

  return hasAlpha
    ? pipeline.webp({ lossless: true, effort: 4 })
    : pipeline.webp({
        quality: spec.quality,
        alphaQuality: 100,
        smartSubsample: true,
        effort: 4,
      });
}

/** Generates variants in memory. Throwing here leaves the original untouched. */
export async function renderFeedVariants(
  buffer: Buffer,
  info: FeedImageInfo,
): Promise<RenderedVariant[]> {
  // Flattening an animated image would silently destroy it; serve the original instead.
  if (info.isAnimated) return [];

  const rendered: RenderedVariant[] = [];
  for (const spec of planFeedVariants(info.width, info.height)) {
    const { data, info: output } = await variantPipeline(buffer, spec, info.hasAlpha).toBuffer({
      resolveWithObject: true,
    });
    rendered.push({
      name: spec.name,
      buffer: data,
      width: output.width,
      height: output.height,
      bytes: output.size,
      mimeType: 'image/webp',
    });
  }
  return rendered;
}

/** Tiny blurred WebP data URI for the loading placeholder. Optional, never fatal. */
export async function renderFeedPlaceholder(buffer: Buffer): Promise<string | null> {
  try {
    const data = await sharp(buffer, { ...failOnError(), animated: false })
      .rotate()
      .resize({ width: 32, height: 32, fit: 'inside', withoutEnlargement: true })
      .blur(6)
      .webp({ quality: 40 })
      .toBuffer();
    return `data:image/webp;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Full in-memory processing pass used by the service and by tests. */
export async function processFeedImageBuffer(
  buffer: Buffer,
  declaredMime?: string | null,
): Promise<ProcessedImage> {
  const info = await inspectFeedImage(buffer, declaredMime);
  const variants = await renderFeedVariants(buffer, info);
  const placeholder = await renderFeedPlaceholder(buffer);
  return { info, variants, placeholder };
}

export const feedVariantSpecs = FEED_MEDIA_VARIANTS;
