import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Plus, Clock, Users, ArrowRight } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { Link } from 'react-router-dom';
import CreateEventModal from './CreateEventModal';

interface CommunityEventsProps {
  communityId: string;
  isAdmin: boolean;
  isMember: boolean;
}

export default function CommunityEvents({ communityId, isAdmin, isMember }: CommunityEventsProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!communityId) return;

    let q;
    if (isMember) {
      // Members can see both public and community-only events
      q = query(
        collection(db, 'events'),
        where('communityId', '==', communityId),
        where('visibility', 'in', ['public', 'community']),
        orderBy('startDate', 'asc')
      );
    } else {
      // Non-members can only see public events
      q = query(
        collection(db, 'events'),
        where('communityId', '==', communityId),
        where('visibility', '==', 'public'),
        orderBy('startDate', 'asc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(fetchedEvents);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching community events:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [communityId, isMember]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Community Events</h2>
          <p className="text-foreground/40 text-sm mt-1">Exclusive meetups, workshops and sessions for this community.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold shadow-[0_0_20px_rgba(0,242,255,0.2)] hover:scale-105 transition-all"
          >
            <Plus size={18} /> Create Event
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 glass rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : events.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <Link key={event.id} to={`/events/${event.id}`}>
              <div className="glass rounded-2xl overflow-hidden group hover:border-primary/50 transition-all flex flex-col h-full bg-background border border-foreground/10 hover:shadow-[0_0_20px_rgba(0,242,255,0.1)]">
                <div className="aspect-[16/9] w-full relative shrink-0">
                  <img 
                    src={(event.banner && event.banner.trim() !== '') ? event.banner : `https://picsum.photos/seed/${event.id}/600/300`} 
                    alt={event.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 right-2">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                      event.visibility === 'public' ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground'
                    }`}>
                      {event.visibility === 'public' ? 'Public' : 'Members Only'}
                    </span>
                  </div>
                  {event.isPaid && (
                    <div className="absolute bottom-2 left-2">
                      <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-md text-yellow-500 rounded text-[8px] font-bold">
                        ${event.price}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="text-sm font-bold mb-2 group-hover:text-primary transition-colors line-clamp-1 text-foreground">{event.title}</h3>
                  <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-3 text-[10px] text-foreground/50">
                      <div className="flex items-center gap-1">
                        <Calendar size={12} className="text-primary" />
                        {formatDate(event.startDate, 'MMM d')}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-primary" />
                        {formatDate(event.startDate, 'h:mm a')}
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-foreground/10">
                      <div className="flex items-center gap-1 text-[10px] text-foreground/40">
                        <Users size={12} />
                        {event.attendeeCount || 0}
                      </div>
                      <ArrowRight size={12} className="text-foreground/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-background rounded-3xl border-2 border-dashed border-foreground/10">
          <Calendar size={48} className="mx-auto mb-4 text-foreground/10" />
          <h3 className="text-xl font-bold mb-2 text-foreground">No events scheduled</h3>
          <p className="text-foreground/40 mb-6">Stay tuned for upcoming workshops and meetups!</p>
          {isAdmin && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className="text-primary font-bold hover:underline"
            >
              Schedule the first event
            </button>
          )}
        </div>
      )}

      <CreateEventModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
        communityId={communityId}
      />
    </div>
  );
}
