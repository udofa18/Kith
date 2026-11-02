import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'soft'
  | 'danger'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-glow-primary hover:bg-[var(--ds-primary-hover)] active:translate-y-px',
  secondary:
    'border border-border bg-surface-raised text-foreground hover:border-border-strong hover:bg-muted',
  outline:
    'border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  soft: 'bg-primary/12 text-primary hover:bg-primary/18',
  danger:
    'bg-destructive text-destructive-foreground shadow-soft hover:brightness-110 active:translate-y-px',
  link: 'h-auto p-0 text-primary underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-10 w-10 p-0',
  'icon-sm': 'h-8 w-8 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * The single button primitive for product UI.
 * Use `primary` for the one main action on a surface, `secondary`/`outline`
 * for supporting actions, and `ghost` inside dense toolbars.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold tracking-[-0.01em]',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
