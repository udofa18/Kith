import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUpRight, Radio, Users } from 'lucide-react';
import { useLiveSessionInfo } from '../../hooks/useLiveSessionInfo';
import { liveExitHref, liveRoomPath } from '../../lib/eventLinks';
import type { LiveEventPreview, LiveSessionInfo } from '../../lib/liveSessionInfo';

const CARD_WIDTH = 300;
const OPEN_DELAY = 350;
const CLOSE_DELAY = 220;

const phaseLabel = (phase: LiveSessionInfo['phase']) =>
  phase === 'live' ? 'Live now' : phase === 'ended' ? 'Session ended' : 'Scheduled';

/**
 * A small live-session card shared by avatar rings and live badges. Hovering or
 * clicking the trigger opens the same peek, so "who is live" always leads to the
 * same place: the pre-join lobby or the room itself.
 */
export default function LivePeek({
  eventId,
  className,
  children,
  ariaLabel,
}: {
  eventId: string;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const above = window.innerHeight - rect.bottom < 320 && rect.top > window.innerHeight - rect.bottom;
    const left = Math.max(12, Math.min(window.innerWidth - CARD_WIDTH - 12, rect.left - 12));
    setPos(above ? { left, bottom: window.innerHeight - rect.top + 8, above } : { left, top: rect.bottom + 8, above });
    setOpen(true);
  };

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(place, OPEN_DELAY);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };
  const keepOpen = () => clearTimeout(timer.current);

  const toggle = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(timer.current);
    if (open) setOpen(false);
    else place();
  };

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? 'View live session'}
        aria-expanded={open}
        className={className}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') toggle(event);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              initial={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.above ? 6 : -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: CARD_WIDTH, zIndex: 1000 }}
              onMouseEnter={keepOpen}
              onMouseLeave={hide}
              onClick={(event) => event.stopPropagation()}
            >
              <PeekBody eventId={eventId} onNavigate={() => setOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function PeekBody({ eventId, onNavigate }: { eventId: string; onNavigate: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useLiveSessionInfo(eventId, true);

  const shell =
    'overflow-hidden rounded-2xl border border-foreground/10 bg-background text-foreground shadow-xl shadow-black/10 dark:shadow-black/40';

  if (isLoading) {
    return (
      <div className={`${shell} animate-pulse p-4`}>
        <div className="h-3 w-20 rounded bg-foreground/10" />
        <div className="mt-3 h-5 w-3/4 rounded bg-foreground/10" />
        <div className="mt-4 h-3 w-1/2 rounded bg-foreground/10" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={`${shell} p-4`}>
        <p className="text-sm text-foreground/60">This live session isn't available right now.</p>
        <Link
          to={`/live/${eventId}`}
          onClick={onNavigate}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-[11px] font-bold text-foreground/70 transition-colors hover:bg-foreground/5"
        >
          Open room <ArrowUpRight size={11} />
        </Link>
      </div>
    );
  }

  const event = data.event as LiveEventPreview & { id: string };
  const host = data.host;
  const phase = data.phase;
  const ended = phase === 'ended';
  const exitHref = liveExitHref(event);

  const join = () => {
    onNavigate();
    if (data.viewer.joinable && !ended) {
      navigate(`${liveRoomPath(event)}?join=1`);
    } else {
      navigate(exitHref, { replace: true });
    }
  };

  return (
    <div className={shell}>
      <div className="relative">
        {event.banner ? (
          <img src={event.banner} alt="" className="h-24 w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-20 w-full bg-[radial-gradient(circle_at_30%_20%,rgba(239,68,68,0.28),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.25),transparent_55%)]" />
        )}
        <span
          className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${
            phase === 'live'
              ? 'bg-red-500 text-white'
              : ended
                ? 'bg-black/60 text-white/70'
                : 'bg-amber-400/90 text-black'
          }`}
        >
          {phase === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
          {phaseLabel(phase)}
        </span>
      </div>

      <div className="p-4">
        <p className="line-clamp-2 text-[15px] font-bold leading-snug">{event.title || 'Live session'}</p>

        <div className="mt-2.5 flex items-center gap-2">
          {host ? (
            <>
              <img
                src={host.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${host.uid}`}
                alt=""
                className="h-7 w-7 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold">{host.name}</p>
                {host.username && <p className="truncate text-[10px] text-foreground/45">@{host.username}</p>}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-foreground/50">Live session</p>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-foreground/45">
            <Users size={11} /> {data.participantCount}
          </span>
        </div>

        {event.description && (
          <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-foreground/55">{event.description}</p>
        )}

        {ended ? (
          <button
            onClick={join}
            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-foreground/10 px-4 py-2 text-[11px] font-bold text-foreground/60 transition-colors hover:bg-foreground/5"
          >
            {event.isInstant ? 'Back to feed' : 'Open event page'}
          </button>
        ) : data.viewer.joinable ? (
          <button
            onClick={join}
            className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-red-500 px-4 py-2 text-[11px] font-bold text-white transition-colors hover:bg-red-600"
          >
            <Radio size={12} /> {data.viewer.isManager ? 'Enter studio' : 'Join live'}
          </button>
        ) : (
          <div className="mt-3.5 rounded-xl bg-foreground/5 px-3 py-2 text-[10px] leading-relaxed text-foreground/55">
            {data.viewer.reason || 'You cannot join this room right now.'}
          </div>
        )}

        {host && (
          <Link
            to={`/creators/${host.uid}`}
            onClick={onNavigate}
            className="mt-2 flex items-center justify-center gap-1 text-[10px] font-semibold text-foreground/40 transition-colors hover:text-foreground"
          >
            View profile <ArrowUpRight size={10} />
          </Link>
        )}
      </div>
    </div>
  );
}
