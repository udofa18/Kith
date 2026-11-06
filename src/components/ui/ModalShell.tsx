import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';

export const fieldLabel = 'text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground';
export const fieldInput =
  'mt-1.5 w-full rounded-control bg-surface px-4 py-2.5 border border-border outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm text-foreground placeholder:text-faint transition-colors';

/**
 * Dialog used by the create flows: full screen on mobile, header with back + step dots,
 * optional preview aside, sticky footer. Same look as CreateCommunityModal.
 */
export default function ModalShell({ title, subtitle, step = 0, steps = 0, busy = false, onBack, onClose, aside, asideOnMobile = false, status, footer, wide = true, children }: {
  title: string;
  subtitle?: string;
  step?: number;
  steps?: number;
  busy?: boolean;
  onBack?: () => void;
  onClose: () => void;
  aside?: ReactNode;
  asideOnMobile?: boolean;
  status?: ReactNode;
  footer: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full h-full sm:h-auto sm:max-h-[92vh] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} flex flex-col bg-background text-foreground sm:rounded-panel sm:border border-border shadow-float overflow-hidden`}>
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border">
          <button onClick={onBack ?? onClose} disabled={busy} aria-label={onBack ? 'Back' : 'Close'} className="p-2 -ml-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors">
            {onBack ? <ArrowLeft size={20} /> : <X size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {steps > 1 && (
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: steps }).map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : i < step ? 'w-3 bg-primary/50' : 'w-3 bg-muted'}`} />
              ))}
            </div>
          )}
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto ${aside ? 'grid lg:grid-cols-[1fr_280px]' : ''}`}>
          <div className="p-4 sm:p-6 space-y-5">{children}</div>
          {aside && <aside className={`${asideOnMobile ? 'block' : 'hidden'} lg:block p-4 sm:p-6 lg:pl-0`}>{aside}</aside>}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border pb-[max(12px,env(safe-area-inset-bottom))]">
          <p className="text-xs text-muted-foreground min-w-0 truncate">{status}</p>
          <div className="flex gap-2 shrink-0">{footer}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const ghostBtn = 'px-4 py-2 rounded-full border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-40 transition-colors';
export const primaryBtn = 'px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-[var(--ds-primary-hover)] disabled:opacity-40 transition-colors';
