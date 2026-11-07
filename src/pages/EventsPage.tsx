import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, collectionGroup, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Plus,
  Radio,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';
import { EVENT_CATEGORIES } from '../lib/eventCategories';
import { cityOf, nearestCity } from '../lib/eventCities';
import { byScore, interleavePromoted, isEnded, isLive, isPromoted, startsInLabel } from '../lib/eventRanking';
import { formatDate } from '../lib/utils';
import EventCover from '../components/events/EventCover';
import EventRow from '../components/events/EventRow';
import CityPicker, { type CityValue } from '../components/events/CityPicker';
import DateStrip, { dayKey } from '../components/events/DateStrip';
import CreateEventModal from '../components/CreateEventModal';
import CreateInstantSessionModal from '../components/CreateInstantSessionModal';

type Sort = 'foryou' | 'soon' | 'popular';

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
  const liveNow = useMemo(
    () => upcoming.filter(e => isLive(e, now)).sort((a, b) => (b.attendeeCount || 0) - (a.attendeeCount || 0)),
    [upcoming, now],
  );

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
  const arranged = useMemo(
    () => interleavePromoted(results, filtering ? [] : [...spotlight, ...feedPromoted], 7),
    [results, feedPromoted, spotlight, filtering],
  );
  const boostable = uid ? upcoming.find(e => e.hostId === uid && !isPromoted(e, now)) : null;

  const requireUser = (fn: () => void, msg: string) => (uid ? fn() : toast.error(msg));
  const clear = () => { setSearch(''); setCity('all'); setCategory('all'); setDay('any'); setFreeOnly(false); };
  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const goLive = () => requireUser(() => setShowInstant(true), 'Sign in to go live');

  const resultTitle =
    q ? `Results for “${search.trim()}”`
      : city !== 'all' && city !== 'online' ? `In ${city}`
        : city === 'online' ? 'Online'
          : category !== 'all' ? category
            : 'All events';

  return (
    <div className="h-full w-full overflow-y-auto text-foreground">
      <div className="mx-auto w-full max-w-[1140px] px-5 pb-28 pt-7 sm:px-8 sm:pt-12">
        {/* Masthead */}
        <header>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-faint">
                <span className="h-px w-6 bg-primary" />
                {upcoming.length > 0 ? `${upcoming.length} coming up` : 'The calendar is open'}
                {liveNow.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-red-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> {liveNow.length} live
                  </span>
                )}
              </p>
              <h1 className="mt-4 max-w-2xl font-serif text-[38px] leading-[0.98] tracking-[-0.02em] sm:text-[58px]">
                Find your next <em className="italic text-primary">room</em>.
              </h1>
              <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
                Small gatherings, big ideas, rooms that stay open late. See what’s happening near you — or open a door of your own.
              </p>
            </div>

            <div className="hidden shrink-0 flex-col items-end gap-2 pt-1 sm:flex">
              <button
                onClick={goLive}
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground shadow-glow-primary transition-all hover:brightness-105 active:scale-[0.98]"
              >
                <Radio size={16} />
                Go live
                <ArrowUpRight size={15} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => requireUser(() => setShowCreate(true), 'Sign in to create events')}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <Plus size={14} /> Create an event
              </button>
            </div>
          </div>

          <div className="mt-6 flex gap-2 sm:hidden">
            <button onClick={goLive} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground">
              <Radio size={14} /> Go live
            </button>
            <button onClick={() => requireUser(() => setShowCreate(true), 'Sign in to create events')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-[12px] font-semibold">
              <Plus size={14} /> Create event
            </button>
          </div>
        </header>

        {/* Search + day filter */}
        <div className="mt-8 border-y border-border">
          <div className="flex items-center gap-2 py-2">
            <CityPicker value={city} onChange={setCity} cities={cities} onlineCount={onlineCount} locate={p => nearestCity(p, upcoming)} />
            <span className="h-5 w-px bg-border" />
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search rooms, hosts, cities"
                aria-label="Search events"
                className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-faint"
              />
            </div>
            {(filtering || freeOnly) && (
              <button onClick={clear} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground">
                <X size={12} /> Clear
              </button>
            )}
          </div>
          <div className="pb-3">
            <DateStrip value={day} onChange={setDay} counts={dayCounts} />
          </div>
        </div>

        {/* Categories as editorial text tabs */}
        <div className="no-scrollbar -mx-5 flex gap-5 overflow-x-auto px-5 py-3.5 sm:-mx-0 sm:px-0">
          {[{ name: 'all', emoji: '✦' }, ...EVENT_CATEGORIES.filter(c => catCounts.get(c.name) || c.name === category)].map(c => {
            const on = category === c.name;
            return (
              <button
                key={c.name}
                onClick={() => setCategory(c.name)}
                aria-pressed={on}
                className={`group relative shrink-0 whitespace-nowrap pb-1 text-[12px] font-semibold transition-colors ${on ? 'text-foreground' : 'text-faint hover:text-foreground'}`}
              >
                <span className="mr-1.5 text-[13px]">{c.emoji}</span>
                {c.name === 'all' ? 'Everything' : c.name}
                <span className="ml-1 text-[10px] font-medium text-faint/70">{c.name === 'all' ? upcoming.length : catCounts.get(c.name) ?? 0}</span>
                {on && <span className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>

        {/* Featured live room + on-air line-up */}
        {!filtering && liveNow.length > 0 && (
          <section className="mt-3" aria-label="Live now">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="flex items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[0.16em]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                On air
              </h2>
              <span className="text-[11px] text-faint">Drop in without knocking</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <LiveFeature event={liveNow[0]} />
              <div className="flex min-h-full flex-col justify-between rounded-[28px] bg-surface/70 p-2">
                <div className="divide-y divide-border">
                  {liveNow.slice(1, 4).map(event => (
                    <LiveLine key={event.id} event={event} />
                  ))}
                  {liveNow.length === 1 && (
                    <div className="px-4 py-6">
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        This one’s just getting started. Be early, say hello, stay a while.
                      </p>
                    </div>
                  )}
                </div>
                <button
                  onClick={goLive}
                  className="group mt-2 flex items-center justify-between rounded-[22px] px-4 py-3.5 text-left transition-colors hover:bg-foreground/[0.04]"
                >
                  <span>
                    <span className="block text-[12px] font-bold">Open your own room</span>
                    <span className="mt-0.5 block text-[11px] text-faint">Thirty seconds, no planning</span>
                  </span>
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-border text-primary transition-all group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground">
                    <Plus size={16} />
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Your line-up */}
        {!filtering && mine.length > 0 && (
          <section className="mt-9">
            <div className="mb-1 flex items-end justify-between">
              <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.16em]">Your line-up</h2>
              <span className="text-[11px] text-faint">Hosting & going</span>
            </div>
            <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:-mx-0 sm:px-0">
              {mine.map(e => (
                <Link
                  key={e.id}
                  to={`/events/${e.id}`}
                  className="group flex w-[260px] shrink-0 items-center gap-3 py-3 pr-2 transition-colors hover:bg-foreground/[0.025]"
                >
                  <EventCover event={e} className="h-12 w-12 shrink-0 rounded-[14px]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{e.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-faint">
                      {e.hostId === uid ? 'You’re hosting' : 'You’re going'}
                      {isLive(e, now) ? ' · Live now' : startsInLabel(e) ? ` · ${startsInLabel(e)}` : ` · ${formatDate(e.startDate, 'MMM d')}`}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        <section ref={resultsRef} className="mt-8 scroll-mt-20">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="font-serif text-[28px] leading-none tracking-[-0.01em] sm:text-[32px]">{resultTitle}</h2>
              {!loading && (
                <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                  {results.length} {results.length === 1 ? 'event' : 'events'}{freeOnly ? ' · free' : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setFreeOnly(f => !f)}
                aria-pressed={freeOnly}
                className={`inline-flex items-center gap-1.5 pb-0.5 text-[12px] font-semibold transition-colors ${freeOnly ? 'text-success' : 'text-faint hover:text-foreground'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${freeOnly ? 'bg-success' : 'bg-faint/50'}`} /> Free only
              </button>
              <span className="h-4 w-px bg-border" />
              <div className="flex items-center gap-3" role="tablist" aria-label="Sort events">
                {([['foryou', uid ? 'For you' : 'Top'], ['soon', 'Soonest'], ['popular', 'Popular']] as [Sort, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={sort === id}
                    onClick={() => setSort(id)}
                    className={`pb-0.5 text-[12px] font-semibold transition-colors ${sort === id ? 'text-foreground' : 'text-faint hover:text-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-1">
            {loading ? (
              <div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-5 border-b border-border py-5">
                    <div className="h-[86px] w-[116px] shrink-0 animate-pulse rounded-2xl bg-foreground/[0.05]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2.5 w-24 animate-pulse rounded-full bg-foreground/[0.05]" />
                      <div className="h-4 w-2/3 animate-pulse rounded-full bg-foreground/[0.06]" />
                      <div className="h-3 w-1/2 animate-pulse rounded-full bg-foreground/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : arranged.length > 0 ? (
              <div>
                {arranged.map(({ event, promoted: p }) => (
                  <div key={`${event.id}-${p ? 'p' : 'o'}`} className="relative">
                    {p && <span className="pointer-events-none absolute left-0 top-0 h-full w-[2px] rounded-full bg-amber-400/40" />}
                    <EventRow event={event} promoted={p} isRegistered={registeredIds.has(event.id)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-foreground/[0.04] text-faint">
                  <CalendarDays size={24} />
                </span>
                <p className="mt-5 font-serif text-[26px] tracking-[-0.01em]">{filtering ? 'Nothing here — yet' : 'A quiet calendar'}</p>
                <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                  {filtering
                    ? 'Try another city or day. Or be the one who starts something.'
                    : 'Every room starts with one person opening a door.'}
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  {filtering && <button onClick={clear} className="rounded-full border border-border px-4 py-2 text-[12px] font-semibold transition-colors hover:bg-foreground/5">Clear filters</button>}
                  <button onClick={goLive} className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground">Go live</button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Quiet host call-to-action */}
        <footer className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-serif text-[22px] leading-tight">Bring your people together.</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {boostable ? `Boost “${boostable.title}” to the front of this page.` : 'Create an event, or open a room right now.'}
            </p>
          </div>
          <div className="flex gap-2">
            {boostable && (
              <Link
                to={`/events/${boostable.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 px-4 py-2 text-[12px] font-semibold text-amber-500 transition-colors hover:bg-amber-400/10"
              >
                <Sparkles size={13} /> Promote
              </Link>
            )}
            <button
              onClick={() => requireUser(() => setShowCreate(true), 'Sign in to create events')}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[12px] font-bold text-background transition-opacity hover:opacity-90"
            >
              Create an event <ArrowRight size={13} />
            </button>
          </div>
        </footer>
      </div>

      <CreateEventModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
      <CreateInstantSessionModal isOpen={showInstant} onClose={() => setShowInstant(false)} />
    </div>
  );
}

/* ---------------------------------------------------------------- */

function LiveFeature({ event }: { event: any }) {
  const going = event.attendeeCount || 0;
  return (
    <Link
      to={`/events/${event.id}`}
      className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[28px] p-5 text-white sm:min-h-[340px] sm:p-7"
    >
      <EventCover
        event={event}
        className="absolute inset-0"
        imgClassName="transition-transform duration-[900ms] group-hover:scale-[1.04]"
      />
      <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,11,19,0.05)_0%,rgba(14,11,19,0.35)_55%,rgba(14,11,19,0.88)_100%)]" />

      <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white shadow-lg sm:left-7 sm:top-7">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
      </span>

      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
          <span>{event.category || 'Session'}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-white/50" />
          <span>{going > 0 ? `${going} in the room` : 'Just opened'}</span>
        </div>
        <h3 className="mt-2 max-w-lg font-display text-[26px] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[34px]">
          {event.title}
        </h3>
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-white/65 sm:text-[13px]">
          {event.description || 'A room is open and people are inside. Pull up a chair.'}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[11px] text-white/60">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[10px] font-bold text-white">
              {(event.hostName || 'H').charAt(0).toUpperCase()}
            </span>
            {event.hostName || 'Your host'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[11px] font-bold text-[#1a1210] transition-transform duration-300 group-hover:translate-x-0.5">
            Join the room <ArrowUpRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function LiveLine({ event }: { event: any }) {
  return (
    <Link to={`/events/${event.id}`} className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-foreground/[0.03] sm:px-4">
      <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted ring-2 ring-red-500/50">
        {event.banner ? (
          <img src={event.banner} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <Radio size={16} className="text-red-400" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold">{event.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
          <Users size={10} /> {event.attendeeCount || 0} listening
        </span>
      </span>
      <ArrowUpRight size={14} className="shrink-0 text-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
