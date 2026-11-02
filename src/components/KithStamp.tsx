import { useId } from 'react';

/**
 * Small rotating seal used as an editorial accent on the landing and auth pages.
 * The text is intentionally decorative, so the wrapper is hidden from assistive tech.
 */
export default function KithStamp({
  className = '',
  label = 'MAKE ROOM FOR YOUR PEOPLE · KITH ·',
  color = 'rgba(247,242,232,0.5)',
  center = '#ff6b4a',
  mark = '#0e0b13',
}: {
  className?: string;
  label?: string;
  color?: string;
  center?: string;
  mark?: string;
}) {
  const pathId = useId();

  return (
    <div className={`landing-spin-slow ${className}`} aria-hidden>
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <defs>
          <path
            id={pathId}
            d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"
          />
        </defs>
        <text fill={color} style={{ fontSize: 8, letterSpacing: 3.1, fontWeight: 600 }}>
          <textPath href={`#${pathId}`}>{label}</textPath>
        </text>
        <circle cx="60" cy="60" r="13" fill={center} />
        <path
          d="M60 51.5l2.7 6.3 6.8 2.2-6.8 2.2L60 68.5l-2.7-6.3-6.8-2.2 6.8-2.2z"
          fill={mark}
        />
      </svg>
    </div>
  );
}
