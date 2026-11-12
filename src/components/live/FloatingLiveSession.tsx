import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveSession } from '../../contexts/LiveSessionContext';
import {
  VideoTrack, 
  useTracks, 
  useLocalParticipant, 
  useTrackToggle, 
  TrackRefContext,
  useTrackRefContext,
  useRoomContext
} from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Maximize2, 
  X, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Hand, 
  Smile,
  LogOut,
  Settings,
  ChevronUp,
  ChevronDown,
  ThumbsUp,
  Heart,
  Zap,
  PartyPopper,
  ExternalLink,
  ArrowUpRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth } from '../../firebase';
import { liveRoomPath } from '../../lib/eventLinks';
import { useDocumentPiP } from '../../hooks/useDocumentPiP';

export default function FloatingLiveSession() {
  const { session, expandSession, endSession, endSessionForEveryone } = useLiveSession();
  const navigate = useNavigate();
  const room = useRoomContext();

  const { PiPPortal } = useDocumentPiP({
    pipWindow: session.pipWindow,
    onExit: () => {
      // Handled by context pagehide listener
    }
  });

  const handleExpand = () => {
    expandSession();
    if (session.eventId) {
      navigate(liveRoomPath({ id: session.eventId }));
    }
  };

  const handleClose = async () => {
    const data: any = session.eventData;
    const uid = auth.currentUser?.uid;
    const canManage = !!uid && (
      data?.hostId === uid ||
      (Array.isArray(data?.coHostIds) && data.coHostIds.includes(uid))
    );

    if (!canManage) {
      endSession();
      return;
    }

    if (!window.confirm('End this session for everyone?')) return;
    const ended = await endSessionForEveryone(session.eventId || undefined);
    if (!ended) toast.error('Could not end the session. You are still live.');
  };

  if (!session.isActive || !session.token || !session.isMinimized) return null;

  // Document Picture-in-Picture where the browser supports it.
  if (session.pipWindow) {
    return (
      <PiPPortal>
        <div className="w-full h-screen bg-black overflow-hidden relative flex flex-col group">
          <MiniPlayerContent 
            title={session.eventTitle} 
            onExpand={handleExpand}
            onClose={handleClose}
            onMinimize={handleExpand} 
            isPiPActive={true}
            isSmall={false}
          />
        </div>
      </PiPPortal>
    );
  }

  // In-app fallback: a draggable-looking mini player that keeps the room alive
  // on every browser, including mobile where Document PiP is unavailable.
  return (
    <div
      className="fixed bottom-24 right-4 z-[80] w-[min(86vw,340px)] aspect-video overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)] group"
      role="complementary"
      aria-label="Minimized live session"
    >
      <MiniPlayerContent 
        title={session.eventTitle} 
        onExpand={handleExpand}
        onClose={handleClose}
        onMinimize={handleExpand} 
        isPiPActive={false}
        isSmall
      />
    </div>
  );
}

