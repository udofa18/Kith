import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Loader2,
  Radio,
  Settings2,
  Shield,
  Users,
} from 'lucide-react';
import { useLiveSessionInfo } from '../../hooks/useLiveSessionInfo';
import { LiveSessionInfoError } from '../../lib/liveSessionInfo';
import { liveExitHref, liveRoomPath } from '../../lib/eventLinks';
import { auth } from '../../firebase';

/**
 * Pre-join lobby for a live room.
 *
 * The lobby is deliberately not inside the LiveKit room: opening an invite link
 * shows who is hosting, what the session is about, whether it is live and how
 * many people are inside, without publishing a microphone or camera. Guests
 * choose a display name here before the token request, so a denied join can
 * explain itself instead of bouncing them back to the feed.
 */
export default function LiveLobby({
  eventId,
  onJoin,
  initialGuestName = '',
}: {
  eventId: string;
  onJoin: (guestName?: string) => void;
  initialGuestName?: string;
}) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useLiveSessionInfo(eventId);
  const [name, setName] = useState(initialGuestName);
  const [joining, setJoining] = useState(false);

  const infoError = isError ? (error as LiveSessionInfoError | null) : null;
  const missingRoom = infoError?.roomMissing === true;
  const guest = !auth.currentUser;
  const event = data?.event;
  const ended = data?.phase === 'ended';
  const exitHref = event ? liveExitHref(event) : '/feed';
  const consoleHref = event ? `${liveRoomPath(event)}/console` : '';

  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => navigate(exitHref, { replace: true }), 4000);
    return () => clearTimeout(timer);
  }, [ended, exitHref, navigate]);

  const shell =
    'relative flex min-h-screen flex-col bg-[#050409] text-white';

  if (isLoading) {
    return (
      <div className={`${shell} items-center justify-center p-6`}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
            Opening the lobby
          </p>
        </div>
      </div>
    );
  }

  // The lobby is a convenience, not a gate. If the info endpoint is missing or
  // briefly failing (a fresh deploy, a cold function) the viewer can still try
  // to join: the token endpoint stays the authority on who may enter.
  if (isError && !missingRoom) {
    const fallbackReady = !guest || name.trim().length >= 2;
    const fallbackJoin = () => {
      if (!fallbackReady || joining) return;
      setJoining(true);
      onJoin(guest ? name.trim() : undefined);
    };

    return (
      <div className={shell}>
        <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link
            to={exitHref}
            className="group inline-flex items-center gap-2 text-[12px] font-semibold text-white/50 transition-colors hover:text-white"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 transition-transform group-hover:-translate-x-0.5">
              <ArrowLeft size={15} />
            </span>
            <span className="hidden sm:inline">Back</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
            <Radio size={11} /> Live room
          </span>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-2 sm:px-8">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0b0810] p-6 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] sm:p-8">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/10 text-red-400">
              <Radio size={26} />
            </div>
            <h1 className="mt-4 text-2xl font-bold">Live room</h1>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              We couldn’t load the room details just now. You can still try to join — the
              room will confirm your access.
            </p>

            {guest && (
              <label className="mt-5 block text-left">
                <span className="mb-1.5 block text-[11px] font-semibold text-white/50">
                  Your name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(input) => setName(input.target.value)}
                  onKeyDown={(input) => {
                    if (input.key === 'Enter') fallbackJoin();
                  }}
                  placeholder="What should we call you?"
                  maxLength={40}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary"
                />
              </label>
            )}

            <button
              onClick={fallbackJoin}
              disabled={!fallbackReady || joining}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-4 py-3 text-[12px] font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {joining ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
              Join live
            </button>

            <button
              onClick={() => refetch()}
              className="mt-2 w-full rounded-full border border-white/10 px-4 py-2.5 text-[11px] font-bold text-white/60 transition-colors hover:bg-white/5"
            >
              Try again
            </button>

            <Link
              to="/feed"
              className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-white/35 transition-colors hover:text-white"
            >
              Back to feed <ArrowUpRight size={10} />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (isError || !data || !event) {
    return (
      <div className={`${shell} items-center justify-center p-6 text-center`}>
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-red-500/10 text-red-400">
          <Shield size={30} />
        </div>
        <h1 className="text-2xl font-bold">This room isn’t available</h1>
        <p className="mt-2 max-w-sm text-sm text-white/40">
          The session may have ended, or the invite link is no longer valid.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-full border border-white/10 px-5 py-2.5 text-[12px] font-bold text-white/70 transition-colors hover:bg-white/5"
          >
            Try again
          </button>
          <Link
            to="/feed"
            className="rounded-full bg-white px-5 py-2.5 text-[12px] font-bold text-black transition-opacity hover:opacity-90"
          >
            Back to feed
          </Link>
        </div>
      </div>
    );
  }

  const guestNeedsName = !data.viewer.signedIn;
  const canJoin = data.viewer.joinable && !ended;
  const ready = canJoin && (!guestNeedsName || name.trim().length >= 2);

  const join = () => {
    if (!ready || joining) return;
    setJoining(true);
    onJoin(guestNeedsName ? name.trim() : undefined);
  };

  const phaseLabel =
    data.phase === 'live' ? 'Live now' : ended ? 'Session ended' : 'Starting soon';
  const start = event.startDate ? new Date(event.startDate) : null;
  const schedule =
    start && !Number.isNaN(start.getTime())
      ? start.toLocaleString(undefined, {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return (
    <div className={shell}>
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link
          to={exitHref}
          className="group inline-flex items-center gap-2 text-[12px] font-semibold text-white/50 transition-colors hover:text-white"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 transition-transform group-hover:-translate-x-0.5">
            <ArrowLeft size={15} />
          </span>
          <span className="hidden sm:inline">Back</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">
          <Radio size={11} /> Live room
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-2 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0810] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
        >
          <div className="relative h-40 w-full sm:h-56">
            {event.banner ? (
              <img
                src={event.banner}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_25%_20%,rgba(239,68,68,0.35),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(139,92,246,0.3),transparent_55%)]" />
            )}
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,4,9,0.15)_0%,rgba(11,8,16,0.95)_100%)]" />
            <span
              className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
                data.phase === 'live'
                  ? 'bg-red-500 text-white'
                  : ended
                    ? 'bg-black/60 text-white/70'
                    : 'bg-amber-400/90 text-black'
              }`}
            >
              {data.phase === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
              {phaseLabel}
            </span>
          </div>

          <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                {event.category || 'Live session'}
              </p>
              <h1 className="mt-2 font-serif text-[30px] leading-[1.02] tracking-[-0.02em] sm:text-[40px]">
                {event.title || 'Live session'}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} /> {data.participantCount}{' '}
                  {data.participantCount === 1 ? 'person' : 'people'} inside
                </span>
                {schedule && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} /> {schedule}
                  </span>
                )}
                {data.phase === 'live' && (
                  <span className="inline-flex items-center gap-1.5 text-white/40">
                    <Clock size={13} /> Happening now
                  </span>
                )}
              </div>

              {event.description && (
                <p className="mt-6 max-w-[62ch] whitespace-pre-wrap text-[14px] leading-7 text-white/55">
                  {event.description}
                </p>
              )}

              {data.host && (
                <div className="mt-7 flex items-center gap-3 border-t border-white/[0.07] pt-5">
                  <img
                    src={
                      data.host.photo ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.host.uid}`
                    }
                    alt=""
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{data.host.name}</p>
                    <p className="truncate text-[11px] text-white/35">
                      Host{data.host.username ? ` · @${data.host.username}` : ''}
                    </p>
                  </div>
                  {data.coHosts.length > 0 && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] text-white/30">with</span>
                      <div className="flex -space-x-2">
                        {data.coHosts.slice(0, 3).map((coHost) => (
                          <img
                            key={coHost.uid}
                            src={
                              coHost.photo ||
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${coHost.uid}`
                            }
                            alt={coHost.name}
                            title={coHost.name}
                            className="h-7 w-7 rounded-full object-cover ring-2 ring-[#0b0810]"
                            referrerPolicy="no-referrer"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <aside className="self-start rounded-[22px] border border-white/[0.07] bg-white/[0.03] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                {data.viewer.isManager ? 'You’re managing' : 'Join the room'}
              </p>

              {guestNeedsName && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-[11px] font-semibold text-white/50">
                    Your name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') join();
                    }}
                    placeholder="What should we call you?"
                    maxLength={40}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary"
                  />
                </label>
              )}

              {ended ? (
                <div className="mt-4 rounded-xl bg-white/[0.04] px-3.5 py-3 text-[11px] leading-relaxed text-white/50">
                  This session has ended. Taking you back in a moment…
                </div>
              ) : canJoin ? (
                <button
                  onClick={join}
                  disabled={!ready || joining}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-4 py-3 text-[12px] font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joining ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Radio size={14} />
                  )}
                  {data.viewer.isManager ? 'Enter studio' : 'Join live'}
                </button>
              ) : (
                <div className="mt-4 rounded-xl bg-white/[0.04] px-3.5 py-3 text-[11px] leading-relaxed text-white/55">
                  {data.viewer.reason || 'You cannot join this room right now.'}
                </div>
              )}

              {data.viewer.isManager && (
                <Link
                  to={consoleHref}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
                >
                  <Settings2 size={14} /> Host console
                </Link>
              )}

              {!guestNeedsName && !ended && (
                <p className="mt-4 text-[10px] leading-relaxed text-white/25">
                  You’ll join with your Kith profile and can leave at any time.
                </p>
              )}
              {guestNeedsName && !ended && (
                <p className="mt-4 text-[10px] leading-relaxed text-white/25">
                  No account needed. Your name is only shown inside this room.
                </p>
              )}

              {schedule && data.phase === 'scheduled' && (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-400/[0.07] px-3 py-2.5 text-[10px] leading-relaxed text-amber-200/70">
                  <Clock size={12} className="mt-0.5 shrink-0" />
                  The room opens a few minutes before it starts.
                </p>
              )}

              <Link
                to={exitHref}
                className="mt-4 flex items-center justify-center gap-1 text-[10px] font-semibold text-white/35 transition-colors hover:text-white"
              >
                {event.isInstant ? 'Back to feed' : 'Open event page'} <ArrowUpRight size={10} />
              </Link>
            </aside>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
