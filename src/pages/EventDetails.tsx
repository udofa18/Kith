import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, increment, updateDoc, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, Clock, MapPin, Users, Globe, ShieldCheck,
  ArrowLeft, Rocket, Share2, AlertCircle, Check, Lock, X,
  ExternalLink, MessageSquare, Award, DollarSign,
  ArrowRight, Info, CalendarPlus, Map as MapIcon,
  Trash2
} from 'lucide-react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { toast } from 'react-hot-toast';

import { formatDate } from '../lib/utils';
import UserHoverCard from '../components/UserHoverCard';
import Sidebar from '../components/Sidebar';
import CreateEventModal from '../components/CreateEventModal';
import { updateEventStatus } from '../lib/eventUtils';
import ConfirmModal from '../components/ConfirmModal';
import CoHostManagementModal from '../components/CoHostManagementModal';
import BoostEventModal from '../components/events/BoostEventModal';
import { isPromoted } from '../lib/eventRanking';

export default function EventDetails() {
  const [isLoaded, setIsLoaded] = useState(false);
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRegisteredState, setIsRegisteredState] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [host, setHost] = useState<any>(null);
  const [community, setCommunity] = useState<any>(null);
  const [isMember, setIsMember] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [showEarlyAccessConfirm, setShowEarlyAccessConfirm] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [isCoHostModalOpen, setIsCoHostModalOpen] = useState(false);
  const [coHosts, setCoHosts] = useState<any[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const initMaps = async () => {
      const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) return;

      try {
        setOptions({
          key: apiKey
        });
        
        await importLibrary("maps");
        await importLibrary("marker");
        
        setIsLoaded(true);
      } catch (err) {
        console.error("Maps load error in details:", err);
      }
    };

    initMaps();
  }, []);

  useEffect(() => {
    if (!eventId) return;

    const unsubscribe = onSnapshot(doc(db, 'events', eventId), async (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as any;
        
        // Auto-update status if needed
        await updateEventStatus(data);
        
        setEvent(data);
        
        // Fetch host info
        if (data.hostId) {
          const hostDoc = await getDoc(doc(db, 'users', data.hostId));
          if (hostDoc.exists()) setHost({ id: hostDoc.id, ...hostDoc.data() });
        }

        // Fetch co-hosts info
        if (data.coHostIds && data.coHostIds.length > 0) {
          const coHostProfiles = await Promise.all(
            data.coHostIds.map(async (id: string) => {
              const userDoc = await getDoc(doc(db, 'users', id));
              return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
            })
          );
          setCoHosts(coHostProfiles.filter(Boolean));
        } else {
          setCoHosts([]);
        }

        // Fetch community info if applicable
        if (data.communityId) {
          const commDoc = await getDoc(doc(db, 'communities', data.communityId));
          if (commDoc.exists()) {
            setCommunity({ id: commDoc.id, ...commDoc.data() });
            
            // Check membership
            if (auth.currentUser) {
              const memberDoc = await getDoc(doc(db, 'communities', data.communityId, 'members', auth.currentUser.uid));
              setIsMember(memberDoc.exists());
            }
          }
        }

        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    // Check registration
    if (auth.currentUser) {
      const regUnsubscribe = onSnapshot(doc(db, 'events', eventId, 'registrations', auth.currentUser.uid), (snap) => {
        setIsRegisteredState(snap.exists());
      });

      // Fetch participants
      const participantsQuery = query(collection(db, 'events', eventId, 'registrations'), limit(15));
      const participantsUnsubscribe = onSnapshot(participantsQuery, async (snap) => {
        const participantData = await Promise.all(
          snap.docs.map(async (d) => {
            const userDoc = await getDoc(doc(db, 'users', d.id));
            return { id: userDoc.id, ...userDoc.data() };
          })
        );
        setParticipants(participantData.filter(p => (p as any).profileImage));
      });

      return () => {
        unsubscribe();
        regUnsubscribe();
        participantsUnsubscribe();
      };
    }

    return () => unsubscribe();
  }, [eventId, auth.currentUser]);

  // Returning from Stripe: the server verifies the paid session and applies the boost.
  const boostSession = searchParams.get('boost_session');
  useEffect(() => {
    if (!boostSession || !auth.currentUser) return;
    (async () => {
      try {
        const res = await fetch('/api/boost-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser!.getIdToken()}` },
          body: JSON.stringify({ sessionId: boostSession }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not confirm boost');
        toast.success('Your event is boosted! 🚀');
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
  }, [boostSession, auth.currentUser?.uid]);

  const handleRegister = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to register for events');
      return;
    }
    if (!eventId || !event) return;
    
    if (event.isPaid && !isRegisteredState) {
      // In a real app, redirect to Stripe
      toast.error("This is a paid event. Payment integration would go here.");
      return;
    }

    setRegistering(true);
    try {
      const regRef = doc(db, 'events', eventId, 'registrations', auth.currentUser.uid);
      const eventRef = doc(db, 'events', eventId);

      if (isRegisteredState) {
        await deleteDoc(regRef);
        await updateDoc(eventRef, { attendeeCount: increment(-1) });
      } else {
        await setDoc(regRef, {
          userId: auth.currentUser.uid,
          eventId,
          registeredAt: new Date().toISOString(),
          paid: event.isPaid ? true : false, // Mocking payment success
          amount: event.price || 0
        });
        await updateDoc(eventRef, { attendeeCount: increment(1) });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${eventId}/registrations`);
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary font-mono">LOADING_EVENT_DATA...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <h1 className="text-2xl font-bold mb-2 text-foreground">Event Not Found</h1>
        <p className="text-foreground/40 mb-8 text-center max-w-md">
          The event you're looking for doesn't exist or has been removed.
        </p>
        <Link to="/events" className="bg-foreground text-background px-6 py-3 rounded-xl font-bold hover:scale-105 transition-all">
          Back to Events
        </Link>
      </div>
    );
  }

  const isAccessRestricted = event.visibility === 'community' && !isMember;
  const isRegistered = isRegisteredState || (auth.currentUser?.uid === event.hostId); 
  const isHost = auth.currentUser?.uid === event.hostId;
  const isCoHost = event.coHostIds?.includes(auth.currentUser?.uid);
  const canManage = isHost || isCoHost;
  const canSeeDetails = !isAccessRestricted || isRegistered || canManage;

  const handleStartSession = async (allowEarly: boolean = true) => {
    if (!canManage || !eventId) return;
    
    // Check if it's early (more than 5 mins before)
    const now = new Date();
    const startDate = new Date(event.startDate);
    const fiveMinsBefore = new Date(startDate.getTime() - 5 * 60 * 1000);
    
    if (now < fiveMinsBefore && !showEarlyAccessConfirm && event.status !== 'live') {
      setShowEarlyAccessConfirm(true);
      return;
    }

    setStartingSession(true);
    try {
      await updateDoc(doc(db, 'events', eventId), { 
        status: 'live',
        allowEarlyAccess: allowEarly,
        lastStartedAt: new Date().toISOString()
      });
      
      // Also ensure the session document is updated/created
      const sessionRef = doc(db, 'eventSessions', eventId);
      await setDoc(sessionRef, { 
        status: 'live',
        restartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      setShowEarlyAccessConfirm(false);
      navigate(`/events/${eventId}/live`);
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error('Failed to start session');
    } finally {
      setStartingSession(false);
    }
  };

  const handleAddToCalendar = () => {
    if (!event || !event.startDate) return;
    
    const title = encodeURIComponent(event.title);
    const description = encodeURIComponent(event.description || '');
    const startDate = new Date(event.startDate).toISOString().replace(/-|:|\.\d+/g, '');
    
    // Use endDate if available, otherwise default to 1 hour
    const endDateTime = event.endDate 
      ? new Date(event.endDate).getTime() 
      : new Date(event.startDate).getTime() + (60 * 60 * 1000);
    const endDate = new Date(endDateTime).toISOString().replace(/-|:|\.\d+/g, '');
    
    const googleUrl = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${startDate}/${endDate}`;
    window.open(googleUrl, '_blank');
  };

  const handleDeleteEvent = async () => {
    if (!isHost || !eventId) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'events', eventId));
      toast.success('Event deleted successfully');
      navigate('/events');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
      toast.error('Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto px-2 pb-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row gap-8">
          {/* Left Content - Main Info */}
          <div className="flex-1 flex flex-col">
            <div className="max-w-4xl w-full mx-auto space-y-8">
              <Link to="/events" className="inline-flex items-center gap-2 text-foreground/50 hover:text-foreground transition-colors group text-sm pt-4">
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Events
              </Link>

              {/* Hero Section - More Compact */}
              <div 
                className="relative aspect-[21/7] rounded-[24px] overflow-hidden shadow-2xl border border-foreground/10 group cursor-pointer"
                onClick={() => setPreviewImage((event.banner && event.banner.trim() !== '') ? event.banner : `https://picsum.photos/seed/${event.id}/1200/600`)}
              >
                <img 
                  src={(event.banner && event.banner.trim() !== '') ? event.banner : `https://picsum.photos/seed/${event.id}/1200/600`} 
                  alt={event.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-background/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-foreground/10 flex items-center gap-2 text-[10px] font-bold text-foreground">
                    <MapIcon size={12} /> Click to Preview
                  </div>
                </div>

                <div className="absolute bottom-4 left-6 right-6 md:bottom-6 md:left-8 md:right-8">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                      event.eventType === 'community' ? 'bg-primary text-primary-foreground' : 'bg-blue-500 text-white'
                    }`}>
                      {event.eventType} Event
                    </span>
                    {event.isPaid && (
                      <span className="px-2 py-0.5 bg-yellow-500 text-black text-[9px] font-bold rounded-full uppercase tracking-widest">
                        Paid
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                      event.status === 'live' ? 'bg-red-500 text-white animate-pulse' : 
                      event.status === 'ended' ? 'bg-zinc-500 text-white' : 'bg-foreground/10 text-foreground/80 backdrop-blur-md'
                    }`}>
                      {event.status === 'ended' ? 'Event Ended' : event.status}
                    </span>
                  </div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight leading-tight">
                    {event.title}
                  </h1>
                </div>
              </div>

              {/* Content Grid - Compact & No Borders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <section className="p-2 space-y-4">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/40 flex items-center gap-2">
                    <Info size={14} className="text-primary" /> About Event
                  </h2>
                  <p className="text-foreground/70 leading-relaxed whitespace-pre-wrap text-sm">
                    {event.description || "No description provided."}
                  </p>
                </section>

                <div className="space-y-4">
                  <section className="p-2">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/40 mb-4 flex items-center gap-2">
                      <Calendar size={14} className="text-primary" /> Schedule
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-primary shrink-0">
                          <Calendar size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">Date</p>
                          <p className="text-xs font-bold text-foreground">
                            {formatDate(event.startDate, 'MMM do, yyyy')}
                            {event.endDate && formatDate(event.startDate, 'yyyyMMdd') !== formatDate(event.endDate, 'yyyyMMdd') && (
                              <span className="text-foreground/40 ml-1"> - {formatDate(event.endDate, 'MMM do')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-primary shrink-0">
                          <Clock size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">Time ({event.timezone || 'UTC'})</p>
                          <p className="text-xs font-bold text-foreground">
                            {formatDate(event.startDate, 'h:mm a')}
                            {event.endDate && (
                              <span className="text-foreground/40 ml-1"> - {formatDate(event.endDate, 'h:mm a')}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {event.isOffline && (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-primary shrink-0">
                              <MapPin size={16} />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest">Location</p>
                              <p className="text-xs font-bold text-foreground">{event.locationName || 'TBD'}</p>
                              {event.locationAddress && <p className="text-[10px] text-foreground/40 line-clamp-1">{event.locationAddress}</p>}
                            </div>
                          </div>

                          {isLoaded && event.locationCoords && (
                            <div className="w-full h-48 rounded-2xl overflow-hidden border border-foreground/10 relative group shadow-2xl">
                              <div 
                                className="w-full h-full"
                                ref={(el) => {
                                  if (el && isLoaded && event.locationCoords) {
                                    const map = new google.maps.Map(el, {
                                      center: event.locationCoords,
                                      zoom: 15,
                                      disableDefaultUI: true,
                                      styles: [
                                        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
                                        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
                                        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
                                        { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
                                        { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
                                        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
                                        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
                                        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
                                      ]
                                    });
                                    new google.maps.Marker({
                                      position: event.locationCoords,
                                      map
                                    });
                                  }
                                }}
                              />
                              <div className="absolute top-4 right-4">
                                <a 
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationAddress || event.locationName)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 bg-background/60 backdrop-blur-md rounded-lg border border-foreground/10 text-[10px] font-bold text-foreground hover:bg-background/80 transition-all"
                                >
                                  <ExternalLink size={12} /> Open in Maps
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Sticky on Desktop */}
            <div className="w-full lg:w-[340px] lg:sticky lg:top-4 lg:h-fit pt-4">
            <div className="bg-background rounded-[32px] border border-foreground/10 shadow-2xl overflow-hidden">
              {/* Action Section */}
              <div className="p-6 space-y-6 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-50" />
                
                {isRegistered && !event.isOffline && (
                  <div className="relative space-y-3">
                    <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest px-1">Access Link</p>
                    {event.onlineType === 'external' ? (
                      <a 
                        href={event.externalUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-primary/10 rounded-2xl border border-primary/20 hover:bg-primary/20 transition-all group/link"
                      >
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-primary uppercase tracking-widest">{event.externalPlatform || 'External'}</span>
                          <span className="text-[10px] text-foreground/50 truncate max-w-[180px]">{event.externalUrl}</span>
                        </div>
                        <ExternalLink size={16} className="text-primary group-hover/link:scale-110 transition-transform" />
                      </a>
                    ) : (
                      <div className="p-4 bg-foreground/5 rounded-2xl border border-foreground/10">
                        <p className="text-[11px] font-bold text-primary">Internal Session</p>
                        <p className="text-[10px] text-foreground/40 leading-relaxed">This session will be hosted directly on our platform.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="relative flex items-center justify-between px-1">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">Registration</p>
                    <p className="text-2xl font-bold text-foreground">
                      {event.isPaid ? `$${event.price}` : 'Free'}
                    </p>
                  </div>
                </div>

                <div className="relative space-y-3">
                  {/* Host Start/Manage Session Button */}
                  {canManage && !event.isOffline && (() => {
                    const isExpired = event.type === 'instant' && event.expiresAt && new Date() > new Date(event.expiresAt);
                    
                    if (isExpired && event.status !== 'live') {
                      return (
                        <div className="w-full py-4 rounded-2xl font-bold bg-neutral-800 text-neutral-500 border border-neutral-700 flex items-center justify-center gap-2 text-sm cursor-not-allowed">
                          <X size={18} /> Session Expired
                        </div>
                      );
                    }

                    return (
                      <button 
                        onClick={() => handleStartSession(true)}
                        className="w-full py-4 rounded-2xl font-bold bg-primary text-primary-foreground shadow-[0_0_20px_rgba(0,242,255,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Globe size={18} /> {event.status === 'live' ? 'Enter Session' : event.status === 'ended' ? 'Restart Session' : 'Start Session'}
                      </button>
                    );
                  })()}

                  {/* Participant Join Session Button */}
                  {!canManage && isRegistered && event.status !== 'ended' && !event.isOffline && (() => {
                    const now = new Date();
                    const startDate = new Date(event.startDate);
                    const fiveMinsBefore = new Date(startDate.getTime() - 5 * 60 * 1000);
                    const isTimeAccessible = now >= fiveMinsBefore;
                    const canJoinEarly = event.status === 'live' && event.allowEarlyAccess;
                    return isTimeAccessible || canJoinEarly;
                  })() && (
                    <button 
                      onClick={() => navigate(`/events/${eventId}/live`)}
                      className="w-full py-4 rounded-2xl font-bold bg-primary text-primary-foreground shadow-[0_0_20px_rgba(0,242,255,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <Globe size={18} /> Join Session
                    </button>
                  )}

                  {isHost && (
                    <div className="grid grid-cols-1 gap-2">
                      <button 
                        onClick={() => setIsEditModalOpen(true)}
                        className="w-full py-4 rounded-2xl font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Info size={18} /> Edit Event
                      </button>
                      {event.visibility === 'public' && event.status !== 'ended' && (
                        <button
                          onClick={() => setIsBoostOpen(true)}
                          className="w-full py-4 rounded-2xl font-bold bg-amber-400 text-black hover:bg-amber-300 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                        >
                          <Rocket size={18} /> {isPromoted(event) ? 'Extend boost' : 'Boost Event'}
                        </button>
                      )}
                      <button 
                        onClick={() => setIsCoHostModalOpen(true)}
                        className="w-full py-4 rounded-2xl font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <ShieldCheck size={18} /> Manage Co-hosts
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full py-4 rounded-2xl font-bold bg-red-500/5 border border-red-500/10 text-red-500 hover:bg-red-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Trash2 size={18} /> Delete Event
                      </button>
                    </div>
                  )}

                  {!canManage && (
                    <button 
                      onClick={handleRegister}
                      disabled={registering || event.status === 'ended'}
                      className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm active:scale-[0.98] ${
                        isRegistered 
                          ? 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10' 
                          : event.status === 'ended'
                          ? 'bg-foreground/5 text-foreground/20 cursor-not-allowed'
                          : 'bg-foreground text-background hover:scale-[1.02] shadow-lg shadow-foreground/5'
                      }`}
                    >
                      {registering ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : isRegistered ? (
                        <><Check size={18} /> Registered</>
                      ) : event.status === 'ended' ? (
                        'Registration Closed'
                      ) : (
                        <>{event.isPaid ? 'Pay & Register' : 'Register for Free'}</>
                      )}
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={handleAddToCalendar}
                      className="py-3 rounded-xl font-bold bg-foreground/5 text-foreground/60 hover:bg-foreground/10 transition-all flex items-center justify-center gap-2 text-xs border border-foreground/5"
                    >
                      <CalendarPlus size={16} /> Calendar
                    </button>
                    <button className="py-3 rounded-xl font-bold bg-foreground/5 text-foreground/60 hover:bg-foreground/10 transition-all flex items-center justify-center gap-2 text-xs border border-foreground/5">
                      <Share2 size={16} /> Share
                    </button>
                  </div>
                </div>

                <div className="relative pt-4 border-t border-foreground/5 flex items-center justify-between text-[11px]">
                  <span className="text-foreground/30 font-medium">Capacity</span>
                  <span className="font-bold text-foreground/70 bg-foreground/5 px-2 py-0.5 rounded-md">
                    {event.maxAttendees ? `${event.maxAttendees} max` : 'Unlimited'}
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-foreground/5 w-full" />

              {/* Host Section */}
              <div className="p-6 space-y-4">
                <h3 className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest">Event Host</h3>
                {event.eventType === 'community' && community ? (
                  <Link to={`/feed?community=${community.id}`} className="flex items-center gap-3 p-2 rounded-2xl bg-foreground/5 border border-foreground/5 hover:bg-foreground/10 transition-all group">
                    {(community.image && community.image.trim() !== '') ? (
                      <img src={community.image} className="w-10 h-10 rounded-xl object-cover border border-foreground/10" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-foreground/10">
                        <Users size={20} />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold group-hover:text-primary transition-colors text-foreground">{community.name}</p>
                      <p className="text-[10px] text-foreground/40">Community Host</p>
                    </div>
                  </Link>
                ) : host ? (
                  <div className="flex items-center gap-3 p-2 rounded-2xl bg-foreground/5 border border-foreground/5">
                    <UserHoverCard userId={host.id}>
                      {(host.profileImage && host.profileImage.trim() !== '') ? (
                        <img src={host.profileImage} className="w-10 h-10 rounded-xl object-cover border border-foreground/10" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-foreground/10">
                          <Users size={20} />
                        </div>
                      )}
                    </UserHoverCard>
                    <div>
                      <p className="text-sm font-bold text-foreground">{host.username}</p>
                      <p className="text-[10px] text-foreground/40">Creator Host</p>
                    </div>
                  </div>
                ) : null}

                {/* Co-hosts Section */}
                {coHosts.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-[9px] font-bold text-foreground/20 uppercase tracking-[0.2em] px-1">Co-hosts</h4>
                    <div className="space-y-2">
                      {coHosts.map(ch => (
                        <div key={ch.id} className="flex items-center gap-3 p-2 rounded-2xl bg-foreground/5 border border-foreground/5">
                          <UserHoverCard userId={ch.id}>
                            {(ch.profileImage && ch.profileImage.trim() !== '') ? (
                              <img src={ch.profileImage} className="w-8 h-8 rounded-lg object-cover border border-foreground/10" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-foreground/10">
                                <Users size={14} />
                              </div>
                            )}
                          </UserHoverCard>
                          <div>
                            <p className="text-xs font-bold text-foreground">{ch.username}</p>
                            <p className="text-[9px] text-foreground/40">Co-host</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              {participants.length > 0 && <div className="h-px bg-foreground/5 w-full" />}

              {/* Participants Section */}
              {participants.length > 0 && (
                <div className="p-6 space-y-4">
                  <h3 className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest flex items-center justify-between">
                    Participants
                    <span className="text-primary font-mono">{event.attendeeCount || 0}</span>
                  </h3>
                  <div className="flex flex-wrap items-center -space-x-3">
                    {participants.map((p, i) => (
                      <UserHoverCard key={p.id} userId={p.id}>
                        {(p.profileImage && p.profileImage.trim() !== '') ? (
                        <img 
                          src={p.profileImage} 
                          className="w-10 h-10 rounded-full border-2 border-background object-cover hover:translate-y-[-4px] transition-all cursor-pointer shadow-xl" 
                          title={p.username}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full border-2 border-background bg-primary/10 flex items-center justify-center text-primary hover:translate-y-[-4px] transition-all cursor-pointer shadow-xl font-bold text-xs">
                          {p.username?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      </UserHoverCard>
                    ))}
                    {event.attendeeCount > participants.length && (
                      <div className="w-10 h-10 rounded-full border-2 border-background bg-foreground/5 flex items-center justify-center text-[11px] font-bold text-foreground/40 backdrop-blur-md">
                        +{event.attendeeCount - participants.length}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <BoostEventModal event={{ ...event, id: eventId }} isOpen={isBoostOpen} onClose={() => setIsBoostOpen(false)} />
        <CreateEventModal 
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          eventId={eventId}
        />
        
        <ConfirmModal 
          isOpen={showEarlyAccessConfirm}
          onClose={() => setShowEarlyAccessConfirm(false)}
          onConfirm={() => handleStartSession(true)}
          onCancel={() => handleStartSession(false)}
          title="Early Session Access"
          message="You are starting the session more than 5 minutes before the scheduled time. Should registered participants be allowed to join immediately?"
          confirmText="Yes, Allow All"
          cancelText="No, Host Only"
          loading={startingSession}
        />
        <CoHostManagementModal 
          isOpen={isCoHostModalOpen}
          onClose={() => setIsCoHostModalOpen(false)}
          eventId={eventId!}
          hostId={event.hostId}
        />

        <ConfirmModal 
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteEvent}
          title="Delete Event"
          message="Are you sure you want to delete this event? This action cannot be undone and all registrations will be lost."
          confirmText="Delete Event"
          cancelText="Cancel"
          loading={deleting}
          variant="danger"
        />

        {/* Image Preview Modal */}
        <AnimatePresence>
          {previewImage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 md:p-8"
              onClick={() => setPreviewImage(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-7xl max-h-full w-full h-full flex items-center justify-center px-4"
                onClick={e => e.stopPropagation()}
              >
                <img 
                  src={(previewImage && previewImage.trim() !== '') ? previewImage : `https://picsum.photos/seed/fallback/1200/800`} 
                  className="w-full h-full object-contain rounded-2xl shadow-2xl" 
                  alt="Preview"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={() => setPreviewImage(null)}
                  className="absolute top-4 right-4 md:top-8 md:right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all border border-white/10"
                >
                  <X size={24} />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
