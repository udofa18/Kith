import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

const sizeClasses = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizeClasses;
  className?: string;
  hideClose?: boolean;
}

/**
 * Accessible modal primitive: portal, Escape/backdrop close, scroll lock,
 * focus return, and a consistent warm surface.
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  hideClose = false,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    const frame = requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            key="dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
            className="absolute inset-0 bg-[#0e0b13]/55 backdrop-blur-sm"
          />

          <motion.div
            key="dialog-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-panel border border-border bg-surface-raised text-foreground shadow-float outline-none sm:rounded-panel',
              sizeClasses[size],
              className,
            )}
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="font-display text-lg font-semibold leading-tight tracking-[-0.035em] text-foreground"
                >
                  {title}
                </h2>
                {description && (
                  <p
                    id={descriptionId}
                    className="mt-1 text-sm leading-relaxed text-muted-foreground"
                  >
                    {description}
                  </p>
                )}
              </div>
              {!hideClose && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="-mr-1.5 shrink-0"
                >
                  <X size={16} />
                </Button>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
