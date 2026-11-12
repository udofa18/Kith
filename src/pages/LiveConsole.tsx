import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ExternalLink,
  HelpCircle,
  Loader2,
  MessageSquare,
  MicOff,
  Radio,
  Settings2,
  Shield,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';
import Avatar from '../components/ui/Avatar';
import ConfirmModal from '../components/ConfirmModal';
import LiveChat from '../components/live/LiveChat';
import LiveQA from '../components/live/LiveQA';
import { useLiveSession } from '../contexts/LiveSessionContext';
import { useLiveSessionInfo } from '../hooks/useLiveSessionInfo';
import { liveExitHref, liveRoomPath } from '../lib/eventLinks';

const PRESENCE_STALE_MS = 90_000;
const CLOCK_TICK_MS = 10_000;

interface Attendee {
  uid: string;
  name?: string;
  photo?: string;
  role?: string;
  lastSeenAt?: number;
}

const formatRemaining = (ms: number) => {
  if (!Number.isFinite(ms)) return '--:--';
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Host/co-host console: a management page that is deliberately separate from the
 * public event page. It shows who is in the room, the remaining time, comments
 * and questions, and can extend or end the session.
 */
export default function LiveConsole() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { endSessionForEveryone } = useLiveSession();
  const { data: info } = useLiveSessionInfo(eventId, !!eventId);

  const [event, setEvent] = useState<any>(null);
  const [eventLoaded, setEventLoaded] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [tab, setTab] = useState<'chat' | 'qa'>('chat');
  const [now, setNow] = useState(() => Date.now());
  const [extending, setExtending] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    return onSnapshot(
      doc(db, 'events', eventId),
      (snap) => {
        setEvent(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setEventLoaded(true);
      },
      () => setEventLoaded(true),
    );
  }, [eventId]);

  // The heartbeat documents are written by every signed-in member inside the
  // root LiveKit room, and survive minimizing the room.
  useEffect(() => {
    if (!eventId) return;
    return onSnapshot(
      collection(db, 'eventSessions', eventId, 'participants'),
      (snap) => setAttendees(snap.docs.map((entry) => ({ uid: entry.id, ...entry.data() } as Attendee))),
      () => setAttendees([]),
    );
  }, [eventId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const activeAttendees = useMemo(() => {
    const cutoff = now - PRESENCE_STALE_MS;
    return attendees
      .filter((person) => typeof person.lastSeenAt === 'number' && person.lastSeenAt > cutoff)
      .sort((a, b) => {
        const weight = (person: Attendee) => (person.role === 'host' ? 0 : 1);
        return weight(a) - weight(b) || (a.name || '').localeCompare(b.name || '');
      });
  }, [attendees, now]);

  const isManager = useMemo(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !event) return false;
    return event.hostId === uid || (Array.isArray(event.coHostIds) && event.coHostIds.includes(uid));
  }, [event]);

  const endTime = event?.expiresAt || event?.endDate;
  const remaining = endTime ? new Date(endTime).getTime() - now : NaN;
  const ended = event?.status === 'ended' || (Number.isFinite(remaining) && remaining <= 0);
  const participantCount = Math.max(info?.participantCount ?? 0, activeAttendees.length);
  const returnHref = eventId ? `${liveRoomPath({ id: eventId })}?join=1` : '/feed';
  const exitHref = event ? liveExitHref(event) : '/feed';

  const extend = async (minutes = 15) => {
    if (!eventId || !endTime) return;
    setExtending(true);
    try {
      const base = Math.max(Date.now(), new Date(endTime).getTime());
      const next = new Date(base + minutes * 60_000).toISOString();
      await updateDoc(doc(db, 'events', eventId), { expiresAt: next, endDate: next });
      await setDoc(
        doc(db, 'eventSessions', eventId),
        { expiresAt: next, extendedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { merge: true },
      );
      toast.success(`Room extended by ${minutes} minutes`);
    } catch {
      toast.error('Could not extend this session');
    } finally {
      setExtending(false);
    }
  };

  const endForEveryone = async () => {
    if (!eventId) return;
    setEnding(true);
    try {
      const endedNow = await endSessionForEveryone(eventId);
      if (!endedNow) {
        toast.error('Could not end the session. You are still live.');
        return;
      }
      navigate(exitHref, { replace: true });
    } finally {
      setEnding(false);
      setShowEndConfirm(false);
    }
  };

  // Only the host or a co-host may open the console. Everyone else is sent back
  // into the room (or the lobby) instead of seeing attendee names.
  if (eventLoaded && !isManager) {
    return <Navigate to={returnHref} replace />;
  }

  if (!eventId) return <Navigate to="/feed" replace />;

  const tabs = [
    { id: 'chat' as const, label: 'Comments', icon: <MessageSquare size={15} /> },
    { id: 'qa' as const, label: 'Questions', icon: <HelpCircle size={15} /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#050409] text-white">
      <header className="border-b border-white/[0.07] bg-[#08060b]/90 px-3 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2 sm:gap-3">
          <Link
            to={returnHref}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
            title="Back to the room"
          >
            <ArrowLeft size={16} />
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex shrink-0 items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${ended ? 'bg-white/30' : 'animate-pulse bg-red-500'}`} />
              <span className={`text-[9px] font-black uppercase tracking-[0.18em] ${ended ? 'text-white/35' : 'text-red-400'}`}>
                {ended ? 'Ended' : 'Live'}
              </span>
            </span>
            <span className="hidden h-4 w-px bg-white/10 sm:block" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white/90">
                {event?.title || info?.event.title || 'Host console'}
              </p>
              <p className="flex items-center gap-1.5 text-[10px] text-white/35">
                <Settings2 size={10} /> Host console
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-white/60">
              <Users size={12} /> {participantCount}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 font-mono text-[10px] font-bold text-amber-300">
              <Timer size={12} /> {formatRemaining(remaining)}
            </span>
            <button
              onClick={() => extend(15)}
              disabled={extending || !endTime || ended}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1.5 text-[10px] font-bold text-amber-200 transition-colors hover:bg-amber-400/25 disabled:opacity-40"
            >
              {extending ? <Loader2 size={11} className="animate-spin" /> : <Timer size={11} />} +15m
            </button>
            <Link
              to={returnHref}
              className="hidden items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-primary/90 sm:inline-flex"
            >
              <Radio size={12} /> Back to room
            </Link>
            <button
              onClick={() => setShowEndConfirm(true)}
              disabled={ended}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-40"
            >
              <X size={12} /> End
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-3 sm:p-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-[300px]">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/[0.07] bg-[#0b0810]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                <Users size={13} /> In the room
              </p>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/50">
                {participantCount}
              </span>
            </div>
            <div className="max-h-[45vh] space-y-1 overflow-y-auto p-2 custom-scrollbar lg:max-h-[calc(100vh-190px)]">
              {activeAttendees.length === 0 ? (
                <p className="px-3 py-8 text-center text-[11px] leading-relaxed text-white/30">
                  No one is connected right now. Attendees appear here while the
                  room is open.
                </p>
              ) : (
                activeAttendees.map((person) => (
                  <div
                    key={person.uid}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
                  >
                    <Avatar src={person.photo} seed={person.uid} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-white/85">
                        {person.name || 'Member'}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-white/35">
                        {person.role === 'host' ? (
                          <><Shield size={9} /> Host</>
                        ) : (
                          <><MicOff size={9} /> Attendee</>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="border-t border-white/[0.07] px-4 py-2.5 text-[9px] leading-relaxed text-white/25">
              Updates every 30 seconds. Stale tabs drop off after 90 seconds.
            </p>
          </motion.section>

          <Link
            to={`/events/${eventId}`}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.07] px-3 py-2.5 text-[10px] font-semibold text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <ExternalLink size={11} /> Event details
          </Link>
        </aside>

        <section className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0810]">
          <div className="flex items-center border-b border-white/[0.07] px-1">
            {tabs.map((entry) => {
              const active = tab === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setTab(entry.id)}
                  className={`relative flex flex-1 items-center justify-center gap-2 py-3 text-[10px] font-bold uppercase tracking-[0.13em] transition-colors sm:flex-none sm:px-6 ${
                    active ? 'text-primary' : 'text-white/35 hover:text-white/60'
                  }`}
                >
                  {entry.icon}
                  {entry.label}
                  {active && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" />}
                </button>
              );
            })}
            <span className="ml-auto hidden px-3 text-[9px] text-white/25 sm:block">
              {info?.phase === 'live' ? 'Happening now' : info?.phase === 'scheduled' ? 'Starting soon' : 'Ended'}
            </span>
          </div>
          <div className="min-h-0 flex-1">
            {eventId && tab === 'chat' && <LiveChat eventId={eventId} />}
            {eventId && tab === 'qa' && <LiveQA eventId={eventId} isHost />}
          </div>
        </section>
      </main>

      <ConfirmModal
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={endForEveryone}
        title="End Session"
        message="Are you sure you want to end this session for everyone? This action cannot be undone."
        confirmText="End Session"
        loading={ending}
      />
    </div>
  );
}
