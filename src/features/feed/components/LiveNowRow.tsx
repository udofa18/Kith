import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Radio, Sparkles } from 'lucide-react';
import { feedService } from '../../../services/feedService';
import { queryKeys, STALE } from '../../../lib/queryClient';

/**
 * The feed's live doorway: rooms that are on air right now, plus a one-tap
 * path for anyone who wants to open their own room.
 */
export default function LiveNowRow({ onGoLive }: { onGoLive?: () => void }) {
  const { data } = useQuery({
    queryKey: queryKeys.upcomingEvents(),
    queryFn: () => feedService.getUpcomingEvents(4),
    staleTime: STALE.sidebar,
  });
  const live = data?.live ?? [];

  return (
    <section aria-label="Live now" className="px-4 pt-3 pb-4 sm:px-5">
      <div className="relative overflow-hidden rounded-[24px] bg-[#211a28] px-4 py-4 text-[#f7f2e8] shadow-[0_18px_50px_-30px_rgba(14,11,19,0.9)] sm:px-5">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(255,107,74,0.38),transparent_68%)] blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(182,156,255,0.2),transparent_70%)] blur-2xl" />

        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3 sm:w-[190px] sm:shrink-0">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ff6b4a]/25 bg-[#ff6b4a]/10 text-[#ffb09d]">
              <Radio size={17} />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 ring-2 ring-[#211a28]" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#f7f2e8]/38">Live now</p>
              <p className="mt-0.5 truncate font-display text-[15px] font-semibold tracking-[-0.03em]">
                {live.length > 0 ? `${live.length} room${live.length === 1 ? '' : 's'} on air` : 'The room is quiet'}
              </p>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {live.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {live.map((event: any) => (
                  <Link
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="group flex max-w-[240px] shrink-0 items-center gap-2 rounded-full border border-[#f7f2e8]/10 bg-[#f7f2e8]/[0.06] py-1.5 pl-1.5 pr-3.5 transition-colors hover:bg-[#f7f2e8]/10"
                  >
                    <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[#2a2234] ring-2 ring-red-500/70">
                      <img
                        src={event.banner || `https://api.dicebear.com/7.x/shapes/svg?seed=${event.id}`}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#ff8f7a]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
                    </span>
                    <span className="truncate text-[12px] font-medium text-[#f7f2e8]/82">{event.title}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-[12px] leading-relaxed text-[#f7f2e8]/52">
                <Sparkles size={13} className="shrink-0 text-[#ffb65c]" />
                Nobody has opened a room yet. Start one and your people will see it here.
              </p>
            )}
          </div>

          {onGoLive ? (
            <button
              onClick={onGoLive}
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#ff6b4a] px-4 py-2 text-[12px] font-bold text-[#1a1210] transition-all hover:bg-[#ff7d61] active:scale-[0.98]"
            >
              Go live
              <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          ) : (
            <Link
              to="/login"
              state={{ from: { pathname: '/feed' } }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#f7f2e8] px-4 py-2 text-[12px] font-bold text-[#211a28] transition-colors hover:bg-white"
            >
              Sign in to go live
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
