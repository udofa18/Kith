export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Any day, the next 7 days (with how many events each), and Later. */
export default function DateStrip({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Map<string, number> }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
  const tile = (active: boolean) => `shrink-0 flex flex-col items-center justify-center min-w-[64px] px-3 py-2.5 rounded-2xl transition-all ${
    active ? 'text-white shadow-lg shadow-pink-500/25 scale-105' : 'bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10'
  }`;
  const fill = (active: boolean) => (active ? { background: 'linear-gradient(135deg,#EC4899,#F97316)' } : undefined);

  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar py-1" role="tablist" aria-label="Date">
      <button role="tab" aria-selected={value === 'any'} onClick={() => onChange('any')} className={tile(value === 'any')} style={fill(value === 'any')}>
        <span className="text-[11px] font-semibold uppercase opacity-80">All</span><span className="text-sm font-bold">Any day</span>
      </button>
      {days.map((d, i) => {
        const k = dayKey(d);
        const n = counts.get(k) ?? 0;
        const on = value === k;
        return (
          <button key={k} role="tab" aria-selected={on} onClick={() => onChange(k)} className={tile(on)} style={fill(on)}>
            <span className="text-[11px] font-semibold uppercase opacity-80">{i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="text-xl font-extrabold font-display leading-tight">{d.getDate()}</span>
            <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${n ? (on ? 'bg-white' : 'bg-pink-500') : 'bg-transparent'}`} title={n ? `${n} events` : undefined} />
          </button>
        );
      })}
      <button role="tab" aria-selected={value === 'later'} onClick={() => onChange('later')} className={tile(value === 'later')} style={fill(value === 'later')}>
        <span className="text-[11px] font-semibold uppercase opacity-80">After</span><span className="text-sm font-bold">Later</span>
      </button>
    </div>
  );
}
