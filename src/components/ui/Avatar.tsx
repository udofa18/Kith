/** Round (or rounded-square for groups) image with a deterministic fallback. */
export default function Avatar({ src, seed, size = 40, square = false, alt = '' }: {
  src?: string | null;
  seed: string;
  size?: number;
  square?: boolean;
  alt?: string;
}) {
  const fallback = square
    ? `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}`
    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  return (
    <img
      src={src && src.trim() !== '' ? src : fallback}
      alt={alt}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={e => { if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback; }}
      className={`shrink-0 object-cover bg-black/5 dark:bg-white/10 ${square ? 'rounded-xl' : 'rounded-full'}`}
      style={{ width: size, height: size }}
    />
  );
}
