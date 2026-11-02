import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A titled card used in the feed's side rails. */
export default function RailSection({ title, action, children }: {
  title: string;
  action?: { label: string; to: string };
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/2 overflow-hidden">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-[15px] font-bold">{title}</h2>
        {action && (
          <Link to={action.to} className="text-sm text-primary hover:underline">
            {action.label}
          </Link>
        )}
      </header>
      <div className="pb-2">{children}</div>
    </section>
  );
}

/** Row inside a RailSection: full-width, hoverable, consistent padding. */
export function RailRow({ children, to, onClick }: { children: ReactNode; to?: string; onClick?: () => void }) {
  const className = 'flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors';
  if (to) return <Link to={to} className={className}>{children}</Link>;
  if (onClick) return <button onClick={onClick} className={className}>{children}</button>;
  return <div className={className}>{children}</div>;
}

export function RailEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-sm text-black/40 dark:text-white/40">{children}</p>;
}
