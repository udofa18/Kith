import { useEffect, useState, type ReactNode } from 'react';
import { useParams, Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, increment, updateDoc, limit } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Lock,
  MapPin,
  Maximize2,
  Radio,
  Rocket,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { toast } from 'react-hot-toast';

import { formatDate } from '../lib/utils';
import { isEnded, isLive, isPromoted, isSessionEnded } from '../lib/eventRanking';
import UserHoverCard from '../components/UserHoverCard';
import CreateEventModal from '../components/CreateEventModal';
import { updateEventStatus } from '../lib/eventUtils';
import ConfirmModal from '../components/ConfirmModal';
import CoHostManagementModal from '../components/CoHostManagementModal';
import BoostEventModal from '../components/events/BoostEventModal';
import EventCover, { hasEventBanner } from '../components/events/EventCover';
import Avatar from '../components/ui/Avatar';
import CheckoutButtons from '../components/marketplace/CheckoutButtons';
import { getOrderStatus, formatEventPrice, isOrderId } from '../lib/payments';
import { eventHref, isInstantLiveSession, liveRoomPath } from '../lib/eventLinks';

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
  const [showHostTools, setShowHostTools] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const initMaps = async () => {
      const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) return;

      try {
        setOptions({ key: apiKey });
        await importLibrary('maps');
        await importLibrary('marker');
        setIsLoaded(true);
      } catch (err) {
        console.error('Maps load error in details:', err);
      }
    };

    initMaps();
  }, []);

  useEffect(() => {
    if (!eventId) return;

    const unsubscribe = onSnapshot(doc(db, 'events', eventId), async docSnap => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as any;

        await updateEventStatus(data);
        setEvent(data);

        if (data.hostId) {
          const hostDoc = await getDoc(doc(db, 'users', data.hostId));
          if (hostDoc.exists()) setHost({ id: hostDoc.id, ...hostDoc.data() });
        }

        if (data.coHostIds && data.coHostIds.length > 0) {
          const coHostProfiles = await Promise.all(
            data.coHostIds.map(async (id: string) => {
              const userDoc = await getDoc(doc(db, 'users', id));
              return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
            }),
          );
          setCoHosts(coHostProfiles.filter(Boolean));
        } else {
          setCoHosts([]);
        }

        if (data.communityId) {
          const commDoc = await getDoc(doc(db, 'communities', data.communityId));
          if (commDoc.exists()) {
            setCommunity({ id: commDoc.id, ...commDoc.data() });

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

    if (auth.currentUser) {
      const regUnsubscribe = onSnapshot(doc(db, 'events', eventId, 'registrations', auth.currentUser.uid), snap => {
        setIsRegisteredState(snap.exists());
      });

      const participantsQuery = query(collection(db, 'events', eventId, 'registrations'), limit(15));
      const participantsUnsubscribe = onSnapshot(participantsQuery, async snap => {
        const participantData = await Promise.all(
          snap.docs.map(async d => {
            const userDoc = await getDoc(doc(db, 'users', d.id));
            return { id: userDoc.id, ...userDoc.data() };
          }),
        );
        setParticipants(participantData.filter((p: any) => p.username || p.profileImage));
      });

      return () => {
        unsubscribe();
        regUnsubscribe();
        participantsUnsubscribe();
      };
    }

    return () => unsubscribe();
  }, [eventId]);

  // Returning from checkout (tickets or boosts): the server fulfils the order, so wait for it.
  // Paystack redirects with `reference` (our order id) and Stripe with `order`.
  const orderParamValue = searchParams.get('order') ?? searchParams.get('reference');
  const orderParam = isOrderId(orderParamValue) ? orderParamValue : null;
  const checkoutCancelled = searchParams.get('cancelled');
  useEffect(() => {
    if (!checkoutCancelled) return;
    toast('Checkout cancelled. No charge was made.');
    setSearchParams({}, { replace: true });
  }, [checkoutCancelled, setSearchParams]);

  useEffect(() => {
    if (!orderParam || !auth.currentUser) return;
    let cancelled = false;
    let attempts = 0;
    const finish = () => setSearchParams({}, { replace: true });
    const poll = async () => {
      try {
        const status = await getOrderStatus(orderParam);
        if (cancelled) return;
        if (status.status === 'paid') {
          toast.success(status.kind === 'event_boost' ? 'Your event is boosted! 🚀' : "You're registered! 🎟️");
          return finish();
        }
        if (status.status === 'failed') {
          toast.error("That payment didn't go through.");
          return finish();
        }
      } catch {
        // Transient error: keep polling until the limit.
      }
      attempts += 1;
      if (cancelled) return;
      if (attempts < 15) setTimeout(poll, 2000);
      else finish();
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [orderParam, auth.currentUser?.uid]);

  const handleRegister = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to register for events');
      return;
    }
    if (!eventId || !event) return;

    if (event.isPaid) {
      // Paid tickets are bought through CheckoutButtons, which uses server-priced options.
      toast.error("Paid tickets can't be cancelled here. Contact the host.");
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
          paid: false,
          amount: 0,
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
      <div className="flex h-full items-center justify-center bg-background">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle size={40} className="mb-4 text-destructive" />
        <h1 className="font-serif text-3xl">This room has closed</h1>
        <p className="mb-8 mt-2 max-w-md text-sm text-muted-foreground">
          The event you’re looking for doesn’t exist or has been removed.
        </p>
        <Link to="/events" className="rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background">
          Back to Events
        </Link>
      </div>
    );
  }

  const isAccessRestricted = event.visibility === 'community' && !isMember;
  const isRegistered = isRegisteredState || auth.currentUser?.uid === event.hostId;
  const isHost = auth.currentUser?.uid === event.hostId;
  const isCoHost = event.coHostIds?.includes(auth.currentUser?.uid);
  const canManage = isHost || isCoHost;
  const canSeeDetails = !isAccessRestricted || isRegistered || canManage;
  const live = isLive(event, now);
  const ended = isEnded(event, now);
  // The room can close before the event's scheduled date; that is not the end
  // of the event, so the banner says the session ended and the date remains.
  const sessionEnded = !live && !ended && isSessionEnded(event);
  const promo = isPromoted(event, now);

  const startDate = new Date(event.startDate);
  const fiveMinsBefore = new Date(startDate.getTime() - 5 * 60 * 1000);
  const canJoinNow = live || now >= fiveMinsBefore.getTime();
  const isInstantExpired = event.type === 'instant' && event.expiresAt && new Date(event.expiresAt).getTime() < now;

  // Instant sessions are room-first. Their details page is the host/co-host
  // console, so everyone else belongs in the room (or back in the feed once it
  // has ended), never on this page.
  if (isInstantLiveSession(event) && !canManage) {
    return <Navigate to={ended || isInstantExpired ? '/feed' : liveRoomPath(event)} replace />;
  }

  const handleStartSession = async (allowEarly = true) => {
    if (!canManage || !eventId) return;

    if (now < fiveMinsBefore.getTime() && !showEarlyAccessConfirm && event.status !== 'live') {
      setShowEarlyAccessConfirm(true);
      return;
    }

    setStartingSession(true);
    try {
      await updateDoc(doc(db, 'events', eventId), {
        status: 'live',
        allowEarlyAccess: allowEarly,
        lastStartedAt: new Date().toISOString(),
      });

      await setDoc(doc(db, 'eventSessions', eventId), {
        status: 'live',
        restartedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      setShowEarlyAccessConfirm(false);
      navigate(`${liveRoomPath(event)}?join=1`);
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error('Failed to start session');
    } finally {
      setStartingSession(false);
    }
  };

  const handleAddToCalendar = () => {
    if (!event?.startDate) return;
    const title = encodeURIComponent(event.title);
    const description = encodeURIComponent(event.description || '');
    const start = new Date(event.startDate).toISOString().replace(/-|:|\.\d+/g, '');
    const endMs = event.endDate ? new Date(event.endDate).getTime() : new Date(event.startDate).getTime() + 60 * 60 * 1000;
    const end = new Date(endMs).toISOString().replace(/-|:|\.\d+/g, '');
    window.open(`https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${start}/${end}`, '_blank');
  };

  const handleShare = async () => {
    const url = `${window.location.origin}${eventHref(event)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text: event.description || undefined, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      // Sharing was dismissed.
    }
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

  const where = event.isOffline ? event.locationName || 'Location TBD' : event.onlineType === 'external' ? event.externalPlatform || 'Online' : 'Live on Kith';
  const capacity = event.maxAttendees ? `${Math.max(0, event.maxAttendees - (event.attendeeCount || 0))} of ${event.maxAttendees} left` : 'Open capacity';

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-4 sm:px-8 sm:pt-6">
        {/* Top chrome */}
        <div className="mb-3 flex items-center justify-between">
          <Link to="/events" className="group inline-flex items-center gap-2 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-border transition-transform group-hover:-translate-x-0.5">
              <ArrowLeft size={15} />
            </span>
            <span className="hidden sm:inline">All events</span>
          </Link>
          <button
            onClick={handleShare}
            aria-label="Share event"
            className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            <Share2 size={15} />
          </button>
        </div>

        {/* Cinematic banner */}
        <div className="relative overflow-hidden rounded-[26px] sm:rounded-[34px]">
          <EventCover
            event={event}
            className="aspect-[4/3] w-full sm:aspect-[21/9]"
            imgClassName="transition-transform duration-[1200ms] hover:scale-[1.03]"
          />
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(14,11,19,0.28)_0%,rgba(14,11,19,0.05)_35%,rgba(14,11,19,0.86)_100%)]" />

          <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2 sm:left-6 sm:top-6">
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white shadow-lg">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live now
              </span>
            )}
            {!live && ended && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">Ended</span>
            )}
            {sessionEnded && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">Session ended</span>
            )}
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">
              {event.eventType === 'community' ? 'Community event' : 'Event'}
            </span>
            {event.isPaid && (
              <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#1a1210]">Paid</span>
            )}
            {promo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                <Sparkles size={10} /> Promoted
              </span>
            )}
          </div>

          {hasEventBanner(event) && (
            <button
              onClick={() => setPreviewImage(event.banner)}
              className="absolute bottom-4 right-4 hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/25 sm:inline-flex"
            >
              <Maximize2 size={12} /> View cover
            </button>
          )}

          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
              {event.category || 'Gathering'}
            </p>
            <h1 className="mt-2 max-w-3xl font-serif text-[34px] leading-[0.98] tracking-[-0.02em] text-white sm:text-[58px]">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-white/75 sm:text-[12px]">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} /> {formatDate(event.startDate, 'EEE, MMM d')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={13} /> {formatDate(event.startDate, 'h:mm a')}
                {event.endDate ? ` – ${formatDate(event.endDate, 'h:mm a')}` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                {event.isOffline ? <MapPin size={13} /> : <Video size={13} />} {where}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users size={13} /> {event.attendeeCount || 0} going
              </span>
            </div>
          </div>
        </div>

        {/* Host line */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            {community ? (
              <Link to={`/feed?community=${community.id}`} className="group flex items-center gap-3">
                <Avatar src={community.image} seed={community.id} size={40} square />
                <span>
                  <span className="block text-[13px] font-semibold transition-colors group-hover:text-primary">{community.name}</span>
                  <span className="block text-[11px] text-faint">Community host</span>
                </span>
              </Link>
            ) : host ? (
              <UserHoverCard userId={host.id}>
                <span className="flex items-center gap-3">
                  <Avatar src={host.profileImage} seed={host.id} size={40} />
                  <span>
                    <span className="block text-[13px] font-semibold">{host.displayName || host.username || 'Host'}</span>
                    <span className="block text-[11px] text-faint">Hosted by {host.username ? `@${host.username}` : 'the creator'}</span>
                  </span>
                </span>
              </UserHoverCard>
            ) : (
              <span className="flex items-center gap-3">
                <Avatar seed={event.hostId || event.id} size={40} />
                <span>
                  <span className="block text-[13px] font-semibold">{event.hostName || 'Your host'}</span>
                  <span className="block text-[11px] text-faint">Host</span>
                </span>
              </span>
            )}
            {canManage && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                <ShieldCheck size={10} /> {isHost ? 'Host' : 'Co-host'}
              </span>
            )}
          </div>
          {coHosts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">With</span>
              <div className="flex -space-x-2">
                {coHosts.slice(0, 5).map(ch => (
                  <UserHoverCard key={ch.id} userId={ch.id}>
                    <Avatar src={ch.profileImage} seed={ch.id} size={28} className="ring-2 ring-background" />
                  </UserHoverCard>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_336px]">
          {/* Main editorial column */}
          <main className="min-w-0 space-y-10">
            <section>
              <h2 className="font-serif text-[26px] leading-none tracking-[-0.01em] sm:text-[30px]">The idea</h2>
              <p className="mt-4 max-w-[68ch] whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
                {event.description || 'The host hasn’t written the details yet — but the door is open.'}
              </p>
              {isAccessRestricted && !canSeeDetails && (
                <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-1.5 text-[11px] font-medium text-warning">
                  <Lock size={12} /> Community members only — join the community to unlock the room.
                </p>
              )}
            </section>

            {/* Schedule / place / capacity */}
            <section className="grid gap-6 border-t border-border pt-7 sm:grid-cols-3">
              <Detail icon={<Calendar size={15} />} label="When">
                <span className="block text-[14px] font-semibold">{formatDate(event.startDate, 'EEEE, MMMM d')}</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {formatDate(event.startDate, 'h:mm a')}
                  {event.endDate && ` – ${formatDate(event.endDate, 'h:mm a')}`}
                  {event.timezone ? ` · ${event.timezone}` : ''}
                </span>
              </Detail>
              <Detail icon={event.isOffline ? <MapPin size={15} /> : <Globe size={15} />} label="Where">
                <span className="block text-[14px] font-semibold">{where}</span>
                {event.isOffline && event.locationAddress && event.locationAddress !== event.locationName && (
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">{event.locationAddress}</span>
                )}
                {!event.isOffline && (
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {event.onlineType === 'external' ? 'Hosted on an external platform' : 'Hosted inside a Kith live room'}
                  </span>
                )}
              </Detail>
              <Detail icon={<Users size={15} />} label="Room">
                <span className="block text-[14px] font-semibold">{capacity}</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">{event.attendeeCount || 0} people going</span>
              </Detail>
            </section>

            {/* Map */}
            {event.isOffline && isLoaded && event.locationCoords && (
              <section className="overflow-hidden rounded-[26px] border border-border">
                <div className="relative h-64">
                  <div
                    className="h-full w-full"
                    ref={el => {
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
                          ],
                        });
                        new google.maps.Marker({ position: event.locationCoords, map });
                      }
                    }}
                  />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationAddress || event.locationName || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-[10px] font-bold text-foreground backdrop-blur-md transition-colors hover:bg-background/90"
                  >
                    <ExternalLink size={12} /> Open in Maps
                  </a>
                </div>
              </section>
            )}

            {/* Co-hosts */}
            {coHosts.length > 0 && (
              <section className="border-t border-border pt-7">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-faint">Co-hosting</h2>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-4">
                  {coHosts.map(ch => (
                    <UserHoverCard key={ch.id} userId={ch.id}>
                      <span className="flex items-center gap-2.5">
                        <Avatar src={ch.profileImage} seed={ch.id} size={34} />
                        <span>
                          <span className="block text-[12px] font-semibold">{ch.displayName || ch.username}</span>
                          <span className="block text-[10px] text-faint">@{ch.username}</span>
                        </span>
                      </span>
                    </UserHoverCard>
                  ))}
                </div>
              </section>
            )}

            {/* Participants */}
            {participants.length > 0 && (
              <section className="border-t border-border pt-7">
                <div className="flex items-end justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-faint">In the room</h2>
                  <span className="text-[11px] font-medium text-muted-foreground">{event.attendeeCount || participants.length} going</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-3">
                  {participants.map(p => (
                    <UserHoverCard key={p.id} userId={p.id}>
                      <span title={p.username || p.displayName}>
                        <Avatar src={p.profileImage} seed={p.id} size={36} className="ring-2 ring-background transition-transform hover:-translate-y-0.5" />
                      </span>
                    </UserHoverCard>
                  ))}
                  {(event.attendeeCount || 0) > participants.length && (
                    <span className="ml-2 grid h-9 w-9 place-items-center rounded-full border border-border text-[10px] font-bold text-muted-foreground">
                      +{(event.attendeeCount || 0) - participants.length}
                    </span>
                  )}
                </div>
              </section>
            )}
          </main>

          {/* Sticky action rail */}
          <aside className="self-start lg:sticky lg:top-6">
            <div className="rounded-[28px] border border-border bg-surface/60 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">
                    {canManage ? 'You’re hosting' : isRegistered ? 'You’re in' : 'Reserve a seat'}
                  </p>
                  <p className="mt-1 font-serif text-[38px] leading-none tracking-[-0.02em]">{formatEventPrice(event)}</p>
                </div>
                {live && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-red-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {event.isPaid ? 'Secure checkout · instant confirmation' : 'Free registration · cancel anytime'}
              </p>

              {/* Primary action */}
              <div className="mt-5 space-y-2.5">
                {canManage && !event.isOffline && (
                  isInstantExpired && !live ? (
                    <div className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-3.5 text-[13px] font-bold text-faint">
                      <X size={16} /> Session expired
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartSession(true)}
                      className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[13px] font-bold text-primary-foreground shadow-glow-primary transition-all hover:brightness-105 active:scale-[0.99]"
                    >
                      <Radio size={16} />
                      {live ? 'Enter your live room' : ended || sessionEnded ? 'Restart the room' : 'Start the room'}
                      <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </button>
                  )
                )}

                {canManage && eventId && (
                  <Link
                    to={`/live/${eventId}/console`}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-transparent py-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                  >
                    <Settings2 size={15} /> Host console
                  </Link>
                )}

                {!canManage && isRegistered && !event.isOffline && canJoinNow && !ended && (
                  <button
                    onClick={() => navigate(`${liveRoomPath(event)}?join=1`)}
                    className="group flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[13px] font-bold text-primary-foreground shadow-glow-primary transition-all hover:brightness-105 active:scale-[0.99]"
                  >
                    <Radio size={16} /> Join the live room
                    <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </button>
                )}

                {!canManage && event.isPaid && !isRegistered && !ended ? (
                  <CheckoutButtons
                    kind="event_ticket"
                    targetId={eventId!}
                    label="Pay & register"
                    buttonClassName="py-3.5"
                  />
                ) : !canManage ? (
                  <button
                    onClick={handleRegister}
                    disabled={registering || ended}
                    className={`flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[13px] font-bold transition-all active:scale-[0.99] ${
                      isRegistered
                        ? 'border border-border bg-transparent text-muted-foreground hover:bg-foreground/5'
                        : ended
                          ? 'cursor-not-allowed bg-foreground/5 text-faint'
                          : 'bg-foreground text-background hover:opacity-90'
                    }`}
                  >
                    {registering ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : isRegistered ? (
                      <><Check size={16} /> Registered</>
                    ) : ended ? (
                      'Registration closed'
                    ) : (
                      <>Register free <ArrowUpRight size={14} /></>
                    )}
                  </button>
                ) : null}

                {isRegistered && !event.isOffline && !canJoinNow && !ended && (
                  <p className="rounded-2xl bg-foreground/[0.03] px-4 py-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                    The room opens 5 minutes before start. We’ll keep your spot.
                  </p>
                )}
              </div>

              {/* Access link / online details */}
              {isRegistered && !event.isOffline && (
                <div className="mt-4 border-t border-border pt-4">
                  {event.onlineType === 'external' ? (
                    <a
                      href={event.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-2xl bg-foreground/[0.035] px-4 py-3 transition-colors hover:bg-foreground/[0.06]"
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{event.externalPlatform || 'External link'}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{event.externalUrl}</span>
                      </span>
                      <ExternalLink size={15} className="shrink-0 text-primary" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Video size={13} className="text-primary" /> This room is hosted on Kith.
                    </div>
                  )}
                </div>
              )}

              {/* Secondary actions */}
              <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                <button
                  onClick={handleAddToCalendar}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <CalendarPlus size={14} /> Calendar
                </button>
                <button
                  onClick={handleShare}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <Copy size={14} /> Share
                </button>
              </div>
            </div>

            {/* Host tools */}
            {isHost && (
              <div className="mt-3 rounded-[24px] border border-border bg-surface/40 p-2">
                <button
                  onClick={() => setShowHostTools(v => !v)}
                  aria-expanded={showHostTools}
                  className="flex w-full items-center justify-between gap-2 rounded-[18px] px-3 py-2.5 text-[12px] font-semibold transition-colors hover:bg-foreground/5"
                >
                  <span className="flex items-center gap-2"><Settings2 size={14} className="text-muted-foreground" /> Host tools</span>
                  <ChevronDown size={14} className={`text-faint transition-transform ${showHostTools ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {showHostTools && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5 px-1 pb-1 pt-1">
                        <HostAction icon={<Info size={14} />} onClick={() => { setShowHostTools(false); setIsEditModalOpen(true); }}>
                          Edit event details
                        </HostAction>
                        {event.visibility === 'public' && !ended && (
                          <HostAction icon={<Rocket size={14} className="text-amber-500" />} onClick={() => { setShowHostTools(false); setIsBoostOpen(true); }}>
                            {promo ? 'Extend the boost' : 'Boost this event'}
                          </HostAction>
                        )}
                        <HostAction icon={<ShieldCheck size={14} />} onClick={() => { setShowHostTools(false); setIsCoHostModalOpen(true); }}>
                          Manage co-hosts
                        </HostAction>
                        <HostAction icon={<Trash2 size={14} />} onClick={() => { setShowHostTools(false); setShowDeleteConfirm(true); }} danger>
                          Delete event
                        </HostAction>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <p className="mt-4 flex items-center justify-center gap-1.5 px-2 text-center text-[10px] leading-relaxed text-faint">
              <ShieldCheck size={11} /> Your spot is saved to your account.
            </p>
          </aside>
        </div>
      </div>

      <BoostEventModal event={{ ...event, id: eventId }} isOpen={isBoostOpen} onClose={() => setIsBoostOpen(false)} />
      <CreateEventModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} eventId={eventId} />

      <ConfirmModal
        isOpen={showEarlyAccessConfirm}
        onClose={() => setShowEarlyAccessConfirm(false)}
        onConfirm={() => handleStartSession(true)}
        onCancel={() => handleStartSession(false)}
        title="Early session access"
        message="You’re starting the room more than 5 minutes before the scheduled time. Should registered participants be allowed to join immediately?"
        confirmText="Yes, allow all"
        cancelText="No, host only"
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
        title="Delete event"
        message="Are you sure you want to delete this event? This action cannot be undone and all registrations will be lost."
        confirmText="Delete event"
        cancelText="Cancel"
        loading={deleting}
        variant="danger"
      />

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
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="relative flex h-full w-full max-w-7xl items-center justify-center px-4"
              onClick={e => e.stopPropagation()}
            >
              <img src={previewImage ?? undefined} className="h-full w-full rounded-2xl object-contain shadow-2xl" alt="Event cover" referrerPolicy="no-referrer" />
              <button
                onClick={() => setPreviewImage(null)}
                aria-label="Close preview"
                className="absolute right-4 top-4 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 md:right-8 md:top-8"
              >
                <X size={22} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Detail({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">
        <span className="text-primary">{icon}</span> {label}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function HostAction({ icon, onClick, danger = false, children }: { icon: ReactNode; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-medium transition-colors ${
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
      }`}
    >
      {icon} {children}
    </button>
  );
}
