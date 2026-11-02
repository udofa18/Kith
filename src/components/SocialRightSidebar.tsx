import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Flame, TrendingUp } from 'lucide-react';
import { feedService } from '../services/feedService';
import { queryKeys, STALE } from '../lib/queryClient';
import { formatDate } from '../lib/utils';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { activeStreak, recentDays, shippedToday } from '../features/shiplog/streak';
import RailSection, { RailEmpty, RailRow } from './ui/RailSection';
import Avatar from './ui/Avatar';
import { RailSkeleton } from './SocialLeftSidebar';

/** Activity rail: your streak, what's coming up, open challenges, recent articles. */
export default function SocialRightSidebar() {
  const user = useCurrentUser();
  return (
    <aside className="hidden xl:flex flex-col gap-4 w-80 shrink-0 order-3 sticky top-0 self-start max-h-screen overflow-y-auto no-scrollbar py-4">
      {user && <StreakCard streak={user.streak} />}
      <UpcomingEvents />
      <Challenges />
      <Articles />
    </aside>
  );
}

function StreakCard({ streak }: { streak: any }) {
  const current = activeStreak(streak);
  const done = shippedToday(streak);
  const days = recentDays(streak, 7);

  return (
    <section className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/2 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[15px] font-bold flex items-center gap-1.5">
            <Flame size={16} className="text-primary" />
            {current > 0 ? `${current}-day streak` : 'Start a streak'}
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {current > 0 ? `Longest: ${streak?.longest ?? current} days` : 'Share a progress update each day you move something forward.'}
          </p>
        </div>
      </div>

      <ol className="flex justify-between mb-4" aria-label="Last 7 days">
        {days.map(d => (
          <li key={d.key} className="flex flex-col items-center gap-1">
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center ${d.shipped ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10'}`}
              title={d.key}
            >
              {d.shipped && <Check size={13} />}
            </span>
            <span className="text-[11px] text-black/40 dark:text-white/40">
              {new Date(`${d.key}T00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
            </span>
          </li>
        ))}
      </ol>

      {done ? (
        <p className="text-sm text-center text-black/60 dark:text-white/60">You shared progress today. Nice work.</p>
      ) : (
        <Link
          to="/feed?compose=shiplog"
          className="flex items-center justify-center gap-2 w-full py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <TrendingUp size={14} /> Share today's progress
        </Link>
      )}
    </section>
  );
}

function UpcomingEvents() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.upcomingEvents(),
    queryFn: () => feedService.getUpcomingEvents(4),
    staleTime: STALE.sidebar,
  });
  const upcoming = data?.upcoming ?? [];

  return (
    <RailSection title="Upcoming events" action={{ label: 'All events', to: '/events' }}>
      {isLoading ? <RailSkeleton rows={3} avatar /> : upcoming.length === 0 ? <RailEmpty>No upcoming events.</RailEmpty> : upcoming.map((event: any) => (
        <RailRow key={event.id} to={`/events/${event.id}`}>
          <div className="w-10 shrink-0 text-center rounded-lg bg-primary/10 text-primary py-1">
            <p className="text-[10px] font-semibold uppercase leading-none">{formatDate(event.startMs, 'MMM')}</p>
            <p className="text-base font-bold leading-tight">{formatDate(event.startMs, 'd')}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold line-clamp-2 leading-snug">{event.title}</p>
            <p className="text-xs text-black/50 dark:text-white/50">{formatDate(event.startMs, 'EEE, h:mm a')}</p>
          </div>
        </RailRow>
      ))}
    </RailSection>
  );
}

function timeLeft(deadline?: number): string {
  if (!deadline) return 'Open';
  const ms = deadline - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h left` : 'Closing soon';
}

function Challenges() {
  const { data: challenges = [], isLoading } = useQuery({
    queryKey: queryKeys.featuredChallenges(),
    queryFn: () => feedService.getFeaturedChallenges(3),
    staleTime: STALE.sidebar,
  });

  return (
    <RailSection title="Open challenges" action={{ label: 'All', to: '/challenges' }}>
      {isLoading ? <RailSkeleton rows={3} avatar /> : challenges.length === 0 ? <RailEmpty>No open challenges.</RailEmpty> : challenges.map((c: any) => (
        <RailRow key={c.id} to={`/challenges/${c.id}`}>
          <Avatar src={c.image} seed={c.id} size={36} square />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{c.title}</p>
            <p className="text-xs text-black/50 dark:text-white/50">
              {c.rewardPool?.cashAmount ? `$${Number(c.rewardPool.cashAmount).toLocaleString()} · ` : ''}
              {timeLeft(c.deadlines?.submissionEnd)}
            </p>
          </div>
        </RailRow>
      ))}
    </RailSection>
  );
}

function Articles() {
  const { data: articles = [], isLoading } = useQuery({
    queryKey: queryKeys.featuredArticles(),
    queryFn: () => feedService.getFeaturedArticles(3),
    staleTime: STALE.sidebar,
  });

  return (
    <RailSection title="Recent articles" action={{ label: 'All', to: '/articles' }}>
      {isLoading ? <RailSkeleton rows={3} /> : articles.length === 0 ? <RailEmpty>No articles yet.</RailEmpty> : articles.map((a: any) => (
        <RailRow key={a.id} to={`/article/${a.id}`}>
          {a.coverImage && (
            <img
              src={a.coverImage}
              alt=""
              className="w-14 h-10 rounded-lg object-cover shrink-0 bg-black/5 dark:bg-white/10"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold line-clamp-2 leading-snug">{a.title}</p>
            {a.authorName && <p className="text-xs text-black/50 dark:text-white/50 truncate">{a.authorName}</p>}
          </div>
        </RailRow>
      ))}
    </RailSection>
  );
}
