import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Sticky header with a back button; content scrolls underneath it.
 * Goes back in history when there is in-app history, otherwise to `fallback`.
 */
export default function PageHeader({ title, subtitle, fallback = '/feed', children }: {
  title: ReactNode;
  subtitle?: ReactNode;
  fallback?: string;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2 min-h-[53px] bg-background/85 backdrop-blur-md border-b border-black/10 dark:border-white/10">
      <button
        onClick={goBack}
        aria-label="Go back"
        className="p-2 rounded-full text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-black/50 dark:text-white/50 truncate">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
