import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  VideoConference, 
  ControlBar, 
  GridLayout,
  ParticipantTile,
  VideoTrack,
  useTracks,
  useTrackRefContext,
  useLocalParticipant,
  useTrackToggle,
  TrackRefContext,
  LayoutContextProvider,
  Chat,
  TrackToggle,
  ParticipantContext,
  ParticipantName,
  ParticipantPlaceholder,
  ConnectionQualityIndicator,
  useConnectionState,
  useRoomContext,
  useParticipants
} from '@livekit/components-react';
import { ConnectionState, Track, Participant } from 'livekit-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare as ChatIcon, 
  BarChart2, 
  HelpCircle, 
  Users, 
  Settings, 
  LogOut,
  Shield,
  Hand,
  Smile,
  X,
  ThumbsUp,
  Heart,
  Zap,
  PartyPopper,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  User,
  Pin,
  Clock,
  Share2,
  Copy,
  Check,
  Loader2,
  Search,
  MessageSquare,
  Globe,
  Minimize2,
  MonitorPlay,
  Settings2,
  Timer,
  UserX,
  VolumeX,
  Star,
  Lock,
  Unlock,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import LiveChat from '../components/live/LiveChat';
import LivePolls from '../components/live/LivePolls';
import LiveQA from '../components/live/LiveQA';
import LiveLobby from '../components/live/LiveLobby';
import Avatar from '../components/ui/Avatar';
import axios from 'axios';
import { createNotification } from '../lib/notifications';
import { gainXP } from '../lib/xp';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { useLiveSession } from '../contexts/LiveSessionContext';
import { sendDirectMessage } from '../features/messages/api';
import { DEFAULT_LIVE_SETTINGS, normalizeLiveSettings, type LiveSessionSettings } from '../lib/liveSessionSettings';
import { isInstantLiveSession, liveExitHref } from '../lib/eventLinks';
import { LIVE_HEARTBEAT_STALE_MS } from '../lib/livePresence';

