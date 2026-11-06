import { Link } from 'react-router-dom';
import { ArrowUpRight, Flame, Megaphone, MapPin, Video } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { isFillingFast, isLive, spotsLeft, startsInLabel } from '../lib/eventRanking';
import { emojiFor } from '../lib/eventCategories';
import { themeGradient } from '../lib/eventTheme';
import { cityOf } from '../lib/eventCities';
import { formatEventPrice } from '../lib/payments';

const hasImage = (url?: string) => !!url && url.trim() !== '' && !url.includes('picsum.photos');

interface Props {
  event: any;
  /** Wider, shorter poster for profile tabs. */
  compact?: boolean;
  promoted?: boolean;
  isRegistered?: boolean;
  /** Render without a link (create-flow preview). */
  preview?: boolean;
}

/** Poster-style event card: the image (or vibe gradient) carries the card. */
export default function EventCard({ event, compact = false, promoted = false, isRegistered = false, preview = false }: Props) {
  const live = isLive(event);
  const ended = event.status === 'ended';
  const soon = live ? '' : startsInLabel(event);
  const left = spotsLeft(event);
  const going = event.attendeeCount || 0;
  const city = cityOf(event);
  const where = event.isOffline ? event.locationName || city || 'Location TBD' : 'Online';
  const price = formatEventPrice(event);

  const card = (
    <article className={`group relative overflow-hidden rounded-3xl bg-black ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-pink-500/70 hover:-translate-y-1 hover:shadow-2xl hover:shadow-pink-500/10 transition-all duration-300 ${compact ? 'aspect-[16/10]' : 'aspect-[4/5]'} ${promoted ? 'ring-2 ring-amber-400/70' : ''}`} style={{ color: '#fff' }}>
      {hasImage(event.banner) ? (
        <img src={event.banner} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      ) : (
        <div className="absolute inset-0 overflow-hidden" style={{ background: themeGradient(event) }}>
          <span className="absolute -right-4 -top-2 text-[9rem] leading-none opacity-25 rotate-12 select-none group-hover:rotate-6 group-hover:scale-110 transition-transform duration-500">{emojiFor(event.category)}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

      <div className="absolute top-3 left-3 right-3 flex items-start gap-2">
        <span className="flex flex-col items-center leading-none px-2.5 py-1.5 rounded-xl bg-white text-black shadow-lg">
          <span className="text-[10px] font-bold uppercase text-pink-600">{formatDate(event.startDate, 'MMM')}</span>
          <span className="text-lg font-extrabold font-display">{formatDate(event.startDate, 'd')}</span>
        </span>
        <div className="flex flex-col items-start gap-1.5">
          {promoted && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-xs font-bold" style={{ color: '#000' }}><Megaphone size={11} /> Promoted</span>}
          {live && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500 text-xs font-bold"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE</span>}
          {!live && soon && <span className="px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-md text-xs font-semibold">{soon}</span>}
          {isFillingFast(event) && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-xs font-bold"><Flame size={11} /> {left} left</span>}
          {ended && <span className="px-2 py-0.5 rounded-full bg-black/60 text-xs font-semibold">Ended</span>}
        </div>
        <span className="ml-auto px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md text-xs font-bold">{price}</span>
      </div>

      <div className="absolute bottom-0 inset-x-0 p-4">
        {event.category && <p className="text-[11px] font-bold uppercase tracking-wider text-pink-300">{emojiFor(event.category)} {event.category}</p>}
        <h3 className={`mt-1 font-display font-extrabold leading-tight line-clamp-2 ${compact ? 'text-lg' : 'text-2xl'}`} style={{ color: '#fff' }}>{event.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/80 truncate">
          {event.isOffline ? <MapPin size={14} className="shrink-0" /> : <Video size={14} className="shrink-0" />}
          <span className="truncate">{where}{event.isOffline && city && where !== city ? ` · ${city}` : ''}</span>
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-white/80">
            {isRegistered ? <b className="text-emerald-300">✓ You’re going</b> : <><b className="text-white">{going.toLocaleString()}</b> going · {formatDate(event.startDate, 'h:mm a')}</>}
          </span>
          <span className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300"><ArrowUpRight size={18} /></span>
        </div>
      </div>
    </article>
  );

  return preview ? <div className="pointer-events-none">{card}</div> : <Link to={`/events/${event.id}`} className="block">{card}</Link>;
}
