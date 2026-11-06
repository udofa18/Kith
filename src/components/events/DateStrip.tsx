export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Any day, the next 7 days (with how many events each), and Later. */
export default function DateStrip({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Map<string, number> }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const base = 'group flex shrink-0 flex-col items-center justify-center min-w-[58px] rounded-[18px] px-3 py-2.5 transition-all';
  const idle = 'text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground';
  const active = 'bg-foreground text-background shadow-soft';

  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-1 no-scrollbar sm:mx-0 sm:px-0" role="tablist" aria-label="Date">
      <button role="tab" aria-selected={value === 'any'} onClick={() => onChange('any')} className={`${base} ${value === 'any' ? active : idle}`}>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-55">Any</span>
        <span className="mt-0.5 text-[13px] font-semibold">Day</span>
      </button>
      {days.map((d, i) => {
        const k = dayKey(d);
        const n = counts.get(k) ?? 0;
        const on = value === k;
        return (
          <button key={k} role="tab" aria-selected={on} onClick={() => onChange(k)} className={`${base} ${on ? active : idle}`}>
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-55">
              {i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            <span className="mt-0.5 font-display text-[18px] font-semibold leading-none tracking-[-0.04em]">{d.getDate()}</span>
            <span className={`mt-1.5 h-1 w-1 rounded-full ${n ? (on ? 'bg-background' : 'bg-primary') : 'bg-transparent'}`} title={n ? `${n} events` : undefined} />
          </button>
        );
      })}
      <button role="tab" aria-selected={value === 'later'} onClick={() => onChange('later')} className={`${base} ${value === 'later' ? active : idle}`}>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-55">After</span>
        <span className="mt-0.5 text-[13px] font-semibold">Later</span>
      </button>
    </div>
  );
}
