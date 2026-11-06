import type { ReactNode } from 'react';
import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/cn';
import type { SaveState } from '../useSettings';

export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-card border border-border bg-surface shadow-soft', className)}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.03em] text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="divide-y divide-border/70 px-5 sm:px-6">{children}</div>
    </section>
  );
}

export function SettingRow({
  title,
  description,
  children,
  disabled = false,
  stacked = false,
  badge,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  stacked?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        disabled && 'opacity-55',
        className,
      )}
    >
      <div className="min-w-0 sm:max-w-[28rem]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
          {badge}
        </div>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className={cn('shrink-0', stacked ? 'w-full sm:max-w-sm' : '')}>{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative shrink-0 rounded-full border transition-colors duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        checked
          ? 'border-primary/40 bg-primary'
          : 'border-border-strong bg-muted',
        disabled && 'cursor-not-allowed',
        size === 'sm' ? 'h-6 w-10' : 'h-7 w-12',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
          checked
            ? size === 'sm'
              ? 'left-[1.2rem]'
              : 'left-[1.5rem]'
            : 'left-1',
          !checked && 'bg-foreground/75',
        )}
      />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  fullWidth = false,
  size = 'md',
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
  ariaLabel: string;
  fullWidth?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap gap-1 rounded-control border border-border bg-muted/40 p-1',
        fullWidth && 'w-full',
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex-1 rounded-[0.5rem] text-center font-semibold transition-colors duration-150 outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active
                ? 'bg-surface-raised text-foreground shadow-soft'
                : 'text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground',
              option.disabled && 'cursor-not-allowed opacity-50',
            )}
            title={option.hint}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingNote({
  tone = 'info',
  children,
  title,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: 'border-info/30 bg-info/8 text-foreground',
    warning: 'border-warning/35 bg-warning/10 text-foreground',
    danger: 'border-destructive/35 bg-destructive/8 text-foreground',
    success: 'border-success/30 bg-success/8 text-foreground',
  } as const;
  const Icon = tone === 'warning' || tone === 'danger' ? AlertTriangle : tone === 'success' ? Check : Info;
  const iconColor = {
    info: 'text-info',
    warning: 'text-warning',
    danger: 'text-destructive',
    success: 'text-success',
  } as const;

  return (
    <div className={cn('my-4 flex gap-2.5 rounded-control border p-3 text-xs leading-relaxed', styles[tone])}>
      <Icon size={15} className={cn('mt-0.5 shrink-0', iconColor[tone])} />
      <div>
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state.status === 'idle') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
        state.status === 'error'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-border bg-surface-raised text-muted-foreground',
      )}
      title={state.message}
    >
      {state.status === 'saving' && <Loader2 size={11} className="animate-spin" />}
      {state.status === 'saved' && <Check size={11} className="text-success" />}
      {state.status === 'error' && <AlertTriangle size={11} />}
      {state.status === 'saving' ? 'Saving' : state.status === 'saved' ? 'Saved' : 'Not saved'}
    </div>
  );
}

export function Subheading({ children }: { children: ReactNode }) {
  return (
    <p className="pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-faint first:pt-1">
      {children}
    </p>
  );
}
