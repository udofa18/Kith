import type { ReactNode } from 'react';
import { emojiFor } from '../../lib/eventCategories';
import { themeGradient } from '../../lib/eventTheme';
import { cn } from '../../lib/cn';

export const hasEventBanner = (event?: { banner?: string } | null) =>
  !!event?.banner && event.banner.trim() !== '' && !event.banner.includes('picsum.photos');

/** Poster image with the event's deterministic vibe gradient as a graceful fallback. */
export default function EventCover({
  event,
  className,
  imgClassName,
  children,
}: {
  event: any;
  className?: string;
  imgClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('relative overflow-hidden bg-[#211a28]', className)}>
      {hasEventBanner(event) ? (
        <img
          src={event.banner}
          alt=""
          referrerPolicy="no-referrer"
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: themeGradient(event) }}>
          <span className="absolute -right-4 -top-5 select-none text-[8rem] leading-none opacity-20" aria-hidden>
            {emojiFor(event?.category)}
          </span>
          <span className="absolute -bottom-10 -left-6 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        </div>
      )}
      {children}
    </div>
  );
}
