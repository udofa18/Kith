import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { feedService } from '../../../services/feedService';
import { queryKeys, STALE } from '../../../lib/queryClient';

/**
 * Horizontal strip of events happening right now. Shares the events query with the
 * right rail, so it costs no extra reads. Hidden when nothing is live.
 */
export default function LiveNowRow() {
  const { data } = useQuery({
    queryKey: queryKeys.upcomingEvents(),
    queryFn: () => feedService.getUpcomingEvents(4),
    staleTime: STALE.sidebar,
  });
  const live = data?.live ?? [];
  if (live.length === 0) return null;

  return (
    <section aria-label="Live now" className="px-5 py-3 border-b border-black/10 dark:border-white/10">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {live.map((event: any) => (
          <Link
            key={event.id}
            to={`/events/${event.id}`}
            className="group shrink-0 flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 transition-colors max-w-[260px]"
          >
            <img
              src={event.banner || `https://api.dicebear.com/7.x/shapes/svg?seed=${event.id}`}
              alt=""
              className="w-7 h-7 rounded-full object-cover shrink-0"
            />
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-500 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
            </span>
            <span className="text-sm font-medium truncate">{event.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
