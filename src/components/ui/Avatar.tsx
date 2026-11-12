import { cn } from '../../lib/cn';
import { useLiveStatus } from '../../contexts/LiveStatusContext';
import LivePeek from '../live/LivePeek';

const statusTone = {
  online: 'bg-success',
  away: 'bg-warning',
  busy: 'bg-destructive',
  offline: 'bg-faint',
} as const;

export type AvatarStatus = keyof typeof statusTone;

/**
 * Round (or rounded-square for groups) image with a deterministic fallback.
 * Keeps the original API used across the app, plus optional presence + ring.
 */
export default function Avatar({
  src,
  seed,
  size = 40,
  square = false,
  alt = '',
  status,
  ring = false,
  className,
}: {
  src?: string | null;
  seed: string;
  size?: number;
  square?: boolean;
  alt?: string;
  status?: AvatarStatus;
  ring?: boolean;
  className?: string;
}) {
  const fallback = square
    ? `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}`
    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  const live = useLiveStatus().liveFor(seed);
  const showLiveWord = !!live && size >= 36;

  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
      title={live ? `Live now${live.title ? `: ${live.title}` : ''}` : undefined}
    >
      {live && (
        <span
          className={cn(
            'pointer-events-none absolute -inset-[3px] animate-pulse bg-red-500/25 blur-[3px]',
            square ? 'rounded-2xl' : 'rounded-full',
          )}
          aria-hidden
        />
      )}
      <img
        src={src && src.trim() !== '' ? src : fallback}
        alt={alt}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={(event) => {
          if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
        }}
        className={cn(
          'relative z-[1] h-full w-full bg-muted object-cover',
          square ? 'rounded-xl' : 'rounded-full',
          !live && ring && 'ring-2 ring-background',
        )}
      />
      {live ? (
        <>
          {/* The ring itself is the clickable trigger, so tapping a live avatar
              opens the session peek instead of only navigating to the profile. */}
          <LivePeek
            eventId={live.id}
            ariaLabel={`View live session${live.title ? `: ${live.title}` : ''}`}
            className={cn(
              'absolute inset-0 z-[3] cursor-pointer ring-2 ring-red-500 ring-offset-2 ring-offset-background transition-shadow focus:outline-none focus-visible:ring-primary',
              square ? 'rounded-xl' : 'rounded-full',
            )}
          />
          <span
            className={cn(
              'absolute z-[2] rounded-full border-2 border-background bg-red-500',
              showLiveWord
                ? '-bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2'
                : '-bottom-0.5 -right-0.5 h-2.5 w-2.5',
            )}
            aria-label="Live now"
          />
          {showLiveWord && (
            <span className="pointer-events-none absolute -bottom-3 left-1/2 z-[3] -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-[1px] text-[7px] font-black uppercase tracking-[0.14em] text-white shadow-lg">
              Live
            </span>
          )}
        </>
      ) : status ? (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
            statusTone[status],
          )}
          aria-label={status}
        />
      ) : null}
    </span>
  );
}