export default function LiveSession() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    session,
    guestName,
    minimizeSession,
    expandSession,
    endSession,
    endSessionForEveryone,
    startSession,
    setGuestName: setGlobalGuestName,
  } = useLiveSession();
  const [loading, setLoading] = useState(!session.isActive);
  const [error, setError] = useState<string | null>(null);
  const [audioNeedsActivation, setAudioNeedsActivation] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'polls' | 'qa' | 'participants'>('chat');
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches,
  );
  const [isHost, setIsHost] = useState(false);
  const [isCoHost, setIsCoHost] = useState(false);
  const canManage = isHost || isCoHost;
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [manualPinnedTrack, setManualPinnedTrack] = useState<{ identity: string; source: Track.Source } | null>(null);
  const [notifications, setNotifications] = useState<{ id: number; message: string; type: 'info' | 'hand' }[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [liveEvent, setLiveEvent] = useState<any>(null);
  const [settings, setSettings] = useState<LiveSessionSettings>(DEFAULT_LIVE_SETTINGS);
  const [showStudio, setShowStudio] = useState(false);
  const [extending, setExtending] = useState(false);
  const [spotlightIdentity, setSpotlightIdentity] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 1024px)').matches,
  );
  // Direct links (`?join=1`) and the lobby's join button mount the room; plain
  // `/live/:id` links stay in the lobby until the viewer chooses to join.
  const [joinRequested, setJoinRequested] = useState(false);

  const event = liveEvent || session.eventData;
  const exitHref = liveExitHref(event || (eventId ? { id: eventId } : null));
  const storedSession = session.isActive && session.eventId === eventId && !!session.token;
  const explicitJoin = searchParams.get('join') === '1';
  const needsGuestName = !auth.currentUser && !guestName.trim() && !storedSession;
  const wantsRoom = joinRequested || explicitJoin || storedSession;
  const showLobby = !!eventId && (!wantsRoom || needsGuestName);
  const startedForRef = useRef<string | null>(null);
  // True once this page has actually been connected to its room. Clearing the
  // session afterwards (disconnect, host end) should navigate away; a failed
  // join should show the error instead.
  const joinedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  // Keep the room's event document live so extensions and host changes land instantly.
  useEffect(() => {
    if (!eventId) return;
    return onSnapshot(
      doc(db, 'events', eventId),
      snap => { if (snap.exists()) setLiveEvent({ id: snap.id, ...snap.data() }); },
      () => undefined,
    );
  }, [eventId]);

  // Host-controlled room settings are shared by every participant.
  useEffect(() => {
    if (!eventId) return;
    return onSnapshot(
      doc(db, 'eventSessions', eventId),
      snap => setSettings(normalizeLiveSettings(snap.exists() ? snap.data().settings : undefined)),
      () => undefined,
    );
  }, [eventId]);

  const updateSetting = async (key: keyof LiveSessionSettings, value: boolean) => {
    if (!eventId || !canManage) return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      await setDoc(
        doc(db, 'eventSessions', eventId),
        { settings: next, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      setSettings(previous);
      toast.error('Could not update the room setting');
    }
  };

  const extendSession = async (minutes = 15) => {
    if (!eventId || !canManage || !event?.expiresAt) return;
    setExtending(true);
    try {
      const base = Math.max(Date.now(), new Date(event.expiresAt).getTime());
      const next = new Date(base + minutes * 60_000);
      await updateDoc(doc(db, 'events', eventId), {
        expiresAt: next.toISOString(),
        endDate: next.toISOString(),
      });
      await setDoc(
        doc(db, 'eventSessions', eventId),
        { expiresAt: next.toISOString(), extendedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { merge: true },
      );
      toast.success(`Room extended by ${minutes} minutes`);
    } catch {
      toast.error('Could not extend this session');
    } finally {
      setExtending(false);
    }
  };

  const moderatorIds = useMemo(
    () => [event?.hostId, ...(event?.coHostIds || [])].filter(Boolean) as string[],
    [event?.hostId, event?.coHostIds],
  );

  useEffect(() => {
    if (!eventId) return;

    // The lobby (or the guest-name step) is still on screen; do not mint a
    // token until the viewer explicitly chooses to join.
    if (showLobby) {
      setLoading(false);
      return;
    }

    // Already connected to this room.
    if (session.isActive && session.eventId === eventId) {
      joinedRef.current = true;
      setLoading(false);
      return;
    }

    if (startedForRef.current === eventId) {
      // The room we joined is over (ended by the host, disconnected, or cleared
      // because another account signed in). Leave instead of reconnecting.
      if (joinedRef.current && !loading && !error) navigate(exitHref, { replace: true });
      return;
    }

    startedForRef.current = eventId;
    joinedRef.current = false;
    setLoading(true);
    startSession(eventId)
      .then(() => setError(null))
      .catch((err: any) => setError(err?.message || 'We could not open this room'))
      .finally(() => setLoading(false));
  }, [eventId, showLobby, session.isActive, session.eventId, guestName, loading, error, navigate, exitHref, startSession]);

  const handleLobbyJoin = (name?: string) => {
    if (!eventId) return;
    if (name) setGlobalGuestName(name);
    setJoinRequested(true);
    navigate(`/live/${eventId}?join=1`, { replace: true });
  };

  // Opening the room page brings a minimized call back into the tab, so the
  // full room and the floating mini-player never render at the same time.
  const expandedOnMountRef = useRef(false);
  useEffect(() => {
    if (expandedOnMountRef.current) return;
    expandedOnMountRef.current = true;
    if (session.isMinimized) expandSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (event) {
      const hostId = event.hostId;
      const currentIsHost = auth.currentUser ? hostId === auth.currentUser.uid : false;
      const currentIsCoHost = auth.currentUser ? event.coHostIds?.includes(auth.currentUser.uid) : false;
      setIsHost(currentIsHost);
      setIsCoHost(currentIsCoHost);
    }
  }, [event]);

  const addNotification = (message: string, type: 'info' | 'hand' = 'info', isLocal: boolean = false) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    if (type === 'hand' && !isLocal) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
      audio.volume = 0.4;
      audio.play().catch(e => console.warn('Audio play deferred until user interaction', e));
    }

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  useEffect(() => {
    if (!isInstantLiveSession(event) || !event?.expiresAt) return;

    const endSessionFunc = async () => {
      if (canManage && !ending) {
        setEnding(true);
        try {
          await endSessionForEveryone(eventId);
          toast('The room has wrapped up');
          navigate(exitHref, { replace: true });
        } catch (error) {
          console.error("Error auto-ending session:", error);
        }
      } else if (!canManage) {
        toast('The room has wrapped up');
        endSession();
        navigate(exitHref, { replace: true });
      }
    };

    const tick = () => {
      const expires = new Date(event.expiresAt).getTime();
      const diff = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setTimeRemaining(diff);
      if (diff <= 0) endSessionFunc();
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [event?.expiresAt, event?.isInstant, event?.type, eventId, canManage, ending, endSessionForEveryone, endSession, navigate, exitHref]);

  useEffect(() => {
    if (!eventId || canManage) return;

    const unsubscribe = onSnapshot(doc(db, 'eventSessions', eventId), (snap) => {
      if (snap.exists()) {
        const sessionData = snap.data();
        if (sessionData.status === 'ended') {
          toast.error('The host or co-host has ended this session');
          endSession();
          navigate(exitHref, { replace: true });
        }
      }
    });

    return () => unsubscribe();
  }, [eventId, canManage, endSession, navigate, exitHref]);

  // If the host disappears (closed tab, lost connection, crashed browser), the
  // heartbeat goes stale. Attendees should leave instead of waiting in a room
  // that can no longer be managed.
  useEffect(() => {
    if (!eventId || canManage || !event?.hostId) return;

    let left = false;
    let sawActive = false;
    const unsubscribe = onSnapshot(doc(db, 'liveStatus', event.hostId), (snap) => {
      if (left) return;
      const data = snap.data();
      const active = snap.exists() && data?.active === true;

      if (!active) {
        // The document is created when the host starts. If it disappears after
        // we've seen it, the host ended the room.
        if (!sawActive) return;
        left = true;
        toast.error('The host has ended this session');
        endSession();
        navigate(exitHref, { replace: true });
        return;
      }

      sawActive = true;
      const beat = typeof data.heartbeatAt === 'number' ? data.heartbeatAt : null;
      if (beat === null || Date.now() - beat <= LIVE_HEARTBEAT_STALE_MS) return;

      left = true;
      toast.error('The host lost connection, so this room has closed');
      endSession();
      navigate(exitHref, { replace: true });
    });

    return () => unsubscribe();
  }, [eventId, canManage, event?.hostId, endSession, navigate, exitHref]);

  const handleMinimize = async () => {
    await minimizeSession();
    // Leave the room page so the user can browse; the floating player keeps the call alive.
    navigate(exitHref, { replace: true });
  };

  const handleLeave = () => {
    // For a host/co-host, leaving without ending strands everyone in a room
    // that can no longer be managed. Make them choose to end it.
    if (canManage) {
      setShowEndSessionConfirm(true);
      return;
    }
    endSession();
    navigate(exitHref, { replace: true });
  };

  const handleEndForEveryone = async () => {
    setEnding(true);
    try {
      const ended = await endSessionForEveryone(eventId);
      if (!ended) {
        toast.error('Could not end the session. You are still live.');
        return;
      }
      navigate(exitHref, { replace: true });
    } finally {
      setEnding(false);
    }
  };

  // Document PiP can pop out automatically when the tab is hidden. Skip this
  // on browsers without it: the explicit minimize button uses the in-app
  // fallback instead.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'hidden' &&
        session.isActive &&
        !session.isMinimized &&
        'documentPictureInPicture' in window
      ) {
        // It may still fail without a user gesture; that is fine.
        minimizeSession().catch(() => undefined);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session.isActive, session.isMinimized, minimizeSession]);

  // Kept below every hook so joining the room never changes the hook order.
  if (showLobby && eventId) {
    return (
      <LiveLobby
        eventId={eventId}
        initialGuestName={guestName}
        onJoin={handleLobbyJoin}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="font-mono text-primary animate-pulse">ESTABLISHING_SECURE_CONNECTION...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
          <Shield size={40} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Can’t join this room</h1>
        <p className="text-white/40 mb-8 max-w-md">{error}</p>
        <button 
          onClick={() => navigate(exitHref, { replace: true })}
          className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:scale-105 transition-all"
        >
          Leave room
        </button>
      </div>
    );
  }

  // Room hooks below require a connected LiveKit room.
  if (!session.token) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Preparing the room</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden relative">
      {/* Placeholder screen when PiP is active */}
      <AnimatePresence>
        {session.isActive && session.isMinimized && session.pipWindow && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-[#0a0a0a] flex items-center justify-center p-6 overflow-hidden"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="w-full max-w-2xl flex flex-col items-center text-center space-y-8"
            >
              {/* Visual Illustration */}
              <div className="relative w-full aspect-video max-w-lg">
                 <div className="absolute inset-0 bg-primary/5 rounded-[3rem] border border-white/5 overflow-hidden">
                    {/* Abstract Shapes */}
                    <div className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-primary/20 rounded-xl rotate-12" />
                    <div className="absolute top-1/3 right-1/4 w-40 h-40 border-2 border-primary/20 rounded-full" />
                    <div className="absolute bottom-1/4 left-1/3 w-24 h-24 border-2 border-primary/20 rounded-lg -rotate-12" />
                    
                    {/* Icon Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                       <div className="relative">
                          <motion.div 
                            animate={{ 
                              scale: [1, 1.05, 1],
                              opacity: [0.5, 0.8, 0.5]
                            }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" 
                          />
                          <div className="relative bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl">
                             <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
                                <MonitorPlay size={32} />
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="space-y-4 max-w-md">
                <h1 className="text-3xl font-black tracking-tight text-white mb-2 italic">Meeting in progress in another window</h1>
                <p className="text-white/50 font-medium tracking-tight leading-relaxed">
                  You are currently using multi-window mode. This allows you to stay active in the session while multitasking across your workspace.
                </p>
              </div>

              <button 
                onClick={() => expandSession()}
                className="group flex items-center gap-4 px-10 py-5 bg-white text-black rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-primary hover:text-white transition-all shadow-2xl shadow-primary/20 active:scale-95"
              >
                Return call to this tab
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="z-10 flex min-h-16 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#08060b]/85 px-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">Live</span>
          </div>
          {timeRemaining !== null && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 py-1 pl-2.5 pr-1 text-amber-300">
              <Clock size={11} className="animate-pulse" />
              <span className="font-mono text-[10px] font-bold">
                {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
              </span>
              {canManage && (
                <button
                  onClick={() => extendSession(15)}
                  disabled={extending}
                  title="Extend the room by 15 minutes"
                  className="ml-0.5 flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200 transition-colors hover:bg-amber-400/30 disabled:opacity-50"
                >
                  {extending ? <Loader2 size={9} className="animate-spin" /> : <Timer size={9} />} +15m
                </button>
              )}
            </div>
          )}
          <span className="hidden h-4 w-px bg-white/10 sm:block" />
          <h1 className="truncate text-[13px] font-semibold text-white/90 sm:max-w-[38vw] sm:text-sm">{event?.title}</h1>
          <RoomPresence />
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            onClick={handleMinimize}
            className="rounded-xl p-2 text-white/45 transition-colors hover:bg-white/5 hover:text-white"
            title="Minimize and keep browsing"
          >
            <Minimize2 size={18} />
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            className="rounded-xl p-2 text-white/45 transition-colors hover:bg-white/5 hover:text-white"
            title="Share this room"
          >
            <Share2 size={18} />
          </button>
          {canManage && (
            <button
              onClick={() => setShowStudio(true)}
              className="flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-2.5 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
              title="Creator studio"
            >
              <Settings2 size={16} />
              <span className="hidden md:inline">Studio</span>
            </button>
          )}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`rounded-xl p-2 transition-colors ${showSidebar ? 'bg-primary text-white' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}
            title={showSidebar ? 'Hide the side panel' : 'Open the side panel'}
          >
            <ChatIcon size={18} />
          </button>
          {canManage && (
            <button
              onClick={() => setShowEndSessionConfirm(true)}
              className="hidden rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2 text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500 hover:text-white sm:block"
            >
              End room
            </button>
          )}
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-2.5 py-2 text-[11px] font-bold text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut size={16} /> <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex flex-1 flex-col bg-[#050409]">
          <LayoutContextProvider>
            <AutoPublish enabled={canManage} />
            <AudioActivationGate
              audioNeedsActivation={audioNeedsActivation}
              setAudioNeedsActivation={setAudioNeedsActivation}
            />
            <div className="relative flex-1 overflow-hidden">
              <SessionLayout
                hostId={event?.hostId}
                spotlightIdentity={spotlightIdentity}
                manualPinnedTrack={manualPinnedTrack}
                onPin={(identity, source) => setManualPinnedTrack({ identity, source })}
              />
            </div>

            {/* Notifications Overlay */}
            <div className="pointer-events-none absolute left-1/2 top-4 z-[60] flex -translate-x-1/2 flex-col gap-2">
              <AnimatePresence>
                {notifications.map(n => (
                  <motion.div
                    key={n.id}
                    initial={{ y: -20, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: -20, opacity: 0, scale: 0.9 }}
                    className={`flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl backdrop-blur-xl ${
                      n.type === 'hand'
                        ? 'border-amber-400/30 bg-amber-400/20 text-amber-300'
                        : 'border-white/10 bg-white/10 text-white'
                    }`}
                  >
                    {n.type === 'hand' ? <Hand size={18} fill="currentColor" /> : <Sparkles size={17} />}
                    <span className="text-sm font-bold">{n.message}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <ParticipantListener
              onHandRaise={(name, identity) => {
                const isLocal = identity === auth.currentUser?.uid;
                addNotification(`${isLocal ? 'You' : name} raised ${isLocal ? 'your' : 'their'} hand!`, 'hand', isLocal);
              }}
            />

            <ModerationBridge
              moderatorIds={moderatorIds}
              onSpotlight={setSpotlightIdentity}
              onLeave={handleLeave}
              onNotice={message => addNotification(message, 'info')}
            />

            {/* Custom Controls Overlay */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-50 flex justify-center p-3 sm:p-4">
              <div className="pointer-events-auto max-w-full">
                <CustomControlBar
                  allowReactions={settings.reactions}
                  allowHands={settings.handRaise}
                  onLeave={handleLeave}
                />
              </div>
            </div>
          </LayoutContextProvider>

          {/* Share Modal */}
          <AnimatePresence>
            {showShareModal && (
              <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                eventId={eventId!}
                eventTitle={event?.title}
              />
            )}
          </AnimatePresence>

          <HostStudio
            open={showStudio}
            onClose={() => setShowStudio(false)}
            settings={settings}
            onChange={updateSetting}
            hasTimer={!!event?.expiresAt}
            timeRemaining={timeRemaining}
            onExtend={() => extendSession(15)}
            extending={extending}
            onOpenPeople={() => { setShowStudio(false); setShowSidebar(true); setActiveTab('participants'); }}
            onOpenConsole={() => { setShowStudio(false); navigate(`/live/${eventId}/console`); }}
          />
        </div>

        {/* Side panel: docked on desktop, a drawer on mobile */}
        <AnimatePresence>
          {showSidebar && (isDesktop ? (
            <motion.aside
              key="sidebar-dock"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 392, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-[#09070c]"
            >
              <SidebarPanel
                eventId={eventId!}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                canManage={canManage}
                settings={settings}
                spotlightIdentity={spotlightIdentity}
                onSpotlight={setSpotlightIdentity}
                onClose={() => setShowSidebar(false)}
                isDesktop
              />
            </motion.aside>
          ) : (
            <motion.div key="sidebar-drawer" className="fixed inset-0 z-[90] flex justify-end">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSidebar(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                className="relative flex h-full w-[min(92vw,392px)] flex-col border-l border-white/[0.08] bg-[#09070c] shadow-2xl"
              >
                <SidebarPanel
                  eventId={eventId!}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  canManage={canManage}
                  settings={settings}
                  spotlightIdentity={spotlightIdentity}
                  onSpotlight={setSpotlightIdentity}
                  onClose={() => setShowSidebar(false)}
                  isDesktop={false}
                />
              </motion.aside>
            </motion.div>
          ))}
        </AnimatePresence>

        <ConfirmModal 
          isOpen={showEndSessionConfirm}
          onClose={() => setShowEndSessionConfirm(false)}
          onConfirm={handleEndForEveryone}
          title="End Session"
          message="Are you sure you want to end this session for everyone? This action cannot be undone."
          confirmText="End Session"
          loading={ending}
        />
      </div>
    </div>
  );
}

/**
 * Hosts and co-hosts are on stage: publish microphone and camera once the room
 * connects. Attendees stay muted with their camera off until they choose.
 */
function AutoPublish({ enabled }: { enabled: boolean }) {
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current || !localParticipant) return;
    if (connectionState !== ConnectionState.Connected) return;

    started.current = true;
    (async () => {
      try {
        await localParticipant.setMicrophoneEnabled(true);
      } catch {
        // The browser may block the microphone until the host grants it.
      }
      try {
        await localParticipant.setCameraEnabled(true);
      } catch {
        // No camera, or permission was denied. The room still works without it.
      }
    })();
  }, [enabled, localParticipant, connectionState]);

  return null;
}

function AudioActivationGate({ 
  audioNeedsActivation, 
  setAudioNeedsActivation 
}: { 
  audioNeedsActivation: boolean; 
  setAudioNeedsActivation: (val: boolean) => void;
}) {
  const room = useRoomContext();

  const handleAudioActivation = async () => {
    try {
      await room.startAudio();
      setAudioNeedsActivation(false);
    } catch (error) {
      console.error("Failed to start audio:", error);
    }
  };

  useEffect(() => {
    const handleFirstInteraction = () => {
      handleAudioActivation();
    };
    window.addEventListener('click', handleFirstInteraction, { once: true });
    return () => window.removeEventListener('click', handleFirstInteraction);
  }, [room]);

  if (!audioNeedsActivation) return null;

  return (
    <div className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
       <div className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] flex flex-col items-center text-center shadow-2xl space-y-6 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white">
             <MicOff size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Audio is currently blocked</h2>
            <p className="text-white/40 text-sm mt-2">Browser security requires a click to enable audio for this session.</p>
          </div>
          <button 
            onClick={handleAudioActivation}
            className="w-full py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-xl shadow-primary/20"
          >
            Start Listening
          </button>
       </div>
    </div>
  );
}

function ParticipantListener({ onHandRaise }: { onHandRaise: (name: string, identity: string) => void }) {
  const room = useRoomContext();
  const lastHandRaiseRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleMetadataChanged = (metadata: string | undefined, participant: Participant) => {
      try {
        if (metadata) {
          const data = JSON.parse(metadata);
          const wasRaised = lastHandRaiseRef.current[participant.identity];
          const isRaised = data.handRaised;

          if (isRaised && !wasRaised) {
            onHandRaise(participant.name || participant.identity, participant.identity);
          }
          lastHandRaiseRef.current[participant.identity] = !!isRaised;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    };

    room.on('participantMetadataChanged', handleMetadataChanged);
    return () => {
      room.off('participantMetadataChanged', handleMetadataChanged);
    };
  }, [room, onHandRaise]);

  return null;
}

/* ---------------------------------------------------------------- */
/* Room presence, moderation, side panel and creator studio          */
/* ---------------------------------------------------------------- */

const roomEncoder = new TextEncoder();

async function sendRoomData(
  sender: { publishData: (data: Uint8Array, options?: any) => Promise<unknown> },
  payload: Record<string, unknown>,
  destinations?: string[],
) {
  await sender.publishData(roomEncoder.encode(JSON.stringify(payload)), {
    reliable: true,
    ...(destinations ? { destinationIdentities: destinations } : {}),
  });
}

function RoomPresence() {
  const participants = useParticipants();
  return (
    <span className="ml-1 hidden shrink-0 items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/50 md:flex">
      <Users size={11} /> {participants.length}
    </span>
  );
}

function ModerationBridge({
  moderatorIds,
  onSpotlight,
  onLeave,
  onNotice,
}: {
  moderatorIds: string[];
  onSpotlight: (identity: string | null) => void;
  onLeave: () => void;
  onNotice: (message: string) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const moderatorSet = useMemo(() => new Set(moderatorIds), [moderatorIds]);

  useEffect(() => {
    if (!localParticipant) return;

    const handleData = (payload: Uint8Array, participant?: Participant) => {
      try {
        if (!participant || !moderatorSet.has(participant.identity)) return;
        const data = JSON.parse(new TextDecoder().decode(payload));

        if (data.type === 'spotlight') {
          onSpotlight(data.target || null);
          return;
        }

        if (data.type !== 'moderation' || data.target !== localParticipant.identity) return;

        if (data.action === 'mute') {
          localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          onNotice('The host muted your microphone');
        }

        if (data.action === 'remove') {
          onNotice('The host removed you from the room');
          setTimeout(onLeave, 1200);
        }
      } catch {
        // Ignore malformed data packets.
      }
    };

    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room, localParticipant, moderatorSet, onSpotlight, onLeave, onNotice]);

  return null;
}

function SidebarPanel({
  eventId,
  activeTab,
  setActiveTab,
  canManage,
  settings,
  spotlightIdentity,
  onSpotlight,
  onClose,
  isDesktop,
}: {
  eventId: string;
  activeTab: 'chat' | 'polls' | 'qa' | 'participants';
  setActiveTab: (tab: 'chat' | 'polls' | 'qa' | 'participants') => void;
  canManage: boolean;
  settings: LiveSessionSettings;
  spotlightIdentity: string | null;
  onSpotlight: (identity: string | null) => void;
  onClose: () => void;
  isDesktop: boolean;
}) {
  const tabs: { id: 'chat' | 'polls' | 'qa' | 'participants'; label: string; icon: ReactNode; locked?: boolean }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={16} />, locked: !settings.chat },
    { id: 'qa', label: 'Q&A', icon: <HelpCircle size={16} />, locked: !settings.qa },
    { id: 'polls', label: 'Polls', icon: <BarChart2 size={16} />, locked: !settings.polls },
    { id: 'participants', label: 'People', icon: <Users size={16} /> },
  ];

  return (
    <>
      <div className="flex items-center border-b border-white/[0.06] px-1">
        {tabs.map(tab => {
          const on = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-1 flex-col items-center gap-1 py-3 text-[9px] font-bold uppercase tracking-[0.13em] transition-colors ${
                on ? 'text-primary' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.locked && <Lock size={8} className="absolute right-2 top-2 text-amber-400/70" />}
              {on && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
        {!isDesktop && (
          <button onClick={onClose} aria-label="Close panel" className="ml-0.5 p-2 text-white/40 transition-colors hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <LiveChat eventId={eventId} locked={!settings.chat} />}
        {activeTab === 'qa' && <LiveQA eventId={eventId} isHost={canManage} locked={!settings.qa} />}
        {activeTab === 'polls' && <LivePolls eventId={eventId} isHost={canManage} locked={!settings.polls} />}
        {activeTab === 'participants' && (
          <ParticipantsPanel
            canManage={canManage}
            spotlightIdentity={spotlightIdentity}
            onSpotlight={onSpotlight}
          />
        )}
      </div>
    </>
  );
}

function ParticipantsPanel({
  canManage,
  spotlightIdentity,
  onSpotlight,
}: {
  canManage: boolean;
  spotlightIdentity: string | null;
  onSpotlight: (identity: string | null) => void;
}) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = [...participants].sort((a, b) => {
    if (a.identity === localParticipant?.identity) return -1;
    if (b.identity === localParticipant?.identity) return 1;
    return Number(b.isSpeaking) - Number(a.isSpeaking) || (a.name || '').localeCompare(b.name || '');
  });

  const send = async (target: string, action: 'mute' | 'remove') => {
    if (!localParticipant) return;
    setBusyId(target);
    try {
      await sendRoomData(localParticipant, { type: 'moderation', action, target }, [target]);
      toast.success(action === 'mute' ? 'Mute request sent' : 'Removal request sent');
    } catch {
      toast.error('Could not reach that participant');
    } finally {
      setBusyId(null);
      setConfirmRemove(null);
    }
  };

  const spotlight = async (target: string) => {
    if (!localParticipant) return;
    const next = spotlightIdentity === target ? null : target;
    try {
      await sendRoomData(localParticipant, { type: 'spotlight', target: next });
      onSpotlight(next);
      toast.success(next ? 'Spotlight shared with the room' : 'Spotlight cleared');
    } catch {
      toast.error('Could not update the spotlight');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto p-2.5 custom-scrollbar">
        {sorted.map(participant => {
          let meta: any = {};
          try { meta = participant.metadata ? JSON.parse(participant.metadata) : {}; } catch { meta = {}; }
          const isMe = participant.identity === localParticipant?.identity;
          const isSpotlight = spotlightIdentity === participant.identity;

          return (
            <div
              key={participant.identity}
              className={`flex items-center gap-2.5 rounded-2xl px-2 py-2 transition-colors ${
                isSpotlight ? 'bg-primary/[0.08] ring-1 ring-primary/20' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className={`relative shrink-0 rounded-full ${participant.isSpeaking ? 'ring-2 ring-primary ring-offset-2 ring-offset-[#09070c]' : ''}`}>
                <Avatar src={meta.photoURL || meta.avatar} seed={participant.identity} size={34} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-white/90">
                  {participant.name || participant.identity}
                  {isMe && <span className="text-[9px] font-medium text-white/35">you</span>}
                  {isSpotlight && <Star size={10} className="fill-amber-400 text-amber-400" />}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">
                  {participant.isMicrophoneEnabled ? <Mic size={10} /> : <MicOff size={10} className="text-red-400/80" />}
                  <span>{participant.isCameraEnabled ? 'Camera on' : 'Camera off'}</span>
                  {participant.isSpeaking && <span className="text-primary">Speaking</span>}
                </p>
              </div>

              {canManage && !isMe && (
                confirmRemove === participant.identity ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => send(participant.identity, 'remove')} disabled={busyId === participant.identity} className="rounded-full bg-red-500 px-2 py-1 text-[9px] font-bold text-white disabled:opacity-50">
                      Remove
                    </button>
                    <button onClick={() => setConfirmRemove(null)} className="rounded-full px-1.5 py-1 text-[9px] font-semibold text-white/50">
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => send(participant.identity, 'mute')}
                      disabled={busyId === participant.identity}
                      title="Mute microphone"
                      className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                    >
                      <VolumeX size={14} />
                    </button>
                    <button
                      onClick={() => spotlight(participant.identity)}
                      title={isSpotlight ? 'Clear spotlight' : 'Spotlight this person'}
                      className={`rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] ${isSpotlight ? 'text-amber-400' : 'text-white/35 hover:text-amber-300'}`}
                    >
                      <Star size={14} fill={isSpotlight ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => setConfirmRemove(participant.identity)}
                      title="Remove from room"
                      className="rounded-lg p-1.5 text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <UserX size={14} />
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] px-3.5 py-3">
        <p className="text-[10px] leading-relaxed text-white/25">
          {canManage
            ? 'Mute and spotlight requests are sent to each person in the room.'
            : 'Only the host and co-hosts can moderate this room.'}
        </p>
      </div>
    </div>
  );
}

function HostStudio({
  open,
  onClose,
  settings,
  onChange,
  hasTimer,
  timeRemaining,
  onExtend,
  extending,
  onOpenPeople,
  onOpenConsole,
}: {
  open: boolean;
  onClose: () => void;
  settings: LiveSessionSettings;
  onChange: (key: keyof LiveSessionSettings, value: boolean) => void;
  hasTimer: boolean;
  timeRemaining: number | null;
  onExtend: () => void;
  extending: boolean;
  onOpenPeople: () => void;
  onOpenConsole: () => void;
}) {
  const controls: { key: keyof LiveSessionSettings; label: string; description: string; icon: ReactNode }[] = [
    { key: 'chat', label: 'Live chat', description: 'Let the audience talk between themselves.', icon: <MessageSquare size={16} /> },
    { key: 'qa', label: 'Questions', description: 'Let people ask and upvote questions.', icon: <HelpCircle size={16} /> },
    { key: 'polls', label: 'Polls', description: 'Let the audience vote on prompts.', icon: <BarChart2 size={16} /> },
    { key: 'reactions', label: 'Reactions', description: 'Floating emoji and quick reactions.', icon: <Smile size={16} /> },
    { key: 'handRaise', label: 'Hand raises', description: 'Let people ask to speak.', icon: <Hand size={16} /> },
  ];

  const timerLabel = hasTimer && timeRemaining !== null
    ? `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')} left`
    : 'This room has no countdown';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#0c0910] shadow-2xl sm:max-w-lg sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <Sparkles size={16} />
                </span>
                <div>
                  <p className="text-[13px] font-bold text-white">Creator studio</p>
                  <p className="text-[10px] text-white/35">Shape the room while you’re live</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close studio" className="rounded-full p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto p-5 custom-scrollbar">
              <section>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">Room controls</p>
                <div className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                  {controls.map(control => (
                    <StudioToggle
                      key={control.key}
                      icon={control.icon}
                      label={control.label}
                      description={control.description}
                      checked={settings[control.key]}
                      onChange={value => onChange(control.key, value)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">Session timer</p>
                <div className="mt-2 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
                  <div>
                    <p className="text-[12px] font-semibold text-white">{timerLabel}</p>
                    <p className="mt-0.5 text-[10px] text-white/35">Give the conversation a little more room.</p>
                  </div>
                  <button
                    onClick={onExtend}
                    disabled={!hasTimer || extending}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-2 text-[11px] font-bold text-amber-300 transition-colors hover:bg-amber-400/25 disabled:opacity-40"
                  >
                    {extending ? <Loader2 size={12} className="animate-spin" /> : <Timer size={12} />} +15 min
                  </button>
                </div>
              </section>

              <section>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">Quick actions</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MuteAllControl />
                  <button
                    onClick={onOpenPeople}
                    className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white"
                  >
                    <Users size={15} /> Manage people <ChevronRight size={13} className="text-white/25" />
                  </button>
                  <button
                    onClick={onOpenConsole}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
                  >
                    <Settings2 size={15} /> Open host console <ChevronRight size={13} className="text-primary/50" />
                  </button>
                </div>
              </section>

              <p className="flex items-start gap-2 rounded-2xl bg-primary/[0.06] px-3.5 py-3 text-[10px] leading-relaxed text-white/40">
                <Lock size={12} className="mt-0.5 shrink-0 text-primary/70" />
                Controls apply instantly for everyone in the room. You can change them at any time.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function StudioToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-white/40">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-white/90">{label}</p>
        <p className="mt-0.5 text-[10px] text-white/35">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={`${checked ? 'Disable' : 'Enable'} ${label}`}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-white/15'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function MuteAllControl() {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState(false);

  const muteAll = async () => {
    if (!localParticipant) return;
    setBusy(true);
    try {
      const targets = participants.filter(p => p.identity !== localParticipant.identity && p.isMicrophoneEnabled);
      await Promise.all(
        targets.map(p => sendRoomData(localParticipant, { type: 'moderation', action: 'mute', target: p.identity }, [p.identity])),
      );
      toast.success(
        targets.length > 0
          ? `Muted ${targets.length} microphone${targets.length === 1 ? '' : 's'}`
          : 'Everyone is already muted',
      );
    } catch {
      toast.error('Could not mute everyone');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={muteAll}
      disabled={busy}
      className="flex items-center justify-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-3 text-[11px] font-semibold text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <VolumeX size={15} />} Mute everyone
    </button>
  );
}

function SessionLayout({ 
  hostId, 
  spotlightIdentity,
  manualPinnedTrack, 
  onPin 
}: { 
  hostId?: string; 
  spotlightIdentity?: string | null;
  manualPinnedTrack: { identity: string; source: Track.Source } | null;
  onPin: (identity: string, source: Track.Source) => void;
}) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const screenShareTrack = tracks.find(t => t.source === Track.Source.ScreenShare);
  const cameraTracks = tracks.filter(t => t.source === Track.Source.Camera);
  
  // Determine the pinned track: 
  // 1. Manual pin takes priority
  // 2. Screen share takes priority
  // 3. Host takes priority
  // 4. First available
  const manualTrack = manualPinnedTrack 
    ? tracks.find(t => t.participant.identity === manualPinnedTrack.identity && t.source === manualPinnedTrack.source)
    : null;
    
  const hostTrack = cameraTracks.find(t => t.participant.identity === hostId);
  const spotlightTrack = spotlightIdentity
    ? cameraTracks.find(t => t.participant.identity === spotlightIdentity)
    : null;
  const pinnedTrack = manualTrack || screenShareTrack || spotlightTrack || hostTrack || cameraTracks[0];
  
  // Other tracks to show in the sidebar (excluding the pinned one)
  const sidebarTracks = tracks.filter(t => t !== pinnedTrack);

  return (
    <div className="h-full w-full flex flex-row p-4 pb-24 gap-4 overflow-hidden bg-black">
      {/* Main Focus Area */}
      <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 bg-zinc-900/50 shadow-2xl group">
        {pinnedTrack ? (
          <TrackRefContext.Provider value={pinnedTrack}>
            <CustomParticipantTile onPin={() => onPin(pinnedTrack.participant.identity, pinnedTrack.source)} isPinned />
          </TrackRefContext.Provider>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/20">
            <div className="flex flex-col items-center gap-4">
              <Users size={48} className="opacity-20" />
              <p className="text-sm font-medium">Waiting for presenter...</p>
            </div>
          </div>
        )}
      </div>

      {/* Participants Sidebar (Inside Video Area) */}
      {sidebarTracks.length > 0 && (
        <div className="w-48 md:w-64 flex flex-col gap-3 overflow-y-auto scrollbar-hide shrink-0 pb-4">
          <AnimatePresence>
            {sidebarTracks.map((track) => (
              <motion.div 
                key={`${track.participant.identity}-${track.source}`} 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                className="aspect-video w-full rounded-xl overflow-hidden border border-white/10 shadow-lg bg-zinc-900/80 backdrop-blur-md shrink-0 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => onPin(track.participant.identity, track.source)}
              >
                <TrackRefContext.Provider value={track}>
                  <CustomParticipantTile isSmall onPin={() => onPin(track.participant.identity, track.source)} />
                </TrackRefContext.Provider>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function CustomParticipantTile({ 
  isSmall = false, 
  onPin,
  isPinned = false
}: { 
  isSmall?: boolean; 
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const trackRef = useTrackRefContext();
  const participant = trackRef?.participant;
  const isScreenShare = trackRef?.source === Track.Source.ScreenShare;

  if (!participant || !trackRef) return null;

  const isLocal = participant.identity === auth.currentUser?.uid;
  const participantMetadata = participant.metadata ? JSON.parse(participant.metadata) : {};
  const avatarUrl = participantMetadata.photoURL || participantMetadata.avatar || (participant.identity.startsWith('guest_') ? `https://api.dicebear.com/7.x/initials/svg?seed=${participant.identity}` : null);
  const handRaised = participantMetadata.handRaised;
  
  return (
    <div className={`relative rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 group h-full w-full shadow-2xl ${isSmall ? 'rounded-xl' : ''} ${handRaised ? 'ring-2 ring-yellow-500' : ''}`}>
      {/* Video Track */}
      {(trackRef.source === Track.Source.Camera || trackRef.source === Track.Source.ScreenShare) && 'publication' in trackRef && trackRef.publication && (
        <VideoTrack 
          trackRef={trackRef as any} 
          className={`w-full h-full ${isScreenShare ? 'object-contain bg-black' : 'object-cover'}`} 
          disablePictureInPicture
          playsInline
        />
      )}

      {/* Placeholder for Camera Off */}
      {!isScreenShare && !participant.isCameraEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 z-0">
          <div className="flex flex-col items-center gap-4">
            <div className={`${isSmall ? 'w-12 h-12' : 'w-24 h-24'} rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-2xl backdrop-blur-md overflow-hidden ring-4 ring-primary/20`}>
              {avatarUrl || participant ? (
                <img 
                  src={avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.identity}`} 
                  alt={participant.name || participant.identity} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer" 
                />
              ) : (
                <User size={isSmall ? 24 : 48} className="text-white/20" />
              )}
            </div>
            {!isSmall && (
              <div className="px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                <span className="text-sm font-medium text-white/80">
                  {participant.name || participant.identity}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Overlays */}
      <div className={`absolute ${isSmall ? 'top-2 right-2' : 'top-3 right-3'} flex items-center gap-2 z-20 transition-opacity`}>
        {handRaised && (
          <div className={`${isSmall ? 'p-1' : 'p-1.5'} rounded-lg bg-yellow-500 text-black shadow-lg`}>
            <Hand size={isSmall ? 12 : 14} fill="currentColor" />
          </div>
        )}
        {!isPinned && onPin && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            className={`p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white/70 hover:text-primary transition-all opacity-0 group-hover:opacity-100`}
            title="Pin participant"
          >
            <Pin size={isSmall ? 12 : 14} />
          </button>
        )}
      </div>

      <div className={`absolute ${isSmall ? 'bottom-2 left-2 right-2' : 'bottom-3 left-3 right-3'} flex items-center justify-between z-10`}>
        <div className={`flex items-center gap-2 ${isSmall ? 'px-2 py-1' : 'px-3 py-1.5'} bg-black/60 backdrop-blur-md border border-white/10 rounded-xl`}>
          <span className={`${isSmall ? 'text-[10px]' : 'text-xs'} font-bold text-white truncate max-w-[150px]`}>
            {participant.name || participant.identity}
          </span>
          {!participant.isMicrophoneEnabled && (
            <MicOff size={isSmall ? 10 : 12} className="text-red-500" />
          )}
          {isScreenShare && (
            <div className={`flex items-center gap-1 ${isSmall ? 'px-1 py-0.5' : 'px-2 py-0.5'} bg-primary/20 rounded ${isSmall ? 'text-[8px]' : 'text-[10px]'} text-primary font-bold uppercase tracking-wider`}>
              <MonitorUp size={isSmall ? 8 : 10} /> {isSmall ? 'Live' : 'Presenting'}
            </div>
          )}
        </div>
        {!isSmall && (
          <div className="flex items-center gap-2">
            <ConnectionQualityIndicator className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Speaking Indicator */}
      {!isScreenShare && participant.isSpeaking && (
        <div className={`absolute ${isSmall ? 'top-2 right-2 w-6 h-6' : 'top-3 right-3 w-8 h-8'} flex items-center justify-center bg-primary/20 backdrop-blur-md rounded-full border border-white/10`}>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className={`${isSmall ? 'w-2 h-2' : 'w-2.5 h-2.5'} bg-primary rounded-full shadow-[0_0_15px_rgba(139,92,246,0.6)]`}
          />
        </div>
      )}
    </div>
  );
}

function CustomControlBar({ allowReactions = true, allowHands = true, onLeave }: { allowReactions?: boolean; allowHands?: boolean; onLeave: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { toggle: toggleScreenShare, enabled: isScreenShareEnabled } = useTrackToggle({
    source: Track.Source.ScreenShare,
  });
  
  const handleScreenShare = async () => {
    try {
      // Check if room is connected before toggling
      if (room.state === 'connected') {
        await toggleScreenShare();
      } else {
        console.warn('Cannot share screen: Room not connected. Current state:', room.state);
      }
    } catch (error: any) {
      console.error('Screen share error:', error);
      // Handle the timeout error gracefully
      if (error.message?.includes('timeout')) {
        toast.error('Connection timeout while trying to share screen. Please check your connection and try again.');
      } else if (error.message?.includes('Permission denied') || error.name === 'NotAllowedError') {
        // User cancelled the screen share picker
        console.log('User cancelled screen share');
      } else {
        toast.error(`Screen share failed: ${error.message}`);
      }
    }
  };

  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [activeReactions, setActiveReactions] = useState<{ id: number; emoji: string; x: number; size: number; delay: number; duration: number }[]>([]);

  const reactions = [
    { icon: ThumbsUp, emoji: '👍', label: 'Like' },
    { icon: Heart, emoji: '❤️', label: 'Love' },
    { icon: Smile, emoji: '😊', label: 'Smile' },
    { icon: Zap, emoji: '⚡', label: 'Zap' },
    { icon: PartyPopper, emoji: '🎉', label: 'Party' },
  ];

  const triggerReaction = (emoji: string) => {
    const count = 5 + Math.floor(Math.random() * 5);
    const newReactions = Array.from({ length: count }).map((_, i) => ({
      id: Date.now() + i,
      emoji,
      x: (Math.random() - 0.5) * 300,
      size: 20 + Math.random() * 30,
      delay: Math.random() * 0.5,
      duration: 2 + Math.random() * 2
    }));

    setActiveReactions(prev => [...prev, ...newReactions]);
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => !newReactions.find(nr => nr.id === r.id)));
    }, 4000);
  };

  const sendReaction = async (emoji: string) => {
    triggerReaction(emoji);
    setShowReactions(false);

    // Broadcast to others
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'reaction', emoji }));
      await localParticipant.publishData(data, { reliable: false });
    } catch (e) {
      console.error('Failed to broadcast reaction', e);
    }
  };

  useEffect(() => {
    const handleData = (payload: Uint8Array, participant?: Participant) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));
        if (data.type === 'reaction') {
          triggerReaction(data.emoji);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    };

    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room]);

  const toggleHand = async () => {
    if (!allowHands) {
      toast('The host has turned off hand raises');
      return;
    }
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    
    if (newState) {
      // Trigger local notification and sound immediately
      // We use a custom event or direct call to addNotification if we had access to it, 
      // but since CustomControlBar is nested, we'll just handle it via metadata for others
      // and locally here for the user.
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
      audio.volume = 0.4;
      audio.play().catch(e => console.warn('Audio play deferred', e));
    }

    try {
      const currentMeta = localParticipant.metadata ? JSON.parse(localParticipant.metadata) : {};
      await localParticipant.setMetadata(JSON.stringify({
        ...currentMeta,
        handRaised: newState
      }));
    } catch (e) {
      console.error('Failed to set metadata', e);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 pb-4">
      {/* Floating Reactions */}
      <div className="relative h-0 w-full flex justify-center">
        <AnimatePresence>
          {activeReactions.map(reaction => (
            <motion.div
              key={reaction.id}
              initial={{ y: 0, opacity: 0, scale: 0.5, x: 0 }}
              animate={{ 
                y: -400, 
                opacity: [0, 1, 1, 0], 
                scale: [0.5, 1.2, 1, 0.8],
                x: reaction.x + Math.sin(Date.now() / 1000) * 20
              }}
              transition={{ 
                duration: reaction.duration, 
                delay: reaction.delay,
                ease: "easeOut"
              }}
              exit={{ opacity: 0 }}
              className="absolute pointer-events-none select-none"
              style={{ 
                fontSize: `${reaction.size}px`,
                left: '50%'
              }}
            >
              {reaction.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex max-w-full items-center gap-1.5 rounded-3xl border border-white/10 bg-black/60 px-2.5 py-2.5 shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl sm:gap-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <TrackToggle 
            source={Track.Source.Microphone} 
            showIcon={false}
            className="!p-3 !rounded-2xl !bg-white/5 hover:!bg-white/10 !border-none !transition-all"
          >
            {localParticipant.isMicrophoneEnabled ? <Mic size={20} /> : <MicOff size={20} className="text-red-500" />}
          </TrackToggle>
          <TrackToggle 
            source={Track.Source.Camera}
            showIcon={false}
            className="!p-3 !rounded-2xl !bg-white/5 hover:!bg-white/10 !border-none !transition-all"
          >
            {localParticipant.isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} className="text-red-500" />}
          </TrackToggle>
          <button
            onClick={handleScreenShare}
            className={`!p-3 !rounded-2xl !bg-white/5 hover:!bg-white/10 !border-none !transition-all ${isScreenShareEnabled ? 'text-primary' : ''}`}
            title="Share screen"
          >
            <MonitorUp size={20} />
          </button>
        </div>
        
        <div className="mx-1 h-8 w-px bg-white/10 sm:mx-2" />

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={toggleHand}
            disabled={!allowHands}
            className={`p-3 rounded-2xl transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
              isHandRaised ? 'bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'bg-white/5 hover:bg-white/10 text-white/70'
            }`}
            title={allowHands ? 'Raise hand' : 'Hand raises are off'}
          >
            <Hand size={20} fill={isHandRaised ? 'currentColor' : 'none'} />
          </button>

          <div className="relative">
            <button
              onClick={() => { if (allowReactions) setShowReactions(!showReactions); else toast('The host has turned off reactions'); }}
              disabled={!allowReactions}
              className={`p-3 rounded-2xl transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                showReactions ? 'bg-primary text-white shadow-[0_0_20px_rgba(255,107,74,0.3)]' : 'bg-white/5 hover:bg-white/10 text-white/70'
              }`}
              title={allowReactions ? 'Reactions' : 'Reactions are off'}
            >
              <Smile size={20} />
            </button>

            <AnimatePresence>
              {showReactions && allowReactions && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: -70, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-2 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl flex gap-2 shadow-2xl"
                >
                  {reactions.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => sendReaction(r.emoji)}
                      className="p-3 hover:bg-white/10 rounded-xl transition-all hover:scale-125"
                      title={r.label}
                    >
                      <r.icon size={20} className="text-white" />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="w-px h-8 bg-white/10 mx-2" />

        <button
          onClick={onLeave}
          className="rounded-2xl border border-red-500/30 bg-red-500/20 px-6 py-3 font-bold text-red-500 transition-all hover:bg-red-500 hover:text-white"
        >
          Leave
        </button>
      </div>
    </div>
  );
}

function ShareModal({ isOpen, onClose, eventId, eventTitle }: { isOpen: boolean, onClose: () => void, eventId: string, eventTitle: string }) {
  const [activeTab, setActiveTab] = useState<'copy' | 'dm' | 'community'>('copy');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  const shareUrl = `${window.location.origin}/live/${eventId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (activeTab === 'dm') fetchFollowers();
    else if (activeTab === 'community') fetchCommunities();
    else setItems([]);
  }, [activeTab]);

  const fetchFollowers = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const followersSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'following'));
      const ids = followersSnap.docs.map(d => d.id);
      if (ids.length === 0) { setItems([]); return; }
      
      const userPromises = ids.map(id => getDoc(doc(db, 'users', id)));
      const snaps = await Promise.all(userPromises);
      setItems(snaps.map(s => ({ id: s.id, ...s.data() })));
    } catch (e) { 
      console.error(e);
      setItems([]);
    } finally { setLoading(false); }
  };

  const fetchCommunities = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'communities'), where('members', 'array-contains', auth.currentUser.uid));
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { 
      console.error(e);
      setItems([]);
    } finally { setLoading(false); }
  };

  const shareToDM = async (friendId: string) => {
    if (!auth.currentUser) return;
    setSending(friendId);
    try {
      const inviteMessage = `Hey! Join my live session: "${eventTitle}". Link: ${shareUrl}`;
      await sendDirectMessage(
        { uid: auth.currentUser.uid, name: auth.currentUser.displayName || 'Someone', photo: auth.currentUser.photoURL || '' },
        friendId,
        inviteMessage,
        false,
      );
      
      await createNotification({
        recipientId: friendId,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Someone',
        senderPhoto: auth.currentUser.photoURL || '',
        type: 'message',
        content: 'invited you to a live session',
        relatedId: eventId,
        liveInvite: true,
      });

      toast.success('Invitation sent!');
    } catch (e) { 
        console.error(e);
        toast.error('Failed to send invitation'); 
    } finally { setSending(null); }
  };

  const shareToCommunity = async (community: any) => {
    if (!auth.currentUser) return;
    setSending(community.id);
    try {
      await addDoc(collection(db, 'communities', community.id, 'messages'), {
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Anonymous',
        content: `🔴 LIVE NOW: ${eventTitle}\nJoin here: ${shareUrl}`,
        createdAt: serverTimestamp(),
        type: 'text'
      });
      toast.success(`Shared to ${community.name}`);
    } catch (e) { 
        console.error(e);
        toast.error('Failed to share to community'); 
    } finally { setSending(null); }
  };

  const filteredItems = items.filter(item => 
    (item.username || item.name || item.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Share Session</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40">
              <X size={24} />
            </button>
          </div>

          <div className="flex bg-white/5 p-1 rounded-2xl mb-6">
            <button 
              onClick={() => setActiveTab('copy')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === 'copy' ? 'bg-primary text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
            >
              Copy Link
            </button>
            <button 
              onClick={() => setActiveTab('dm')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === 'dm' ? 'bg-primary text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
            >
              Followers
            </button>
            <button 
              onClick={() => setActiveTab('community')}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${activeTab === 'community' ? 'bg-primary text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
            >
              Communities
            </button>
          </div>

          <div className="min-h-[300px]">
            {activeTab === 'copy' && (
              <div className="flex flex-col items-center justify-center h-full py-10 space-y-6">
                <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-primary">
                  <Share2 size={40} />
                </div>
                <div className="w-full space-y-4">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-center select-all cursor-pointer hover:bg-white/10 transition-all font-mono text-sm break-all">
                    {shareUrl}
                  </div>
                  <button 
                    onClick={handleCopy}
                    className="w-full bg-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-95"
                  >
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                    {copied ? 'Copied!' : 'Copy Invitation Link'}
                  </button>
                </div>
              </div>
            )}

            {(activeTab === 'dm' || activeTab === 'community') && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input 
                    type="text"
                    placeholder={`Search ${activeTab === 'dm' ? 'followers' : 'communities'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary transition-all text-sm"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {loading ? (
                    <div className="py-20 flex justify-center">
                      <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden border border-white/10">
                            <img 
                              src={(activeTab === 'dm' ? (item.profileImage || item.photoURL) : (item.image || item.logo)) || `https://api.dicebear.com/7.x/identicon/svg?seed=${item.id}`} 
                              alt="" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <p className="text-sm font-bold">{activeTab === 'dm' ? (item.displayName || item.username) : item.name}</p>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest">
                              {activeTab === 'dm' ? `@${item.username}` : `${item.members?.length || 0} Members`}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => activeTab === 'dm' ? shareToDM(item.id) : shareToCommunity(item)}
                          disabled={sending === item.id}
                          className="px-4 py-2 rounded-xl bg-primary/20 text-primary text-xs font-bold hover:bg-primary hover:text-white transition-all disabled:opacity-50"
                        >
                          {sending === item.id ? <Loader2 size={14} className="animate-spin" /> : 'Share'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center">
                      <p className="text-white/20 italic text-sm">No {activeTab === 'dm' ? 'followers' : 'communities'} found</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center gap-3 p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/10">
            <Globe size={18} className="text-yellow-500 shrink-0" />
            <p className="text-[10px] text-yellow-500/60 uppercase tracking-widest font-bold leading-relaxed">
              Anyone with the link can join this session, even without an account.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
