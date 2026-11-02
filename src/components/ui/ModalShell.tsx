import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';

export const fieldLabel = 'text-sm font-medium';
export const fieldInput =
  'mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/10 dark:border-white/15 outline-none focus:border-primary text-sm placeholder:text-black/35 dark:placeholder:text-white/35';

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
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full h-full sm:h-auto sm:max-h-[92vh] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} flex flex-col bg-background text-black dark:text-white sm:rounded-3xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden`}>
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-black/10 dark:border-white/10">
          <button onClick={onBack ?? onClose} disabled={busy} aria-label={onBack ? 'Back' : 'Close'} className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40">
            {onBack ? <ArrowLeft size={20} /> : <X size={20} />}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-xs text-black/50 dark:text-white/50 truncate">{subtitle}</p>}
          </div>
          {steps > 1 && (
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: steps }).map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : i < step ? 'w-3 bg-primary/50' : 'w-3 bg-black/15 dark:bg-white/20'}`} />
              ))}
            </div>
          )}
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto ${aside ? 'grid lg:grid-cols-[1fr_280px]' : ''}`}>
          <div className="p-4 sm:p-6 space-y-5">{children}</div>
          {aside && <aside className={`${asideOnMobile ? 'block' : 'hidden'} lg:block p-4 sm:p-6 lg:pl-0`}>{aside}</aside>}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-black/10 dark:border-white/10 pb-[max(12px,env(safe-area-inset-bottom))]">
          <p className="text-xs text-black/50 dark:text-white/50 min-w-0 truncate">{status}</p>
          <div className="flex gap-2 shrink-0">{footer}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const ghostBtn = 'px-4 py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40';
export const primaryBtn = 'px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors';
