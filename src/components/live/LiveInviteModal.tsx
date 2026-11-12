import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Loader2,
  Radio,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useLiveSessionInfo } from '../../hooks/useLiveSessionInfo';
import { useLiveSession } from '../../contexts/LiveSessionContext';
import { liveExitHref, liveRoomPath } from '../../lib/eventLinks';
import type { LiveSessionModalRequest } from '../../lib/liveSessionModal';

/**
 * The in-app live invite.
 *
 * A fresh invite (or a live link tapped in a message) should not yank the
 * viewer into another tab. This dialog shows who is live, how many people are
 * inside and a single obvious way to join, then marks the invite as read.
 */
export default function LiveInviteModal({
  request,
  onClose,
}: {
  request: LiveSessionModalRequest;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { setGuestName } = useLiveSession();
  const { data, isLoading, isError, refetch } = useLiveSessionInfo(request.eventId);
  const [name, setName] = useState('');

  const markRead = () => {
    if (!request.notificationId) return;
    updateDoc(doc(db, 'notifications', request.notificationId), { read: true }).catch(
      () => undefined,
    );
  };

  const close = () => {
    markRead();
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
    // close is stable enough for the lifetime of one invite; re-registering on
    // every data change would be noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const event = data?.event;
  const ended = data?.phase === 'ended';
  const guestNeedsName = data?.viewer.signedIn === false;
  const canJoin = !!data?.viewer.joinable && !ended;
  const ready = canJoin && (!guestNeedsName || name.trim().length >= 2);

  const openLobby = () => {
    markRead();
    onClose();
    navigate(liveRoomPath(request.eventId));
  };

  const join = () => {
    if (!data || !event) {
      openLobby();
      return;
    }
    markRead();

    if (ended) {
      onClose();
      navigate(liveExitHref(event), { replace: true });
      return;
    }

    if (!data.viewer.joinable) {
      openLobby();
      return;
    }

    if (guestNeedsName) setGuestName(name.trim());
    onClose();
    navigate(`${liveRoomPath(event)}?join=1`);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Live session invite"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md overflow-hidden rounded-[26px] border border-white/10 bg-[#0b0810] text-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss invite"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white/70 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
        >
          <X size={17} />
        </button>

        <div className="relative h-36 w-full sm:h-40">
          {event?.banner ? (
            <img
              src={event.banner}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_25%_20%,rgba(239,68,68,0.4),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(139,92,246,0.35),transparent_55%)]" />
          )}
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,4,9,0.05)_0%,rgba(11,8,16,0.96)_100%)]" />

          <span
            className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
              ended
                ? 'bg-black/60 text-white/70'
                : data?.phase === 'live'
                  ? 'bg-red-500 text-white'
                  : 'bg-amber-400/90 text-black'
            }`}
          >
            {!ended && data?.phase === 'live' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            )}
            {ended ? 'Session ended' : data?.phase === 'live' ? 'Live now' : 'Starting soon'}
          </span>
        </div>

        <div className="-mt-5 px-5 pb-5 sm:px-6 sm:pb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            {event?.category || 'Live session'}
          </p>
          <h2 className="mt-1.5 line-clamp-2 font-serif text-[26px] leading-[1.05] tracking-[-0.01em] sm:text-[30px]">
            {event?.title || 'You’re invited to go live'}
          </h2>

          {isLoading && (
            <div className="mt-4 flex items-center gap-2 text-[12px] text-white/45">
              <Loader2 size={14} className="animate-spin" /> Opening the invite…
            </div>
          )}

          {!isLoading && isError && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[12px] leading-relaxed text-white/55">
              We couldn’t load the room details just now. You can still open the room and
              try to join.
            </div>
          )}

          {data && event && (
            <>
              <div className="mt-3 flex items-center gap-3">
                {data.host ? (
                  <>
                    <img
                      src={
                        data.host.photo ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.host.uid}`
                      }
                      alt=""
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold">
                        {data.host.name}
                        <span className="font-normal text-white/40"> invited you</span>
                      </p>
                      <p className="truncate text-[10px] text-white/35">
                        Host{data.host.username ? ` · @${data.host.username}` : ''}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-[12px] text-white/50">Someone invited you</p>
                )}

                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/55">
                  <Users size={11} /> {data.participantCount}
                  <span className="hidden sm:inline">
                    {data.participantCount === 1 ? 'person' : 'people'}
                  </span>
                </span>
              </div>

              {event.description && (
                <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-white/45">
                  {event.description}
                </p>
              )}

              {guestNeedsName && !ended && data.viewer.joinable && (
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    Your name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(input) => setName(input.target.value)}
                    onKeyDown={(input) => {
                      if (input.key === 'Enter') join();
                    }}
                    placeholder="What should we call you?"
                    maxLength={40}
                    autoFocus
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px] font-semibold text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary"
                  />
                </label>
              )}

              {ended ? (
                <button
                  type="button"
                  onClick={join}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] font-bold text-white/70 transition-colors hover:bg-white/10"
                >
                  This session has ended · Back to feed
                </button>
              ) : data.viewer.joinable ? (
                <button
                  type="button"
                  onClick={join}
                  disabled={!ready}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-4 py-3 text-[12px] font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Radio size={14} />
                  {data.viewer.isManager ? 'Enter studio' : 'Join live'}
                </button>
              ) : (
                <>
                  <div className="mt-4 rounded-xl bg-white/[0.04] px-3.5 py-3 text-[11px] leading-relaxed text-white/55">
                    {data.viewer.reason || 'You cannot join this room right now.'}
                  </div>
                  <button
                    type="button"
                    onClick={join}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-[11px] font-bold text-white/70 transition-colors hover:bg-white/5"
                  >
                    Open room <ArrowRight size={13} />
                  </button>
                </>
              )}

              {data.viewer.isManager && !ended && (
                <button
                  type="button"
                  onClick={() => {
                    markRead();
                    onClose();
                    navigate(`${liveRoomPath(request.eventId)}/console`);
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
                >
                  <Settings2 size={13} /> Host console
                </button>
              )}
            </>
          )}

          {!isLoading && isError && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                className="flex-1 rounded-full border border-white/10 px-4 py-2.5 text-[11px] font-bold text-white/70 transition-colors hover:bg-white/5"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={join}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-red-500 px-4 py-2.5 text-[11px] font-bold text-white transition-colors hover:bg-red-600"
              >
                Open room <ArrowRight size={12} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={close}
            className="mt-3 w-full text-center text-[10px] font-semibold text-white/30 transition-colors hover:text-white/60"
          >
            Not now
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
