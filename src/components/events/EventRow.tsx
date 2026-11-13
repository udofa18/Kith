import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, MapPin, Megaphone, Radio, Users, Video } from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { cityOf } from '../../lib/eventCities';
import { isEnded, isLive, startsInLabel } from '../../lib/eventRanking';
import { formatEventPrice } from '../../lib/payments';
import EventCover from './EventCover';
import { eventHref } from '../../lib/eventLinks';

interface Props {
  event: any;
  promoted?: boolean;
  isRegistered?: boolean;
}

/** Editorial event row: one image, one story, thin divider — instead of another card. */
export default function EventRow({ event, promoted = false, isRegistered = false }: Props) {
  const live = isLive(event);
  const ended = isEnded(event);
  const city = cityOf(event);
  const where = event.isOffline ? event.locationName || city || 'Location TBD' : 'Online';
  const going = event.attendeeCount || 0;
  const price = formatEventPrice(event);

  return (
    <Link
      to={eventHref(event)}
      className="group grid grid-cols-[92px_1fr] items-center gap-4 border-b border-border py-4 transition-colors last:border-b-0 hover:bg-foreground/[0.025] sm:grid-cols-[148px_1fr_auto] sm:gap-5 sm:py-5"
    >
      <EventCover
        event={event}
        className="aspect-[4/3] rounded-2xl sm:rounded-[20px]"
        imgClassName="transition-transform duration-700 group-hover:scale-[1.04]"
      >
        <span className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur-md sm:left-3 sm:top-3">
          {formatDate(event.startDate, 'MMM d')}
        </span>
      </EventCover>

      <div className="min-w-0 py-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {live && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-red-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live now
            </span>
          )}
          {!live && !ended && startsInLabel(event) && (
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{startsInLabel(event)}</span>
          )}
          {ended && <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Ended</span>}
          {promoted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300">
              <Megaphone size={10} /> Promoted
            </span>
          )}
          {isRegistered && (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-success">Going</span>
          )}
          {event.category && <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">{event.category}</span>}
        </div>

        <h3 className="mt-1.5 line-clamp-2 font-display text-[19px] font-semibold leading-[1.12] tracking-[-0.035em] text-foreground transition-colors group-hover:text-primary sm:text-[22px]">
          {event.title}
        </h3>

        {event.description && (
          <p className="mt-1.5 line-clamp-1 text-[13px] leading-relaxed text-muted-foreground">{event.description}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {event.isOffline ? <MapPin size={13} /> : <Video size={13} />}
            <span className="max-w-[15rem] truncate">{where}{event.isOffline && city && where !== city ? ` · ${city}` : ''}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} />
            {live ? 'On air now' : `${formatDate(event.startDate, 'h:mm a')}${event.timezone ? ` · ${event.timezone}` : ''}`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users size={13} />
            {going.toLocaleString()} going
          </span>
        </div>
      </div>

      <div className="col-span-2 flex items-center justify-between gap-4 pl-[108px] sm:col-span-1 sm:flex-col sm:items-end sm:justify-center sm:gap-3 sm:pl-0">
        <span className="text-sm font-semibold text-foreground">{price}</span>
        <span className={`grid h-10 w-10 place-items-center rounded-full border transition-all duration-300 ${
          live
            ? 'border-red-500/30 bg-red-500 text-white'
            : 'border-border bg-surface text-muted-foreground group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:border-primary/30 group-hover:bg-primary group-hover:text-primary-foreground'
        }`}>
          {live ? <Radio size={17} /> : <ArrowUpRight size={18} />}
        </span>
      </div>
    </Link>
  );
}
