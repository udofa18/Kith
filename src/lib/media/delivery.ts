/**
 * Responsive delivery for feed media.
 *
 * Variant URLs are derived from stored storage paths (the database never stores public
 * URLs). The feed always prefers the pre-generated variants; Supabase Image
 * Transformations are only used when explicitly enabled and a caller asks for an
 * uncommon size. If transformations are unavailable nothing breaks: callers fall back
 * to the nearest generated variant or the original.
 */
import {
  FEED_MEDIA_BUCKET,
  FEED_MEDIA_VARIANTS,
  type FeedVariantName,
  type FeedVariantSpec,
} from './config';
import type { FeedImageLike, FeedMediaVariant, FeedMediaVariants } from './types';

function supabaseBase(): string | undefined {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
}

/** Feed column is capped at 640px; phones render it edge to edge. */
export const FEED_SINGLE_IMAGE_SIZES = '(max-width: 700px) calc(100vw - 28px), 640px';
export const FEED_GRID_TILE_SIZES = '(max-width: 700px) 50vw, 320px';

export function publicStorageUrl(bucket: string, path: string): string {
  const base = supabaseBase();
  if (!base) throw new Error('Supabase is not configured');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
}

export function feedMediaVariantUrl(path: string): string {
  return publicStorageUrl(FEED_MEDIA_BUCKET, path);
}

/** Dynamic transforms stay off unless the Supabase plan/storage config enables them. */
export function supabaseImageTransformsEnabled(): boolean {
  return String(import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORMATIONS ?? '').toLowerCase() === 'true';
}

/**
 * Supabase render endpoint for uncommon widths. Stable parameters only, so the CDN can
 * cache each size.
 */
export function supabaseTransformUrl(
  originalPath: string,
  width: number,
  quality = 78,
): string {
  const base = supabaseBase();
  if (!base) throw new Error('Supabase is not configured');
  const encoded = originalPath.split('/').map(encodeURIComponent).join('/');
  const params = new URLSearchParams({
    width: String(Math.max(1, Math.round(width))),
    quality: String(quality),
    resize: 'contain',
  });
  return `${base}/storage/v1/render/image/public/${encodeURIComponent(FEED_MEDIA_BUCKET)}/${encoded}?${params.toString()}`;
}

const SPEC_BY_NAME = new Map<FeedVariantName, FeedVariantSpec>(
  FEED_MEDIA_VARIANTS.map((spec) => [spec.name, spec]),
);

/** Variants that actually exist for this image, ordered smallest to largest. */
export function orderedFeedVariants(
  variants: FeedMediaVariants | null | undefined,
): Array<FeedMediaVariant & { name: FeedVariantName }> {
  if (!variants) return [];
  return (Object.entries(variants) as Array<[FeedVariantName, FeedMediaVariant | undefined]>)
    .filter((entry): entry is [FeedVariantName, FeedMediaVariant] => !!entry[1]?.path)
    .map(([name, variant]) => ({ name, ...variant }))
    .sort((a, b) => a.width - b.width || a.height - b.height);
}

/**
 * Closest variant for the space the image will occupy, accounting for device pixel ratio.
 * Never returns a larger variant than needed when a smaller one covers the width.
 */
export function selectFeedVariant(
  variants: FeedMediaVariants | null | undefined,
  cssWidth: number,
  dpr = 1,
): (FeedMediaVariant & { name: FeedVariantName }) | null {
  const ordered = orderedFeedVariants(variants);
  if (ordered.length === 0) return null;
  const needed = Math.max(1, Math.round(cssWidth * Math.max(1, dpr)));
  return ordered.find((variant) => variant.width >= needed) ?? ordered[ordered.length - 1];
}

export function feedImageAspectRatio(image: FeedImageLike): number {
  const explicit = Number(image.aspectRatio);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const width = Number(image.width);
  const height = Number(image.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height;
  }
  return 16 / 9;
}

export interface FeedImageSources {
  src: string;
  srcSet?: string;
  width?: number;
  height?: number;
  aspectRatio: number;
  /** Ordered fallbacks tried when the selected source fails to load. */
  fallbacks: string[];
  /** True when a real pre-generated variant was used for the main source. */
  usesVariant: boolean;
}

/**
 * Builds the `src`/`srcSet` pair for a feed image.
 *
 * `cssWidth` is the rendered width in CSS pixels. It only decides the default `src`;
 * the browser picks from `srcSet` using the actual layout width and DPR via `sizes`.
 */
export function buildFeedImageSources(
  image: FeedImageLike,
  options: {
    cssWidth: number;
    sizes: string;
    dpr?: number;
    allowTransforms?: boolean;
  },
): FeedImageSources {
  const aspectRatio = feedImageAspectRatio(image);
  const ordered = orderedFeedVariants(image.variants);
  const fallbacks: string[] = [];

  if (ordered.length > 0) {
    const srcSet = ordered
      .map((variant) => `${feedMediaVariantUrl(variant.path)} ${variant.width}w`)
      .join(', ');
    const selected = selectFeedVariant(image.variants, options.cssWidth, options.dpr ?? 1) ?? ordered[0];
    const largest = ordered[ordered.length - 1];
    for (const variant of ordered) fallbacks.push(feedMediaVariantUrl(variant.path));
    if (image.url) fallbacks.push(image.url);
    return {
      src: feedMediaVariantUrl(selected.path),
      srcSet,
      width: selected.width,
      height: selected.height,
      aspectRatio,
      fallbacks: [...new Set(fallbacks)],
      usesVariant: true,
    };
  }

  // Legacy or failed media: the original still renders. If transforms are enabled and
  // the original path is known, offer a dynamic candidate without depending on it.
  if (image.url) fallbacks.push(image.url);
  let src = image.url;
  let srcSet: string | undefined;
  if (options.allowTransforms && supabaseImageTransformsEnabled() && image.path) {
    const widths = [320, 640, 960, 1600];
    try {
      srcSet = widths
        .map((width) => `${supabaseTransformUrl(image.path!, width)} ${width}w`)
        .join(', ');
      src = supabaseTransformUrl(image.path, options.cssWidth * (options.dpr ?? 1));
    } catch {
      // Missing configuration must never stop the image from rendering.
      srcSet = undefined;
      src = image.url;
    }
  }

  return {
    src,
    srcSet,
    width: Number(image.width) || undefined,
    height: Number(image.height) || undefined,
    aspectRatio,
    fallbacks: [...new Set(fallbacks.filter((url) => url !== src))],
    usesVariant: false,
  };
}

/** Preserves the pre-generated fallback chain for retry/error handling. */
export function nearestFeedVariantUrl(
  variants: FeedMediaVariants | null | undefined,
  cssWidth: number,
  dpr = 1,
): string | null {
  const variant = selectFeedVariant(variants, cssWidth, dpr);
  return variant ? feedMediaVariantUrl(variant.path) : null;
}

/** Exposes the variant spec so UI code can label or debug delivery decisions. */
export function feedVariantSpec(name: FeedVariantName): FeedVariantSpec | null {
  return SPEC_BY_NAME.get(name) ?? null;
}
