import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';

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
    <header className="sticky top-0 z-30 flex min-h-[53px] items-center gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur-md">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={goBack}
        aria-label="Go back"
        className="shrink-0"
      >
        <ArrowLeft size={18} />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-semibold leading-tight tracking-[-0.03em] text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </header>
  );
}
