import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/utils';
import { isLive, startsInLabel } from '../../lib/eventRanking';
import { communityHue } from '../CommunityCard';
import { eventHref } from '../../lib/eventLinks';

const hasImage = (url?: string) => !!url && url.trim() !== '' && !url.includes('picsum.photos');

/** Horizontal strip of compact event tiles ("Happening now", "Your events"). */
export default function EventRail({ title, events, note }: { title: string; events: any[]; note?: (e: any) => string }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-black/60 dark:text-white/60 mb-3">{title}</h2>
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {events.map(e => {
          const live = isLive(e);
          const hue = communityHue(e.id);
          return (
            <Link key={e.id} to={eventHref(e)} className="shrink-0 w-[250px] flex items-center gap-3 p-3 rounded-2xl border border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors">
              <span
                className="shrink-0 w-11 h-11 rounded-xl overflow-hidden flex flex-col items-center justify-center leading-none"
                style={hasImage(e.banner) ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 45) % 360} 65% 48%))`, color: '#fff' }}
              >
                {hasImage(e.banner) ? <img src={e.banner} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : (
                  <>
                    <span className="text-[9px] font-bold uppercase opacity-90">{formatDate(e.startDate, 'MMM')}</span>
                    <span className="text-base font-bold">{formatDate(e.startDate, 'd')}</span>
                  </>
                )}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold truncate">{e.title}</span>
                <span className="flex items-center gap-1.5 text-xs text-black/50 dark:text-white/50">
                  {live && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  <span className="truncate">{note?.(e) ?? (live ? `${e.attendeeCount || 0} in the room` : startsInLabel(e) || formatDate(e.startDate, 'EEE, h:mm a'))}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
