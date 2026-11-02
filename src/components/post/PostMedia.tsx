import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface MediaItem {
  type: 'image' | 'video';
  url: string;
}

/**
 * Post image/video gallery.
 * - 1 item keeps its natural aspect ratio (capped height); 2–4 use a tiled grid; 5+ shows "+N".
 * - Broken images become a quiet placeholder instead of alt text.
 * - Videos only play while the card is on screen (`active`).
 */
export default function PostMedia({ media, active, onOpenImage }: {
  media: MediaItem[];
  active: boolean;
  onOpenImage: (url: string) => void;
}) {
  const items = media.filter(m => m?.url && m.url.trim() !== '');
  if (items.length === 0) return null;

  if (items.length === 1) {
    return (
      <div className="mt-3 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10" onClick={e => e.stopPropagation()}>
        <Tile item={items[0]} active={active} onOpenImage={onOpenImage} single />
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
      className={`mt-3 grid gap-0.5 rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 ${layout}`}
      onClick={e => e.stopPropagation()}
    >
      {shown.map((item, i) => (
        <div key={i} className={`relative min-h-0 ${shown.length === 3 && i === 0 ? 'row-span-2' : ''}`}>
          <Tile item={item} active={active} onOpenImage={onOpenImage} />
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

function Tile({ item, active, onOpenImage, single = false }: {
  item: MediaItem;
  active: boolean;
  onOpenImage: (url: string) => void;
  single?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => { /* autoplay can be blocked; controls remain */ });
    else video.pause();
  }, [active]);

  if (broken) {
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
        onContextMenu={e => e.preventDefault()}
        onError={() => setBroken(true)}
        className={`w-full bg-black ${single ? 'max-h-[560px]' : 'h-full object-cover'}`}
      />
    );
  }

  return (
    <img
      src={item.url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      onClick={() => onOpenImage(item.url)}
      className={`w-full cursor-zoom-in bg-black/5 dark:bg-white/5 ${single ? 'h-auto max-h-[560px] object-cover' : 'h-full object-cover'}`}
    />
  );
}
