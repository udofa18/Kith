import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  VideoConference, 
  ControlBar, 
  RoomAudioRenderer,
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
  DisconnectButton,
  TrackToggle,
  ParticipantContext,
  ParticipantName,
  ParticipantPlaceholder,
  ConnectionQualityIndicator,
  useRoomContext
} from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
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
  MonitorPlay
} from 'lucide-react';
import LiveChat from '../components/live/LiveChat';
import LivePolls from '../components/live/LivePolls';
import LiveQA from '../components/live/LiveQA';
import axios from 'axios';
import { createNotification } from '../lib/notifications';
import { gainXP } from '../lib/xp';
import ConfirmModal from '../components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { useLiveSession } from '../contexts/LiveSessionContext';
import { sendDirectMessage } from '../features/messages/api';

export default function LiveSession() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { session, minimizeSession, expandSession, endSession, startSession, setGuestName: setGlobalGuestName } = useLiveSession();
  const [loading, setLoading] = useState(!session.isActive);
  const [error, setError] = useState<string | null>(null);
  const [audioNeedsActivation, setAudioNeedsActivation] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'polls' | 'qa' | 'participants'>('chat');
  const [showSidebar, setShowSidebar] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isCoHost, setIsCoHost] = useState(false);
  const canManage = isHost || isCoHost;
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [manualPinnedTrack, setManualPinnedTrack] = useState<{ identity: string; source: Track.Source } | null>(null);
  const [notifications, setNotifications] = useState<{ id: number; message: string; type: 'info' | 'hand' }[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [guestName, setGuestName] = useState<string>('');
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const event = session.eventData;

  useEffect(() => {
    if (!eventId) return;
    
    // If no session is active or it's a different event, start it
    if (!session.isActive || session.eventId !== eventId) {
      setLoading(true);
      startSession(eventId).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [eventId, startSession, session.isActive, session.eventId]);

  useEffect(() => {
    if (session.eventData) {
      const hostId = session.eventData.hostId;
      const currentIsHost = auth.currentUser ? hostId === auth.currentUser.uid : false;
      const currentIsCoHost = auth.currentUser ? session.eventData.coHostIds?.includes(auth.currentUser.uid) : false;
      setIsHost(currentIsHost);
      setIsCoHost(currentIsCoHost);
    }
  }, [session.eventData]);

  useEffect(() => {
    if (!session.isActive && !loading && !error) {
      navigate(`/events/${eventId || ''}`);
    }
  }, [session.isActive, loading, error, navigate, eventId]);

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
    if (!event?.isInstant || !event?.expiresAt) return;

    const endSessionFunc = async () => {
      if (canManage && !ending) {
        setEnding(true);
        try {
          await updateDoc(doc(db, 'events', eventId!), { status: 'ended' });
          await setDoc(doc(db, 'eventSessions', eventId!), { 
            status: 'ended', 
            endTime: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
          toast.error('Session expired (30m limit)');
          navigate(`/events/${eventId}`);
        } catch (error) {
          console.error("Error auto-ending session:", error);
        }
      } else if (!canManage) {
        toast.error('Session expired');
        navigate(`/events/${eventId}`);
      }
    };

    const interval = setInterval(() => {
      const expires = new Date(event.expiresAt).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setTimeRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        endSessionFunc();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [event, eventId, canManage, ending]);

  useEffect(() => {
    if (!eventId || canManage) return;

    const unsubscribe = onSnapshot(doc(db, 'eventSessions', eventId), (snap) => {
      if (snap.exists()) {
        const sessionData = snap.data();
        if (sessionData.status === 'ended') {
          toast.error('The host or co-host has ended this session');
          endSession();
          navigate(`/events/${eventId}`);
        }
      }
    });

    return () => unsubscribe();
  }, [eventId, canManage, endSession, navigate]);

  useEffect(() => {
    if (!eventId) return;

    if (!auth.currentUser && !guestName && !session.isActive) {
      setShowGuestPrompt(true);
      setLoading(false);
      return;
    }
  }, [eventId, session.isActive, minimizeSession]);

  const handleMinimize = async () => {
    await minimizeSession();
    // No navigate here, we want to stay on the page and show the placeholder
  };

  const handleLeave = () => {
    endSession();
    navigate(`/events/${eventId}`);
  };

  // Auto-minimize when tab is hidden (Manual Document PiP is strict, but we try)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && session.isActive && !session.isMinimized) {
        // We try to minimize, but it might fail due to "User activation" requirement
        minimizeSession().catch(() => {
           // Silent fail as expected for auto-pip without direct click
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session.isActive, session.isMinimized, minimizeSession]);

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

  if (showGuestPrompt) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-2xl"
        >
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-[0_0_30px_rgba(var(--primary),0.2)]">
              <User size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-2">Welcome!</h2>
          <p className="text-white/40 text-center mb-8">What should we call you during this session?</p>
          
          <div className="space-y-4">
            <input 
              type="text"
              autoFocus
              placeholder="Enter your name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-primary transition-all text-lg font-bold text-center"
              onKeyDown={(e) => e.key === 'Enter' && guestName.trim() && setShowGuestPrompt(false)}
            />
            <button
              disabled={!guestName.trim()}
              onClick={() => {
                setGlobalGuestName(guestName);
                setShowGuestPrompt(false);
              }}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-[0_0_30px_rgba(var(--primary),0.3)]"
            >
              Join Session
            </button>
            <p className="text-[10px] text-white/20 text-center uppercase tracking-widest font-bold">You are joining as a guest</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
          <Shield size={40} />
        </div>
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-white/40 mb-8 max-w-md">{error}</p>
        <button 
          onClick={() => navigate(`/events/${eventId}`)}
          className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:scale-105 transition-all"
        >
          Return to Event Page
        </button>
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
      <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-red-500">Live</span>
          </div>
          {timeRemaining !== null && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
              <Clock size={12} className="animate-pulse" />
              <span className="text-[10px] font-black font-mono">
                {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
              </span>
            </div>
          )}
          <div className="h-4 w-px bg-white/10" />
          <h1 className="font-bold truncate max-w-md">{event?.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleMinimize}
            className="p-2 rounded-xl hover:bg-white/5 text-white/50 transition-all flex items-center gap-2"
            title="Minimize to Pop-out Window"
          >
            <Minimize2 size={20} />
          </button>
          <button 
            onClick={() => setShowShareModal(true)}
            className="p-2 rounded-xl hover:bg-white/5 text-white/50 transition-all flex items-center gap-2"
            title="Share Session"
          >
            <Share2 size={20} />
            <span className="text-xs font-bold hidden sm:inline">Share</span>
          </button>
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-xl transition-all ${showSidebar ? 'bg-primary text-white' : 'hover:bg-white/5 text-white/50'}`}
          >
            <ChatIcon size={20} />
          </button>
          {canManage && (
            <button 
              onClick={() => setShowEndSessionConfirm(true)}
              className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-all text-xs"
            >
              End Session
            </button>
          )}
          <button 
            onClick={handleLeave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/50 font-bold hover:bg-white/10 transition-all"
          >
            <LogOut size={18} /> Leave
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-black flex flex-col">
          <LayoutContextProvider>
              <AudioActivationGate 
                audioNeedsActivation={audioNeedsActivation} 
                setAudioNeedsActivation={setAudioNeedsActivation} 
              />
              <div className="flex-1 relative overflow-hidden">
                <SessionLayout 
                  hostId={event?.hostId} 
                  manualPinnedTrack={manualPinnedTrack}
                  onPin={(identity, source) => setManualPinnedTrack({ identity, source })}
                />
              </div>
              
              {/* Notifications Overlay */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                  {notifications.map(n => (
                    <motion.div
                      key={n.id}
                      initial={{ y: -20, opacity: 0, scale: 0.9 }}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      exit={{ y: -20, opacity: 0, scale: 0.9 }}
                      className={`px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 ${
                        n.type === 'hand' 
                          ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-500' 
                          : 'bg-white/10 border-white/10 text-white'
                      }`}
                    >
                      {n.type === 'hand' ? <Hand size={18} fill="currentColor" /> : <Shield size={18} />}
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
              
              {/* Custom Controls Overlay - Ensure it's always visible at the bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-center z-50 pointer-events-none">
                <div className="pointer-events-auto">
                  <CustomControlBar />
                </div>
              </div>
              <RoomAudioRenderer />
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
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex flex-col border-l border-white/5 bg-[#0a0a0a]"
            >
              {/* Tabs */}
              <div className="flex border-b border-white/5">
                <button 
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                    activeTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-white/30 hover:text-white/60'
                  }`}
                >
                  Chat
                </button>
                <button 
                  onClick={() => setActiveTab('polls')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                    activeTab === 'polls' ? 'border-primary text-primary' : 'border-transparent text-white/30 hover:text-white/60'
                  }`}
                >
                  Polls
                </button>
                <button 
                  onClick={() => setActiveTab('qa')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                    activeTab === 'qa' ? 'border-primary text-primary' : 'border-transparent text-white/30 hover:text-white/60'
                  }`}
                >
                  Q&A
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === 'chat' && <LiveChat eventId={eventId!} />}
                {activeTab === 'polls' && <LivePolls eventId={eventId!} isHost={canManage} />}
                {activeTab === 'qa' && <LiveQA eventId={eventId!} isHost={canManage} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmModal 
          isOpen={showEndSessionConfirm}
          onClose={() => setShowEndSessionConfirm(false)}
          onConfirm={async () => {
            setEnding(true);
            try {
              await updateDoc(doc(db, 'events', eventId!), { status: 'ended' });
              await setDoc(doc(db, 'eventSessions', eventId!), { 
                status: 'ended', 
                endTime: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }, { merge: true });
              endSession();
              navigate(`/events/${eventId}`);
            } catch (error) {
              console.error("Error ending session:", error);
            } finally {
              setEnding(false);
            }
          }}
          title="End Session"
          message="Are you sure you want to end this session for everyone? This action cannot be undone."
          confirmText="End Session"
          loading={ending}
        />
      </div>
    </div>
  );
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

function SessionLayout({ 
  hostId, 
  manualPinnedTrack, 
  onPin 
}: { 
  hostId?: string; 
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
  const pinnedTrack = manualTrack || screenShareTrack || hostTrack || cameraTracks[0];
  
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

function CustomControlBar() {
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

      <div className="flex items-center gap-2 px-6 py-3 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-1">
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
            title="Share Screen"
          >
            <MonitorUp size={20} />
          </button>
        </div>
        
        <div className="w-px h-8 bg-white/10 mx-2" />

        <div className="flex items-center gap-1">
          <button
            onClick={toggleHand}
            className={`p-3 rounded-2xl transition-all ${
              isHandRaised ? 'bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'bg-white/5 hover:bg-white/10 text-white/70'
            }`}
            title="Raise Hand"
          >
            <Hand size={20} fill={isHandRaised ? 'currentColor' : 'none'} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowReactions(!showReactions)}
              className={`p-3 rounded-2xl transition-all ${
                showReactions ? 'bg-primary text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]' : 'bg-white/5 hover:bg-white/10 text-white/70'
              }`}
              title="Reactions"
            >
              <Smile size={20} />
            </button>

            <AnimatePresence>
              {showReactions && (
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

        <DisconnectButton className="!bg-red-500/20 !text-red-500 !rounded-2xl !px-6 !py-3 !font-bold hover:!bg-red-500 hover:!text-white !border border-red-500/30 !transition-all">
          Leave
        </DisconnectButton>
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
        relatedId: eventId
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