function MiniPlayerContent({ 
  title, 
  onExpand, 
  onClose,
  onMinimize,
  isPiPActive,
  isSmall 
}: { 
  title?: string, 
  onExpand: () => void, 
  onClose: () => void,
  onMinimize: () => void,
  isPiPActive: boolean,
  isSmall: boolean
}) {
  const room = useRoomContext();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: true });
  const { localParticipant } = useLocalParticipant();
  
  // Find host or screen share track
  const activeTrack = tracks.find(t => t.source === Track.Source.ScreenShare) || tracks[0];
  const activeParticipant = activeTrack?.participant;
  
  const { toggle: toggleMic, enabled: isMicEnabled } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCam, enabled: isCamEnabled } = useTrackToggle({ source: Track.Source.Camera });

  const [showSettings, setShowSettings] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeReactions, setActiveReactions] = useState<{ id: number; emoji: string; x: number; size: number }[]>([]);

  const reactions = [
    { icon: ThumbsUp, emoji: '👍' },
    { icon: Heart, emoji: '❤️' },
    { icon: Smile, emoji: '😊' },
    { icon: Zap, emoji: '⚡' },
    { icon: PartyPopper, emoji: '🎉' },
  ];

  const triggerReaction = (emoji: string) => {
    const id = Date.now() + Math.random();
    setActiveReactions(prev => [...prev.slice(-10), { id, emoji, x: (Math.random() - 0.5) * 100, size: 20 + Math.random() * 20 }]);
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== id));
    }, 3000);
  };

  const sendReaction = async (emoji: string) => {
    triggerReaction(emoji);
    setShowReactions(false);
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify({ type: 'reaction', emoji }));
      await localParticipant.publishData(data, { reliable: false });
    } catch (e) {
      console.error('Failed to broadcast reaction', e);
    }
  };

  const toggleHand = async () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    try {
      const currentMeta = localParticipant.metadata ? JSON.parse(localParticipant.metadata) : {};
      await localParticipant.setMetadata(JSON.stringify({ ...currentMeta, handRaised: newState }));
    } catch (e) {
      console.error('Failed to set metadata', e);
    }
  };

  useEffect(() => {
    const handleData = (payload: Uint8Array) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));
        if (data.type === 'reaction') triggerReaction(data.emoji);
      } catch (e) {}
    };
    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room]);

  return (
    <div className="relative w-full h-full select-none bg-black">
      {activeTrack ? (
        <TrackRefContext.Provider value={activeTrack}>
           <VideoTrack trackRef={activeTrack} className="w-full h-full object-cover" disablePictureInPicture playsInline />
        </TrackRefContext.Provider>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden">
               <Video size={24} className="text-primary/40" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-900 rounded-full flex items-center justify-center border border-white/10">
              <MicOff size={10} className="text-red-500" />
            </div>
          </div>
          <p className="mt-3 text-[10px] text-white/40 uppercase tracking-widest font-black">
            {activeParticipant ? (activeParticipant.name || activeParticipant.identity) : 'Host Session'}
          </p>
        </div>
      )}

      {/* Floating Reactions Area */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex justify-center">
        <AnimatePresence>
          {activeReactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ y: 200, opacity: 0, scale: 0.5 }}
              animate={{ y: -200, opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.5, ease: "easeOut" }}
              className="absolute bottom-10"
              style={{ fontSize: `${r.size}px`, left: `calc(50% + ${r.x}px)` }}
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl overflow-hidden"
            >
               <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-3"><Settings className="text-primary" size={20} /> Settings</h3>
                  </div>

                  <div className="space-y-3">
                    {[
                      { id: 'chat', label: 'Allow Member Chat', enabled: true },
                      { id: 'requests', label: 'Stage Requests', enabled: true },
                    ].map((config) => (
                      <div key={config.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl">
                        <div>
                           <p className="text-xs font-bold text-white">{config.label}</p>
                        </div>
                        <div className={`w-8 h-4 rounded-full p-1 relative cursor-pointer ${config.enabled ? 'bg-primary' : 'bg-white/10'}`}>
                           <div className={`w-2 h-2 bg-white rounded-full ${config.enabled ? 'ml-auto' : ''}`} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => setShowSettings(false)}
                    className="w-full py-3 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all"
                  >
                    Done
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Control Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 flex flex-col justify-between p-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-white bg-black/60 px-2 py-1 rounded-lg backdrop-blur-md border border-white/5 truncate max-w-[60%]">
            {title || 'Meeting Session'}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={onExpand} className="p-2 hover:bg-white/10 rounded-xl text-white/70 transition-colors backdrop-blur-md" title="Open Full Session">
              <ExternalLink size={16} />
            </button>
            <button onClick={onMinimize} className="p-2 hover:bg-white/10 rounded-xl text-white/70 transition-colors backdrop-blur-md" title="Back to Tab">
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <AnimatePresence>
            {showReactions && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="flex items-center gap-1 bg-black/80 backdrop-blur-xl p-1.5 rounded-2xl border border-white/10 mb-2"
              >
                {reactions.map(r => (
                  <button
                    key={r.emoji}
                    onClick={() => sendReaction(r.emoji)}
                    className="p-1.5 hover:bg-white/10 rounded-xl transition-all text-lg"
                  >
                    {r.emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-center gap-1.5">
            <button 
              onClick={() => toggleMic()}
              className={`p-2 rounded-full transition-all flex items-center justify-center ${isMicEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white'}`}
            >
              {isMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
            </button>
            <button 
              onClick={() => toggleCam()}
              className={`p-2 rounded-full transition-all flex items-center justify-center ${isCamEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white'}`}
            >
              {isCamEnabled ? <Video size={14} /> : <VideoOff size={14} />}
            </button>
            <button 
              onClick={toggleHand}
              className={`p-2 rounded-full transition-all flex items-center justify-center ${isHandRaised ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              <Hand size={14} fill={isHandRaised ? "currentColor" : "none"} />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all ml-1"
              title="Stream Settings"
            >
              <Settings size={14} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-full bg-red-600/80 text-white hover:bg-red-600 transition-all ml-1"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
