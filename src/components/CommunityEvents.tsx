import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Calendar, Check, Clock, MapPin, Plus, Users, Video } from 'lucide-react';
import { auth, db } from '../firebase';
import { formatDate } from '../lib/utils';
import CreateEventModal from './CreateEventModal';
import { formatEventPrice } from '../lib/payments';

interface Props {
  communityId: string;
  isAdmin: boolean;
  isMember: boolean;
  /** Admins can always create; others need the create-events permission. */
  canCreate?: boolean;
}

const toMs = (v: any): number | null => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d.getTime() : null;
};

export default function CommunityEvents({ communityId, isAdmin, isMember, canCreate = isAdmin }: Props) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    // Members see public and members-only events; everyone else only public ones.
    const visibility = isMember ? where('visibility', 'in', ['public', 'community']) : where('visibility', '==', 'public');
    return onSnapshot(
      query(collection(db, 'events'), where('communityId', '==', communityId), visibility, orderBy('startDate', 'asc')),
      snap => { setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      err => { console.error('Error fetching community events:', err); setLoading(false); },
    );
  }, [communityId, isMember]);

  const now = Date.now();
  const { upcoming, past } = useMemo(() => {
    const isPast = (e: any) => e.status === 'ended' || (e.status !== 'live' && (toMs(e.endDate) ?? toMs(e.startDate) ?? 0) < now);
    return {
      upcoming: events.filter(e => !isPast(e)).sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || (toMs(a.startDate) ?? 0) - (toMs(b.startDate) ?? 0)),
      past: events.filter(isPast).sort((a, b) => (toMs(b.startDate) ?? 0) - (toMs(a.startDate) ?? 0)),
    };
  }, [events, now]);

  // Which upcoming events is the signed-in person already registered for?
  useEffect(() => {
    if (!uid || !isMember) return;
    let cancelled = false;
    Promise.all(upcoming.map(e => getDoc(doc(db, 'events', e.id, 'registrations', uid)).then(s => (s.exists() ? e.id : null)).catch(() => null)))
      .then(ids => { if (!cancelled) setRegistered(new Set(ids.filter(Boolean) as string[])); });
    return () => { cancelled = true; };
  }, [uid, isMember, upcoming.map(e => e.id).join()]);

  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Events</h2>
          <p className="text-sm text-foreground/55">Meetups, workshops and sessions for this community.</p>
        </div>
        {canCreate && isMember && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium"><Plus size={15} />New event</button>
        )}
      </div>

      <div className="flex gap-2" role="tablist">
        {([['upcoming', 'Upcoming', upcoming.length], ['past', 'Past', past.length]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${tab === id ? 'bg-primary text-white' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'}`}>
            {label}<span className="ml-1.5 opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-foreground/5 animate-pulse" />)}</div>
      ) : list.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-2 rounded-xl border border-dashed border-foreground/15 text-foreground/50 text-center px-4">
          <Calendar size={30} />
          <p className="text-sm">{tab === 'upcoming' ? 'No upcoming events.' : 'No past events.'}</p>
          {tab === 'upcoming' && canCreate && isMember && <button onClick={() => setShowCreate(true)} className="text-sm font-medium text-primary hover:underline">Schedule the first one</button>}
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map(e => {
            const start = toMs(e.startDate);
            const live = e.status === 'live';
            const going = registered.has(e.id);
            const full = e.maxAttendees > 0 && (e.attendeeCount || 0) >= e.maxAttendees;
            return (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className="flex gap-4 p-3 sm:p-4 rounded-xl border border-foreground/10 hover:border-primary/40 hover:bg-foreground/[0.02] transition-colors">
                  <div className="w-14 shrink-0 text-center rounded-lg bg-foreground/5 py-2 self-start">
                    <p className="text-xs font-semibold text-primary uppercase">{start ? formatDate(start, 'MMM') : ''}</p>
                    <p className="text-xl font-semibold leading-tight">{start ? formatDate(start, 'd') : '–'}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold truncate">{e.title}</h3>
                      {live && <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold">Live now</span>}
                      {going && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-medium"><Check size={11} />You're going</span>}
                      {e.visibility === 'community' && <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/60 text-xs">Members only</span>}
                    </div>
                    <p className="mt-1 text-sm text-foreground/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {start && <span className="flex items-center gap-1"><Clock size={13} />{formatDate(start, 'EEE, h:mm a')}</span>}
                      <span className="flex items-center gap-1">{e.isOffline ? <><MapPin size={13} />{e.locationName || 'In person'}</> : <><Video size={13} />Online</>}</span>
                      <span className="flex items-center gap-1"><Users size={13} />{e.attendeeCount || 0}{e.maxAttendees > 0 ? ` / ${e.maxAttendees}` : ''} going{full && ' · Full'}</span>
                      {e.isPaid && <span className="text-amber-600 dark:text-amber-400 font-medium">{formatEventPrice(e)}</span>}
                    </p>
                    {e.description && <p className="mt-1.5 text-sm text-foreground/50 line-clamp-1">{e.description}</p>}
                  </div>
                  {e.banner?.trim() && <img src={e.banner} alt="" referrerPolicy="no-referrer" className="hidden sm:block w-28 h-20 rounded-lg object-cover self-center shrink-0" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <CreateEventModal isOpen={showCreate} onClose={() => setShowCreate(false)} communityId={communityId} />
    </div>
  );
}
