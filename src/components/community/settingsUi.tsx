import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/** Shared building blocks for the settings pages: plain cards, label/hint rows and switches. */

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-foreground/10 bg-foreground/[0.02]">
      <header className="px-5 pt-4 pb-3 border-b border-foreground/10">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-foreground/55 mt-0.5">{description}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-foreground/20'}`}
    >
      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

export function SwitchRow({ title, hint, checked, onChange, disabled }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-sm text-foreground/55 mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

export const inputClass = 'w-full bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30';

/** Sits at the bottom of a settings page and only enables Save once something has changed. */
export function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel = 'Save changes', error }: {
  dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; saveLabel?: string; error?: string | null;
}) {
  return (
    <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-background/90 backdrop-blur border-t border-foreground/10 flex items-center justify-between gap-4">
      <p className={`text-sm ${error ? 'text-red-500' : 'text-foreground/55'}`}>{error || (dirty ? 'You have unsaved changes.' : 'All changes saved.')}</p>
      <div className="flex items-center gap-2">
        {dirty && <button onClick={onDiscard} disabled={saving} className="px-3 py-2 text-sm text-foreground/60 hover:text-foreground">Discard</button>}
        <button
          onClick={onSave} disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium flex items-center gap-2 disabled:opacity-40"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}{saveLabel}
        </button>
      </div>
    </div>
  );
}
