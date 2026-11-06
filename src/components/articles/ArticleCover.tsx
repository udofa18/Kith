import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import KithStamp from '../KithStamp';
import {
  categoryIconFor,
  categoryMeta,
  categoryToneFor,
  isPlaceholderCover,
} from './articleVisuals';

interface ArticleCoverProps {
  src?: string | null;
  title?: string;
  categoryId?: string;
  seed?: string;
  className?: string;
  imgClassName?: string;
  /** Load eagerly for the LCP image (featured card / article hero). */
  priority?: boolean;
  showStamp?: boolean;
  /** Hide the small magazine wordmark on generated art. */
  hideWordmark?: boolean;
}

/**
 * The single image surface for the journal.
 *
 * Real cover photos are used when authored. Otherwise we draw a deterministic editorial
 * illustration from the category palette, so a missing image never looks like a hole in
 * the layout and the page still feels designed in both themes.
 */
export default function ArticleCover({
  src,
  title = '',
  categoryId,
  className,
  imgClassName,
  priority = false,
  showStamp = false,
  hideWordmark = false,
}: ArticleCoverProps) {
  const [failed, setFailed] = useState(false);
  const hasPhoto = !isPlaceholderCover(src) && !failed;
  const category = categoryMeta(categoryId);
  const tone = categoryToneFor(categoryId);
  const Icon = categoryIconFor(categoryId);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={cn('relative isolate overflow-hidden bg-surface', className)}>
      {hasPhoto ? (
        <img
          src={src as string}
          alt={title ? `Cover art for ${title}` : 'Article cover'}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: tone.gradient }} aria-hidden>
          <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.5),transparent_42%),radial-gradient(circle_at_88%_82%,rgba(14,11,19,0.55),transparent_58%)]" />

          <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full border border-[#ffffff]/20" />
          <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full border border-[#ffffff]/15" />
          <div className="absolute -bottom-16 -left-10 h-44 w-44 rotate-12 rounded-[2rem] border border-[#ffffff]/10 bg-[#ffffff]/[0.04]" />

          <Icon
            size={128}
            strokeWidth={1.1}
            className="absolute -bottom-5 right-2 text-[#ffffff]/20 sm:size-40"
          />

          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

          {!hideWordmark && (
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
              <span className="font-display text-[9px] font-bold uppercase tracking-[0.24em] text-[#ffffff]/75">
                {category?.name || 'Kith Journal'}
              </span>
              <span className="font-serif text-sm italic text-[#ffffff]/45">Kith Journal</span>
            </div>
          )}

          {showStamp && (
            <KithStamp className="absolute right-4 top-4 h-12 w-12 opacity-70" />
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10" />
    </div>
  );
}
