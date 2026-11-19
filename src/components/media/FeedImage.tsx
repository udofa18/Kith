import { useEffect, useMemo, useState } from 'react';
import {
  buildFeedImageSources,
  type FeedImageSources,
} from '../../lib/media/delivery';
import type { FeedImageLike } from '../../lib/media/types';

export interface FeedImageProps {
  image: FeedImageLike;
  /** Rendered width in CSS pixels; used to choose the default source (not the breakpoint). */
  cssWidth: number;
  sizes: string;
  alt?: string;
  className?: string;
  /** Above-the-fold images should load eagerly; everything else is lazy. */
  priority?: boolean;
  onClick?: () => void;
  /** Called only after every candidate (variants and the original) has failed. */
  onError?: () => void;
}

function devicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(3, Math.max(1, window.devicePixelRatio || 1));
}

/**
 * Responsive feed image.
 *
 * Uses native `srcSet`/`sizes` (there is no Next.js image runtime in this app), so the
 * browser selects the variant from measured layout width and DPR. Pre-generated variants
 * are used first; the untouched original is only a fallback and the full-resolution view.
 */
export default function FeedImage({
  image,
  cssWidth,
  sizes,
  alt = '',
  className = '',
  priority = false,
  onClick,
  onError,
}: FeedImageProps) {
  const sources = useMemo<FeedImageSources>(
    () => buildFeedImageSources(image, { cssWidth, sizes, dpr: devicePixelRatio(), allowTransforms: true }),
    [image, cssWidth, sizes],
  );

  const [fallback, setFallback] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A changed variant set (e.g. after a retry) must start from its primary source again.
  useEffect(() => {
    setFallback(null);
    setExhausted(false);
    setLoaded(false);
  }, [sources.src, sources.srcSet]);

  if (exhausted) return null;

  const src = fallback ?? sources.src;
  const placeholder = !loaded && image.placeholder ? image.placeholder : null;
  const width = sources.width ?? (Number(image.width) || undefined);
  const height = sources.height ?? (Number(image.height) || undefined);

  return (
    <img
      src={src}
      srcSet={!fallback ? sources.srcSet : undefined}
      sizes={!fallback ? sizes : undefined}
      width={width}
      height={height}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      referrerPolicy="no-referrer"
      onClick={onClick}
      onLoad={() => setLoaded(true)}
      onError={() => {
        // Walk through the variant chain, then the original, before giving up.
        const index = fallback ? sources.fallbacks.indexOf(fallback) : -1;
        const next = sources.fallbacks[index + 1];
        if (next) {
          setFallback(next);
          return;
        }
        setExhausted(true);
        onError?.();
      }}
      style={{
        // Known dimensions reserve the exact space. Legacy posts have none, so use a
        // temporary 16:9 box while loading and then follow the image's real ratio.
        aspectRatio:
          width && height ? `${width} / ${height}` : loaded ? undefined : '16 / 9',
        backgroundImage: placeholder ? `url("${placeholder}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      className={className}
    />
  );
}
