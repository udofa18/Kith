import { useEffect, useRef, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import FeedImage from '../media/FeedImage';
import {
  FEED_GRID_TILE_SIZES,
  FEED_SINGLE_IMAGE_SIZES,
} from '../../lib/media/delivery';
import type { FeedPostImage, FeedPostMedia } from '../../lib/media/types';

/**
 * Post image/video gallery.
 * - 1 item fills the post width at its natural aspect ratio (X-style: square stays square,
 *   portrait stays tall and uncropped); 2–4 use a tiled grid; 5+ shows "+N".
 * - Single videos keep their own ratio inside a black player; they are never squashed.
 * - Images use pre-generated responsive variants; off-screen images lazy-load.
 * - Broken images become a quiet placeholder instead of alt text.
 * - Videos only play while the card is on screen (`active`).
 */
export default function PostMedia({ media, active, onOpenImage, priority = false, canRetry = false, onRetryImage, embedded = false }: {
  media: FeedPostMedia[];
  active: boolean;
  onOpenImage: (url: string) => void;
  /** The first images above the fold load eagerly instead of lazily. */
  priority?: boolean;
  /** Only the post author can regenerate failed variants. */
  canRetry?: boolean;
  onRetryImage?: (image: FeedPostImage) => void;
  /** Inside a quoted-post card: drop the outer margin/border so it reads as one card. */
  embedded?: boolean;
}) {
  const items = (media || []).filter(
    (m) => m?.url || (m && 'variants' in m && m.variants && Object.keys(m.variants).length > 0),
  );
  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <div
        className={`relative overflow-hidden ${
          embedded
            ? 'rounded-xl bg-black/5 dark:bg-white/5'
            : 'mt-3 rounded-2xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <Tile
          item={items[0]}
          index={0}
          active={active}
          onOpenImage={onOpenImage}
          priority={priority}
          canRetry={canRetry}
          onRetryImage={onRetryImage}
          single
        />
      </div>
    );
  }

  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const layout =
    shown.length === 2 ? 'grid-cols-2 aspect-[16/9]' :
    shown.length === 3 ? 'grid-cols-2 grid-rows-2 aspect-[16/10]' :
    'grid-cols-2 grid-rows-2 aspect-[16/10]';

  return (
    <div
      className={`grid gap-0.5 overflow-hidden ${
        embedded
          ? 'rounded-xl'
          : 'mt-3 rounded-2xl border border-black/10 dark:border-white/10'
      } ${layout}`}
      onClick={(e) => e.stopPropagation()}
    >
      {shown.map((item, i) => (
        <div key={i} className={`relative min-h-0 ${shown.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
          <Tile
            item={item}
            index={i}
            active={active}
            onOpenImage={onOpenImage}
            priority={priority && i === 0}
            canRetry={canRetry}
            onRetryImage={onRetryImage}
          />
          {extra > 0 && i === shown.length - 1 && (
            <button
              onClick={() => onOpenImage(item.url)}
              className="absolute inset-0 bg-black/50 text-white text-2xl font-semibold flex items-center justify-center"
            >
              +{extra}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Tile({ item, index, active, onOpenImage, priority, canRetry, onRetryImage, single = false }: {
  item: FeedPostMedia;
  index: number;
  active: boolean;
  onOpenImage: (url: string) => void;
  priority: boolean;
  canRetry: boolean;
  onRetryImage?: (image: FeedPostImage) => void;
  single?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [videoRatio, setVideoRatio] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => { /* autoplay can be blocked; controls remain */ });
    else video.pause();
  }, [active]);

  if (broken || !item.url) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center gap-2 bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 ${single ? 'aspect-video' : ''}`}>
        <ImageOff size={22} />
        <span className="text-xs">Media unavailable</span>
      </div>
    );
  }

  if (item.type === 'video') {
    return (
      <video
        ref={videoRef}
        src={item.url}
        muted
        loop
        playsInline
        controls
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onError={() => setBroken(true)}
        onLoadedMetadata={(e) => {
          const { videoWidth, videoHeight } = e.currentTarget;
          if (videoWidth > 0 && videoHeight > 0) setVideoRatio(videoWidth / videoHeight);
        }}
        style={single ? { aspectRatio: videoRatio ?? 16 / 9 } : undefined}
        className={`w-full bg-black ${single ? 'object-contain' : 'h-full object-cover'}`}
      />
    );
  }

  const retryable = canRetry && item.type === 'image' && item.status === 'failed' && !!item.mediaId && !!onRetryImage;
  return (
    <>
      <FeedImage
        image={item}
        cssWidth={single ? 640 : 320}
        sizes={single ? FEED_SINGLE_IMAGE_SIZES : FEED_GRID_TILE_SIZES}
        alt={item.alt?.trim() || 'Post image'}
        priority={priority}
        onError={() => setBroken(true)}
        onClick={() => onOpenImage(item.url)}
        className={
          single
            ? 'block h-auto w-full cursor-zoom-in'
            : 'h-full w-full cursor-zoom-in object-cover'
        }
      />
      {retryable && item.type === 'image' && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetryImage?.(item);
          }}
          title="Retry image optimization"
          aria-label="Retry image optimization"
          className={`absolute z-10 flex items-center gap-1.5 rounded-full bg-black/70 text-white backdrop-blur-sm transition-colors hover:bg-black ${
            single ? 'bottom-2 left-2 px-2.5 py-1.5 text-[11px] font-medium' : 'bottom-1.5 right-1.5 p-1.5'
          }`}
        >
          <RefreshCw size={single ? 12 : 13} />
          {single && 'Retry optimization'}
        </button>
      )}
    </>
  );
}
