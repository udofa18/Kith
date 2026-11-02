import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, collectionGroup, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Calendar, Megaphone, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';
import { EVENT_CATEGORIES } from '../lib/eventCategories';
import { cityOf, nearestCity } from '../lib/eventCities';
import { byScore, interleavePromoted, isEnded, isLive, isPromoted } from '../lib/eventRanking';
import EventCard from '../components/EventCard';
import EventHero from '../components/events/EventHero';
import EventRail from '../components/events/EventRail';
import CityPicker, { type CityValue } from '../components/events/CityPicker';
import DateStrip, { dayKey } from '../components/events/DateStrip';
import CreateEventModal from '../components/CreateEventModal';
import CreateInstantSessionModal from '../components/CreateInstantSessionModal';

type Sort = 'foryou' | 'soon' | 'popular';
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';

export default function EventsPage() {
  const uid = auth.currentUser?.uid ?? null;
  const navigate = useNavigate();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [registered, setRegistered] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState<CityValue>('all');
  const [category, setCategory] = useState('all');
  const [day, setDay] = useState('any');
  const [freeOnly, setFreeOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('foryou');
  const [showCreate, setShowCreate] = useState(false);
  const [showInstant, setShowInstant] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => onSnapshot(
    query(collection(db, 'events'), where('visibility', '==', 'public'), orderBy('startDate', 'asc')),
    snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
    () => setLoading(false),
  ), []);

  useEffect(() => {
    if (!uid) { setRegistered([]); return; }
    return onSnapshot(query(collectionGroup(db, 'registrations'), where('userId', '==', uid)), async snap => {
      const ids = [...new Set(snap.docs.map(d => d.data().eventId as string))];
      const docs = await Promise.all(ids.map(id => getDoc(doc(db, 'events', id))));
      setRegistered(docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
    }, () => undefined);
  }, [uid]);

  const now = Date.now();
  const upcoming = useMemo(() => events.filter(e => !isEnded(e, now)), [events, now]);
  const registeredIds = useMemo(() => new Set(registered.map(e => e.id)), [registered]);

  const cities = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of upcoming) { const c = cityOf(e); if (c) m.set(c, (m.get(c) ?? 0) + 1); }
    return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [upcoming]);
  const onlineCount = useMemo(() => upcoming.filter(e => !e.isOffline).length, [upcoming]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of upcoming) if (e.category) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [upcoming]);
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of upcoming) { const k = dayKey(new Date(e.startDate)); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [upcoming]);

  const mine = useMemo(() => {
    const hosting = upcoming.filter(e => e.hostId === uid);
    const going = registered.filter(e => !isEnded(e, now) && e.hostId !== uid);
    return [...hosting, ...going].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  }, [upcoming, registered, uid, now]);
  const liveNow = useMemo(() => upcoming.filter(e => isLive(e, now)), [upcoming, now]);

  const q = search.trim().toLowerCase();
  const weekEnd = dayKey(new Date(now + 6 * 86_400_000));
  const results = useMemo(() => {
    const list = upcoming.filter(e => {
      if (city === 'online' ? e.isOffline : city !== 'all' && cityOf(e).toLowerCase() !== city.toLowerCase()) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (freeOnly && e.isPaid) return false;
      if (day !== 'any') {
        const k = dayKey(new Date(e.startDate));
        if (day === 'later' ? k <= weekEnd : k !== day) return false;
      }
      // City names are searchable too, even when no city is picked.
      if (q && !`${e.title} ${e.description ?? ''} ${e.locationName ?? ''} ${e.locationAddress ?? ''} ${cityOf(e)} ${e.category ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sort === 'soon') return list;
    if (sort === 'popular') return [...list].sort((a, b) => (b.attendeeCount || 0) - (a.attendeeCount || 0));
    return [...list].sort(byScore([], now));
  }, [upcoming, city, category, freeOnly, day, q, sort, now, weekEnd]);

  const filtering = !!q || city !== 'all' || category !== 'all' || day !== 'any' || freeOnly;

  const promoted = useMemo(() => upcoming.filter(e => isPromoted(e, now)), [upcoming, now]);
  const spotlight = promoted.filter(e => (e.promotion?.placement ?? 'spotlight') === 'spotlight').slice(0, 4);
  const feedPromoted = promoted.filter(e => !spotlight.includes(e));
  const topPicks = spotlight.length > 0 ? spotlight : [...upcoming].sort(byScore([], now)).slice(0, 4);
  const arranged = useMemo(() => interleavePromoted(results, filtering ? [] : feedPromoted, 8), [results, feedPromoted, filtering]);
  const boostable = uid ? upcoming.find(e => e.hostId === uid && !isPromoted(e, now)) : null;

  const requireUser = (fn: () => void, msg: string) => (uid ? fn() : toast.error(msg));
  const clear = () => { setSearch(''); setCity('all'); setCategory('all'); setDay('any'); setFreeOnly(false); };

  return (
    <div className="w-full h-full overflow-y-auto text-black dark:text-white">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-24">
        <EventHero
          onDiscover={() => { searchRef.current?.focus(); searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
          onCreate={() => requireUser(() => setShowCreate(true), 'Sign in to create events')}
          onInstant={() => requireUser(() => setShowInstant(true), 'Sign in to start a session')}
          onBoost={() => (boostable ? navigate(`/events/${boostable.id}`) : requireUser(() => setShowCreate(true), 'Sign in to create events'))}
        />

        {/* Search: city + keywords */}
        <div className="mt-6 sticky top-2 z-20 flex items-center rounded-full border border-black/10 dark:border-white/15 bg-background/90 backdrop-blur-xl shadow-lg shadow-black/5 pr-2">
          <CityPicker value={city} onChange={setCity} cities={cities} onlineCount={onlineCount} locate={p => nearestCity(p, upcoming)} />
          <span className="w-px h-6 bg-black/10 dark:bg-white/15" />
          <div className="relative flex-1 min-w-0">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 pointer-events-none" />
            <input ref={searchRef} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events, topics or cities" aria-label="Search events" className="w-full pl-11 pr-3 py-3 bg-transparent text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40" />
          </div>
          {filtering && <button onClick={clear} className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15"><X size={13} /> Clear</button>}
        </div>

        {/* Categories */}
        <div className="mt-6 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {[{ name: 'all', emoji: '🌍' }, ...EVENT_CATEGORIES.filter(c => catCounts.get(c.name) || c.name === category)].map((c, i) => {
            const on = category === c.name;
            const hue = (i * 47) % 360;
            return (
              <button key={c.name} onClick={() => setCategory(c.name)} aria-pressed={on} className={`shrink-0 w-[84px] flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all ${on ? 'scale-105 shadow-lg ring-2 ring-pink-500' : 'hover:scale-105'}`} style={{ background: `hsl(${hue} 85% 60% / ${on ? 0.28 : 0.13})` }}>
                <span className="text-3xl leading-none">{c.emoji}</span>
                <span className="text-xs font-bold truncate max-w-full px-1">{c.name === 'all' ? 'All' : c.name}</span>
                <span className="text-[10px] text-black/45 dark:text-white/50">{c.name === 'all' ? upcoming.length : catCounts.get(c.name) ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5"><DateStrip value={day} onChange={setDay} counts={dayCounts} /></div>

        {!filtering && (
          <>
            <EventRail title="🔴 Happening now" events={liveNow} />
            <EventRail title="🎟️ Your events" events={mine} note={e => (e.hostId === uid ? 'You’re hosting' : 'You’re going')} />

            {topPicks.length > 0 && (
              <section className="mt-9">
                <h2 className="flex items-center gap-2 font-display font-extrabold text-xl">
                  {spotlight.length > 0 ? <><Megaphone size={18} className="text-amber-500" /> Promoted</> : <><Sparkles size={18} className="text-pink-500" /> Trending now</>}
                </h2>
                <div className={`${GRID} mt-4`}>
                  {topPicks.map(e => <EventCard key={e.id} event={e} promoted={spotlight.length > 0} isRegistered={registeredIds.has(e.id)} />)}
                  {spotlight.length > 0 && spotlight.length < 4 && boostable && (
                    <Link to={`/events/${boostable.id}`} className="aspect-[4/5] rounded-3xl border-2 border-dashed border-black/15 dark:border-white/20 hover:border-pink-500 transition-colors p-6 flex flex-col items-center justify-center text-center">
                      <span className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center"><Megaphone size={22} /></span>
                      <p className="mt-3 font-display font-bold text-lg">Your event here</p>
                      <p className="mt-1 text-sm text-black/55 dark:text-white/55">Boost “{boostable.title}” to the top of Events.</p>
                    </Link>
                  )}
                </div>
              </section>
            )}
          </>
        )}

        <section ref={resultsRef} className="mt-10 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display font-extrabold text-xl">
              {q ? `Results for “${search.trim()}”` : city !== 'all' && city !== 'online' ? `Events in ${city}` : city === 'online' ? 'Online events' : category !== 'all' ? category : 'All events'}
              {!loading && <span className="ml-2 text-sm font-medium text-black/40 dark:text-white/40">{results.length}</span>}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setFreeOnly(f => !f)} aria-pressed={freeOnly} className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${freeOnly ? 'bg-emerald-500 text-white' : 'bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10'}`}>Free only</button>
              <div className="flex p-1 rounded-full bg-black/5 dark:bg-white/[0.06]" role="tablist">
                {([['foryou', uid ? 'For you' : 'Top'], ['soon', 'Soonest'], ['popular', 'Popular']] as [Sort, string][]).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={sort === id} onClick={() => setSort(id)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${sort === id ? 'bg-background shadow-sm' : 'text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white'}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className={GRID}>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[4/5] rounded-3xl bg-black/5 dark:bg-white/5 animate-pulse" />)}</div>
            ) : arranged.length > 0 ? (
              <div className={GRID}>
                {arranged.map(({ event, promoted: p }) => <EventCard key={`${event.id}-${p ? 'p' : 'o'}`} event={event} promoted={p} isRegistered={registeredIds.has(event.id)} />)}
              </div>
            ) : (
              <div className="py-16 px-6 text-center rounded-3xl border-2 border-dashed border-black/15 dark:border-white/15">
                <span className="text-5xl">🎈</span>
                <p className="mt-4 font-display font-bold text-xl">{filtering ? 'Nothing matches that yet' : 'No events yet'}</p>
                <p className="mt-1 text-sm text-black/55 dark:text-white/55">{filtering ? 'Try another city or day, or be the one who starts something.' : 'Be the first to host one.'}</p>
                <div className="mt-5 flex justify-center gap-2">
                  {filtering && <button onClick={clear} className="px-4 py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">Clear filters</button>}
                  {uid && <button onClick={() => setShowCreate(true)} className="px-5 py-2 rounded-full text-white text-sm font-bold" style={{ background: 'linear-gradient(135deg,#EC4899,#F97316)' }}>Create event</button>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <CreateEventModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <CreateInstantSessionModal isOpen={showInstant} onClose={() => setShowInstant(false)} />
    </div>
  );
}
