import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from './Card';

/** A titled card used in the feed's side rails. */
export default function RailSection({ title, action, children }: {
  title: string;
  action?: { label: string; to: string };
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.03em] text-foreground">
          {title}
        </h2>
        {action && (
          <Link
            to={action.to}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {action.label}
          </Link>
        )}
      </header>
      <div className="pb-2">{children}</div>
    </Card>
  );
}

/** Row inside a RailSection: full-width, hoverable, consistent padding. */
export function RailRow({ children, to, onClick }: { children: ReactNode; to?: string; onClick?: () => void }) {
  const className =
    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted';
  if (to) return <Link to={to} className={className}>{children}</Link>;
  if (onClick) return <button onClick={onClick} className={className}>{children}</button>;
  return <div className={className}>{children}</div>;
}

export function RailEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}
