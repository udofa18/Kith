import { Link } from 'react-router-dom';
import { Calendar, Users, MapPin, Clock, ArrowRight } from 'lucide-react';
import { formatDate } from '../lib/utils';

interface EventCardProps {
  event: any;
  viewMode?: 'grid' | 'list';
  compact?: boolean;
}

export default function EventCard({ event, viewMode = 'grid', compact = false }: EventCardProps) {
  const isList = viewMode === 'list';

  return (
    <Link to={`/events/${event.id}`}>
      <div className={`glass rounded-2xl overflow-hidden group hover:border-primary/50 transition-all duration-300 ${isList ? 'flex gap-4 h-44' : 'h-full flex flex-col'}`}>
        {/* Banner Image */}
        <div className={`relative overflow-hidden ${isList ? 'w-64 h-full shrink-0' : compact ? 'aspect-video w-full' : 'aspect-[16/10] w-full'}`}>
          <img 
            src={(event.banner && event.banner.trim() !== '') ? event.banner : `https://picsum.photos/seed/${event.id}/800/400`} 
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          {/* Price Badge */}
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
            <div className={`px-2 py-1 rounded-xl backdrop-blur-md border border-white/10 text-[10px] font-bold text-white shadow-xl ${
              event.status === 'live' ? 'bg-red-500 animate-pulse border-red-400' : 
              event.status === 'ended' ? 'bg-zinc-800 text-white/50' : 
              'bg-black/60'
            }`}>
              {event.status === 'live' ? '● LIVE' : 
               event.status === 'ended' ? 'ENDED' : 
               'UPCOMING'}
            </div>
            <div className="px-2 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white">
              {event.isPaid ? `$${event.price}` : 'FREE'}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className={`${compact ? 'p-3' : 'p-3.5'} flex flex-col flex-1`}>
          <div className={`flex items-center gap-2 ${compact ? 'mb-1.5' : 'mb-2'}`}>
            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${
              event.isOffline ? 'bg-orange-500/20 text-orange-500' : 'bg-purple-500/20 text-purple-500'
            }`}>
              {event.isOffline ? 'Offline' : 'Online'}
            </span>
            {event.category && (
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/40 text-[8px] font-bold uppercase tracking-widest">
                {event.category}
              </span>
            )}
          </div>

          <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-bold mb-1 group-hover:text-primary transition-colors line-clamp-2 leading-snug`}>
            {event.title}
          </h3>
          
          {!compact && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                {event.hostPhoto && event.hostPhoto.trim() !== '' ? (
                  <img src={event.hostPhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${event.hostId}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                )}
              </div>
              <span className="text-[10px] text-white/40">
                Hosted by <span className="text-white/60 font-medium">{event.hostName || 'Organizer'}</span>
              </span>
            </div>
          )}

          <div className={`space-y-2.5 ${compact ? 'pt-2' : 'pt-3'} border-t border-white/5 mt-auto`}>
            {/* Date and Time */}
            <div className="flex items-center gap-2 text-white/90">
              <Calendar size={14} className="text-primary/60 shrink-0" />
              <span className={`${compact ? 'text-[10px]' : 'text-[12px]'} font-bold`}>
                {formatDate(event.startDate, 'MMM d, HH:mm')}
              </span>
            </div>

            {!compact && (
              /* Location / City */
              <div className="flex items-center gap-2 text-white/70">
                <MapPin size={14} className="text-white/30 shrink-0" />
                <span className="text-[11px] font-medium truncate">
                  {event.isOffline 
                    ? (event.locationName || event.locationAddress || 'Location TBD')
                    : 'Virtual Event'
                  }
                </span>
              </div>
            )}

            {/* Participants and Action */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5">
                <Users size={12} className="text-primary/60" />
                <span className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-bold text-white/80`}>
                  {event.attendeeCount || 0} attending
                </span>
              </div>
              <div className={`${compact ? 'w-6 h-6 rounded-lg' : 'w-8 h-8 rounded-xl'} bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-lg shadow-primary/5`}>
                <ArrowRight size={compact ? 12 : 16} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
