import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

interface StepLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
}

export default function StepLayout({
  title, subtitle, children, onBack, onSkip, primaryLabel, onPrimary, primaryDisabled, busy,
}: StepLayoutProps) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{title}</h1>
        <p className="text-white/50">{subtitle}</p>
      </div>

      {children}

      <div className="mt-10 flex items-center justify-between gap-4">
        {onBack ? (
          <button
            onClick={onBack}
            disabled={busy}
            className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-white/50 hover:text-white transition-colors disabled:opacity-40"
          >
            <ArrowLeft size={16} /> Back
          </button>
        ) : <span />}

        <div className="flex items-center gap-2">
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={busy}
              className="px-4 py-3 text-sm font-semibold text-white/50 hover:text-white transition-colors disabled:opacity-40"
            >
              Skip
            </button>
          )}
          <button
            onClick={onPrimary}
            disabled={primaryDisabled || busy}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <>{primaryLabel} <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
