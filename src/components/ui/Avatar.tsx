import { cn } from '../../lib/cn';

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

  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
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
          'h-full w-full bg-muted object-cover',
          square ? 'rounded-xl' : 'rounded-full',
          ring && 'ring-2 ring-background',
        )}
      />
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background',
            statusTone[status],
          )}
          aria-label={status}
        />
      )}
    </span>
  );
}
