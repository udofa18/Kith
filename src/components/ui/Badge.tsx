import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  primary: 'border-primary/25 bg-primary/12 text-primary',
  success: 'border-success/25 bg-success/12 text-success',
  warning: 'border-warning/25 bg-warning/12 text-warning',
  danger: 'border-destructive/25 bg-destructive/12 text-destructive',
  info: 'border-info/25 bg-info/12 text-info',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
}

export function Badge({
  className,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-[0.14em]',
        size === 'sm' ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
