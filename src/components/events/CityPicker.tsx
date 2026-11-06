import { useMemo, useState } from 'react';
import { Check, ChevronDown, Crosshair, Globe, MapPin, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';

export type CityValue = 'all' | 'online' | string;

interface Props {
  value: CityValue;
  onChange: (v: CityValue) => void;
  cities: { name: string; count: number }[];
  onlineCount: number;
  /** Resolve a point to the nearest city that has events. */
  locate: (p: { lat: number; lng: number }) => string | null;
}

/** "📍 Lagos ▾" pill that opens a searchable city list. */
export default function CityPicker({ value, onChange, cities, onlineCount, locate }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const shown = useMemo(() => cities.filter(c => c.name.toLowerCase().includes(q.trim().toLowerCase())), [cities, q]);
  const label = value === 'all' ? 'Anywhere' : value === 'online' ? 'Online' : value;

  const pick = (v: CityValue) => { onChange(v); setOpen(false); setQ(''); };
  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Location isn’t available in this browser');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const city = locate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (city) pick(city); else toast('No events near you yet. Showing everywhere.');
      },
      () => toast.error('Couldn’t get your location'),
      { timeout: 8000 },
    );
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} className="h-full flex items-center gap-2 pl-4 pr-3 py-3 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors font-semibold text-sm whitespace-nowrap">
        <MapPin size={17} className="text-primary" />
        <span className="max-w-[9rem] truncate">{label}</span>
        <ChevronDown size={15} className={`text-black/45 dark:text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute left-0 top-full mt-2 z-40 w-72 rounded-2xl border border-black/10 dark:border-white/10 bg-background shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-black/10 dark:border-white/10">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search a city" className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
              <button onClick={useMyLocation} className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"><Crosshair size={15} /> Use my location</button>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {!q && <Row active={value === 'all'} onClick={() => pick('all')} icon={<Globe size={15} />} label="Anywhere" />}
              {!q && <Row active={value === 'online'} onClick={() => pick('online')} icon={<Globe size={15} />} label="Online only" count={onlineCount} />}
              {shown.map(c => <Row key={c.name} active={value === c.name} onClick={() => pick(c.name)} icon={<MapPin size={15} />} label={c.name} count={c.count} />)}
              {q && shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-black/50 dark:text-white/50">No events in “{q}” yet.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button role="option" aria-selected={active} onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left">
      <span className="text-black/45 dark:text-white/45">{icon}</span>
      <span className="flex-1 truncate font-medium">{label}</span>
      {count !== undefined && <span className="text-xs text-black/40 dark:text-white/40">{count}</span>}
      {active && <Check size={15} className="text-primary" />}
    </button>
  );
}
