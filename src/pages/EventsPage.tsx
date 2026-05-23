import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, collectionGroup, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, MapPin, Users, Search, Filter, Plus, 
  Clock, Globe, Shield, ArrowRight, LayoutGrid, List,
  PartyPopper, Palette, GraduationCap, Heart, GlassWater, Award, Leaf, Carrot, Tent,
  DollarSign, Map as MapIcon, ChevronLeft, ChevronRight, Zap
} from 'lucide-react';
import { formatDate } from '../lib/utils';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CreateEventModal from '../components/CreateEventModal';
import CreateInstantSessionModal from '../components/CreateInstantSessionModal';
import EventCard from '../components/EventCard';

import { toast } from 'react-hot-toast';

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'community'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [locationFilter, setLocationFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [cityFilter, setCityFilter] = useState<string>('All Cities');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInstantModal, setShowInstantModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [registeredEvents, setRegisteredEvents] = useState<any[]>([]);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = 300;
      categoryScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    // Query for all public events
    const q = query(
      collection(db, 'events'),
      where('visibility', '==', 'public'),
      orderBy('startDate', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(fetchedEvents);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!auth.currentUser) {
      setRegisteredEvents([]);
      return;
    }

    const q = query(
      collectionGroup(db, 'registrations'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const eventIds = snapshot.docs.map(d => d.data().eventId);
      
      if (eventIds.length === 0) {
        setRegisteredEvents([]);
        return;
      }

      // Fetch the actual event data for these IDs
      const eventPromises = eventIds.map(async (id) => {
        const docRef = doc(db, 'events', id);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
      });

      const eventsData = await Promise.all(eventPromises);
      setRegisteredEvents(eventsData.filter(e => e !== null));
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const categories = [
    { name: 'All', icon: '🌍' },
    { name: 'Festival', icon: '🥳' },
    { name: 'Tech', icon: '💻' },
    { name: 'AI', icon: '🧠' },
    { name: 'Arts', icon: '🎨' },
    { name: 'Educational', icon: '🎓' },
    { name: 'Pop culture', icon: '❤️' },
    { name: 'Food & Drinks', icon: '🍸' },
    { name: 'Convention', icon: '🏅' },
    { name: 'Community', icon: '👥' },
    { name: 'Holiday', icon: '🍃' },
    { name: 'Markets', icon: '🥕' },
    { name: 'Fair', icon: '🎪' },
    { name: 'Fintech', icon: '💳' },
    { name: 'Fashion', icon: '👗' },
    { name: 'Leadership', icon: '👑' },
    { name: 'Coaching', icon: '💡' },
  ];

  // Extract unique cities from events
  const cities = ['All Cities', ...new Set(events
    .filter(e => e.isOffline && e.locationAddress)
    .map(e => {
      const parts = e.locationAddress.split(',');
      return parts.length > 1 ? parts[parts.length - 2].trim() : parts[0].trim();
    })
    .filter(Boolean)
  )].sort();

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         event.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filter === 'all' || event.eventType === filter;
    const matchesCategory = categoryFilter === 'All' || event.category === categoryFilter;
    const matchesPrice = priceFilter === 'all' || (priceFilter === 'free' ? !event.isPaid : event.isPaid);
    const matchesLocation = locationFilter === 'all' || (locationFilter === 'online' ? !event.isOffline : event.isOffline);
    
    let matchesCity = true;
    if (cityFilter !== 'All Cities' && event.isOffline) {
      matchesCity = event.locationAddress?.toLowerCase().includes(cityFilter.toLowerCase());
    } else if (cityFilter !== 'All Cities' && !event.isOffline) {
      matchesCity = false;
    }

    return matchesSearch && matchesType && matchesCategory && matchesPrice && matchesLocation && matchesCity;
  });

  const myEvents = events.filter(e => e.hostId === auth.currentUser?.uid).slice(0, 3);
  const popularEvents = [...events].sort((a, b) => (b.attendeeCount || 0) - (a.attendeeCount || 0)).slice(0, 3);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-background text-foreground">
      {/* Top Banner Area (Hero Section) */}
      <div className="relative bg-gradient-to-r from-rose-950 via-orange-900 dark:to-[#0B0F19] w-full pt-16 pb-16 overflow-hidden border-b border-foreground/5 mb-8">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=2070&auto=format&fit=crop')] object-cover opacity-10 mix-blend-overlay"></div>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">
                Discover <span className="text-orange-400">Events</span>
              </h1>
              <p className="text-white/80 text-lg max-w-xl leading-relaxed">
                Connect with the community through workshops, hackathons, and meetups. Join the best events in the ecosystem.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if (!auth.currentUser) {
                    toast.error('Sign in to start a session');
                    return;
                  }
                  setShowInstantModal(true);
                }}
                className="flex items-center gap-2 bg-white/10 text-white px-6 py-3 rounded-full font-bold hover:bg-white/20 transition-all border border-white/10"
              >
                <Zap size={20} className="text-yellow-400 fill-yellow-400" />
                <span>Instant Session</span>
              </button>
              <button 
                onClick={() => {
                  if (!auth.currentUser) {
                    toast.error('Sign in to create your own events');
                    return;
                  }
                  setShowCreateModal(true);
                }}
                className="flex items-center gap-2 bg-foreground text-background px-6 py-3 rounded-full font-bold hover:bg-foreground/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <Plus size={20} />
                <span>Create Event</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 pb-20">
        
          {/* Category Filter Bar - Contained with Navigation */}
          <div className="mb-10 w-full border-b border-foreground/5 relative group">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => scrollCategories('left')}
                className="w-10 h-10 rounded-full bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-primary transition-all -ml-5 shadow-xl"
              >
                <ChevronLeft size={20} />
              </button>
            </div>

            <div 
              ref={categoryScrollRef}
              className="overflow-x-auto no-scrollbar scroll-smooth"
            >
              <div className="flex justify-between md:justify-start items-center gap-2 md:gap-8 min-w-full py-4">
                {categories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => setCategoryFilter(cat.name)}
                    className={`flex flex-col items-center gap-3 group transition-all relative pb-2 min-w-[100px] ${
                      categoryFilter === cat.name ? 'text-white' : 'text-white/40 hover:text-white/60'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all text-2xl ${
                      categoryFilter === cat.name ? 'bg-white/10 scale-110 shadow-lg shadow-white/5' : 'bg-transparent group-hover:bg-white/5'
                    }`}>
                      {cat.icon}
                    </div>
                    <span className={`text-[11px] font-bold uppercase tracking-[0.1em] transition-all whitespace-nowrap ${
                      categoryFilter === cat.name ? 'opacity-100' : 'opacity-60'
                    }`}>
                      {cat.name}
                    </span>
                    {categoryFilter === cat.name && (
                      <motion.div 
                        layoutId="activeCatUnderline" 
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-primary rounded-full shadow-[0_0_10px_rgba(0,242,255,0.8)]" 
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => scrollCategories('right')}
                className="w-10 h-10 rounded-full bg-black/80 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-primary transition-all -mr-5 shadow-xl"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row gap-8">
            {/* Left Column: Search, Filters, List */}
            <div className="flex-1 min-w-0">
              {/* Filters & Search */}
              <div className="flex flex-col md:flex-row gap-4 mb-8 relative">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                  <input 
                    type="text"
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary transition-all text-sm"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Filter Dropdown Toggle */}
                  <div className="relative">
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all text-sm font-bold ${
                        showFilters ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <Filter size={18} />
                      Filters
                      {(filter !== 'all' || priceFilter !== 'all' || locationFilter !== 'all' || cityFilter !== 'All Cities') && (
                        <span className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </button>

                    <AnimatePresence>
                      {showFilters && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setShowFilters(false)} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 top-full mt-2 w-72 bg-[#1a1a1a] border border-white/10 rounded-3xl shadow-2xl z-50 p-6 space-y-6"
                          >
                            {/* Host Type */}
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Host Type</label>
                              <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                                {(['all', 'user', 'community'] as const).map((f) => (
                                  <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                      filter === f ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                                    }`}
                                  >
                                    {f}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Price Filter */}
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Price</label>
                              <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                                {(['all', 'free', 'paid'] as const).map((p) => (
                                  <button
                                    key={p}
                                    onClick={() => setPriceFilter(p)}
                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                      priceFilter === p ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Event Type (Online/Offline) */}
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Format</label>
                              <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                                {(['all', 'online', 'offline'] as const).map((l) => (
                                  <button
                                    key={l}
                                    onClick={() => setLocationFilter(l)}
                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                      locationFilter === l ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                                    }`}
                                  >
                                    {l}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* City Filter */}
                            {locationFilter !== 'online' && cities.length > 1 && (
                              <div className="space-y-3">
                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">City</label>
                                <select 
                                  value={cityFilter}
                                  onChange={(e) => setCityFilter(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-primary transition-all [color-scheme:dark]"
                                >
                                  {cities.map(city => (
                                    <option key={city} value={city}>{city}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <button 
                              onClick={() => {
                                setFilter('all');
                                setPriceFilter('all');
                                setLocationFilter('all');
                                setCityFilter('All Cities');
                                setCategoryFilter('All');
                              }}
                              className="w-full py-2 text-[10px] font-bold text-primary hover:underline"
                            >
                              Reset All Filters
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
                    <button 
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/30'}`}
                    >
                      <LayoutGrid size={18} />
                    </button>
                    <button 
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/30'}`}
                    >
                      <List size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Events Grid */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-80 glass rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : filteredEvents.length > 0 ? (
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-4"}>
                  <AnimatePresence mode="popLayout">
                    {filteredEvents.map((event) => (
                      <motion.div
                        key={event.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                      >
                        <EventCard event={event} viewMode={viewMode} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="text-center py-20 glass rounded-3xl">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar size={32} className="text-white/20" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No events found</h3>
                  <p className="text-white/40">Try adjusting your search or filters.</p>
                </div>
              )}
            </div>

            {/* Right Sidebar: My Events, Popular Events, Registered Events */}
            <div className="w-full xl:w-80 space-y-8">
              {/* Registered Events */}
              {auth.currentUser && (
                <div className="glass rounded-[32px] p-6 border border-primary/20 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex items-center justify-between mb-6 relative">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <h3 className="text-lg font-bold">Registered</h3>
                    </div>
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                      {registeredEvents.length}
                    </span>
                  </div>
                  <div className="space-y-4 relative">
                    {registeredEvents.length > 0 ? registeredEvents.map(event => (
                      <Link key={event.id} to={`/events/${event.id}`} className="flex items-center gap-4 group/item">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-foreground/10 flex items-center justify-center bg-foreground/5">
                          {event.banner ? (
                            <img src={event.banner} className="w-full h-full object-cover group-hover/item:scale-110 transition-transform" referrerPolicy="no-referrer" />
                          ) : (
                            <Calendar size={20} className="text-foreground/20" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold truncate group-hover/item:text-primary transition-colors">{event.title}</h4>
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              event.status === 'live' ? 'bg-red-500 animate-pulse' : 
                              event.status === 'ended' ? 'bg-zinc-500' : 'bg-primary'
                            }`} />
                            <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider">{event.status}</p>
                          </div>
                        </div>
                      </Link>
                    )) : (
                      <div className="text-center py-4 px-2 border border-dashed border-foreground/10 rounded-2xl">
                        <p className="text-[10px] text-white/20 italic">No registrations yet</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* My Events */}
              <div className="glass rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">My Events</h3>
                  <Link to="/profile" className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">View All</Link>
                </div>
                <div className="space-y-4">
                  {myEvents.length > 0 ? myEvents.map(event => (
                    <Link key={event.id} to={`/events/${event.id}`} className="flex items-center gap-4 group">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-foreground/5">
                        {event.banner ? (
                          <img src={event.banner} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                        ) : (
                          <Calendar size={20} className="text-foreground/20" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors">{event.title}</h4>
                        <p className="text-[10px] text-white/40">{formatDate(event.startDate, 'MMM d, HH:mm')}</p>
                      </div>
                    </Link>
                  )) : (
                    <p className="text-xs text-white/30 italic">No events hosted yet.</p>
                  )}
                </div>
              </div>

              {/* Popular Events */}
              <div className="glass rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Popular</h3>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Award size={16} />
                  </div>
                </div>
                <div className="space-y-4">
                  {popularEvents.map(event => (
                    <Link key={event.id} to={`/events/${event.id}`} className="flex items-center gap-4 group">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-foreground/5">
                        {event.banner ? (
                          <img src={event.banner} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                        ) : (
                          <Calendar size={20} className="text-foreground/20" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors">{event.title}</h4>
                        <div className="flex items-center gap-2">
                          <Users size={10} className="text-primary/60" />
                          <span className="text-[10px] text-white/40 font-bold">{event.attendeeCount || 0} attending</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      <CreateEventModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
      />

      <CreateInstantSessionModal
        isOpen={showInstantModal}
        onClose={() => setShowInstantModal(false)}
      />
    </div>
  );
}
