import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type CardVariant = 'default' | 'elevated' | 'outline' | 'ghost';

const variantClasses: Record<CardVariant, string> = {
  default: 'border-border bg-surface shadow-soft',
  elevated: 'border-border bg-surface-raised shadow-lift',
  outline: 'border-border bg-transparent',
  ghost: 'border-transparent bg-transparent',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ className, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-card border text-foreground', variantClasses[variant], className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        'font-display text-lg font-semibold leading-tight tracking-[-0.035em] text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 p-5 pt-0', className)} {...props} />;
}

export function CardEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </p>
  );
}
