import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

const fieldBase =
  'w-full rounded-control border border-border bg-surface px-4 text-sm text-foreground outline-none transition-colors placeholder:text-faint hover:border-border-strong focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'h-11',
        invalid && 'border-destructive focus:border-destructive focus:ring-destructive/10',
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'min-h-[120px] resize-y py-3 leading-relaxed',
        invalid && 'border-destructive focus:border-destructive focus:ring-destructive/10',
        className,
      )}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, style, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        fieldBase,
        'h-11 cursor-pointer appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat pr-10',
        invalid && 'border-destructive focus:border-destructive focus:ring-destructive/10',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const id = htmlFor || generatedId;

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
        >
          {label}
        </label>
        {optional && (
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">
            Optional
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
