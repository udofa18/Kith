import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface/60 px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary">
          {icon}
        </span>
      )}
      <p className="font-display text-base font-semibold tracking-[-0.03em] text-foreground">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
