import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video as VideoIcon, 
  VideoOff, 
  Minimize2, 
  Maximize2,
  Volume2,
  VolumeX,
  Monitor,
  MessageSquare,
  MoreVertical
} from 'lucide-react';
import { useCall, CallSession } from '../../contexts/CallContext';
import { 
  LiveKitRoom, 
  VideoConference, 
  useTracks, 
  VideoTrack, 
  ParticipantTile, 
  ControlBar, 
  useLocalParticipant, 
  RoomContext,
  RoomAudioRenderer
} from '@livekit/components-react';
import { Track, Participant } from 'livekit-client';
import { auth } from '../../firebase';

interface ParticipantMetadata {
  avatar?: string;
}

function getParticipantMetadata(participant: Participant): ParticipantMetadata {
  try {
    return participant.metadata ? JSON.parse(participant.metadata) : {};
  } catch {
    return {};
  }
}

export default function CallInterface() {
  const { activeCall, incomingCall, acceptCall, declineCall, endCall, isMinimized, setIsMinimized } = useCall();
  const [token, setToken] = useState<string | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const dialtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (incomingCall) {
      ringtoneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
      ringtoneRef.current.loop = true;
      ringtoneRef.current.play().catch(console.error);
    } else {
      ringtoneRef.current?.pause();
      ringtoneRef.current = null;
    }
    return () => ringtoneRef.current?.pause();
  }, [incomingCall?.id]);

  useEffect(() => {
    if (activeCall?.status === 'ringing' && activeCall.callerId === auth.currentUser?.uid) {
      dialtoneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1358/1358-preview.mp3');
      dialtoneRef.current.loop = true;
      dialtoneRef.current.play().catch(console.error);
    } else {
      dialtoneRef.current?.pause();
      dialtoneRef.current = null;
    }
    return () => dialtoneRef.current?.pause();
  }, [activeCall?.id, activeCall?.status]);

  useEffect(() => {
    if (activeCall && activeCall.status === 'active') {
      fetchToken();
    } else {
      setToken(null);
    }
  }, [activeCall?.id, activeCall?.status]);

  const fetchToken = async () => {
    if (!activeCall || !auth.currentUser) return;
    
    try {
      const response = await fetch('/api/livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: activeCall.id,
          userId: auth.currentUser.uid,
          username: auth.currentUser.displayName || 'User',
          photoURL: auth.currentUser.photoURL || ''
        })
      });
      const data = await response.json();
      setToken(data.token);
    } catch (err) {
      console.error('Failed to get call token:', err);
    }
  };

  if (!activeCall && !incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      <AnimatePresence>
        {incomingCall && (
          <IncomingCallModal 
            call={incomingCall} 
            onAccept={acceptCall} 
            onDecline={declineCall} 
          />
        )}

        {activeCall && (
          <ActiveCallOverlay 
            call={activeCall}
            token={token}
            isMinimized={isMinimized}
            onEnd={endCall}
            onToggleMinimize={() => setIsMinimized(!isMinimized)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function IncomingCallModal({ call, onAccept, onDecline }: { call: CallSession, onAccept: () => void, onDecline: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-auto bg-white/80 dark:bg-[#1A1F2E]/80 backdrop-blur-2xl border border-black/10 dark:border-white/10 p-6 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] flex items-center gap-8 min-w-[450px] z-[120]"
    >
      <div className="flex items-center gap-5">
        <div className="relative">
          <div className="w-16 h-16 rounded-3xl overflow-hidden shadow-xl ring-2 ring-primary/20">
            <img src={(call.callerPhoto && call.callerPhoto.trim() !== '') ? call.callerPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.callerId}`} className="w-full h-full object-cover" alt="" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-[#1A1F2E] rounded-full animate-pulse" />
        </div>
        <div>
          <h3 className="font-black text-xl text-black dark:text-white leading-tight">{call.callerName}</h3>
          <p className="text-xs font-bold text-primary animate-pulse tracking-widest uppercase mt-0.5">Incoming {call.media} Call</p>
        </div>
      </div>

      <div className="flex gap-4 ml-auto">
        <button 
          onClick={onDecline}
          className="w-14 h-14 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center transition-all border border-rose-500/20"
        >
          <PhoneOff size={24} />
        </button>
        <button 
          onClick={onAccept}
          className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-neon animate-bounce"
        >
          {call.media === 'video' ? <VideoIcon size={24} /> : <Phone size={24} />}
        </button>
      </div>
    </motion.div>
  );
}

function ActiveCallOverlay({ call, token, isMinimized, onEnd, onToggleMinimize }: { call: CallSession, token: string | null, isMinimized: boolean, onEnd: () => void, onToggleMinimize: () => void }) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const otherParticipantId = Object.keys(call.participants).find(id => id !== auth.currentUser?.uid) || Object.keys(call.participants)[0];
  const otherParticipant = call.participants[otherParticipantId];
  
  const displayPhoto = call.callerId === auth.currentUser?.uid 
    ? (otherParticipant?.photoURL && otherParticipant.photoURL.trim() !== '' ? otherParticipant.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherParticipantId}`)
    : (call.callerPhoto && call.callerPhoto.trim() !== '' ? call.callerPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${call.callerId}`);
  const displayName = call.callerId === auth.currentUser?.uid
    ? (otherParticipant?.displayName || 'Recipient')
    : call.callerName;

  if (isMinimized) {
    if (token) {
      return (
        <LiveKitRoom
          video={call.media === 'video'}
          audio={true}
          token={token}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'wss://livekit.io'}
          onDisconnected={onEnd}
        >
          <MinimizedCallUI 
            call={call} 
            displayPhoto={displayPhoto} 
            displayName={displayName} 
            onEnd={onEnd} 
            onMaximize={onToggleMinimize} 
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      );
    }
    return (
      <motion.div 
        layoutId="call-overlay"
        onClick={onToggleMinimize}
        className="absolute bottom-8 right-8 w-72 bg-[#1A1F2E] rounded-3xl border border-white/10 shadow-2xl pointer-events-auto flex flex-col overflow-hidden z-50 cursor-pointer"
      >
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 relative">
            <img src={displayPhoto} className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0 bg-primary/20 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">{displayName}</p>
            <p className="text-[10px] text-primary font-black uppercase tracking-widest animate-pulse">Ringing...</p>
          </div>
          <button onClick={onEnd} className="p-2 bg-rose-500 rounded-lg text-white hover:bg-rose-600 transition-colors">
            <PhoneOff size={14} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      layoutId="call-overlay"
      className={`${isFullScreen ? 'fixed inset-0' : 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-4xl h-[80vh]'} bg-[#0F1219] dark:border dark:border-white/5 rounded-[2.5rem] shadow-[0_64px_128px_-12px_rgba(0,0,0,0.8)] z-[101] pointer-events-auto flex flex-col overflow-hidden transition-all duration-500`}
    >
      {call.status === 'ringing' ? (
        <RingingUI 
          call={call} 
          displayPhoto={displayPhoto} 
          displayName={displayName} 
          onEnd={onEnd} 
        />
      ) : token ? (
        <LiveKitRoom
          video={call.media === 'video'}
          audio={true}
          token={token}
          serverUrl={import.meta.env.VITE_LIVEKIT_URL || 'wss://livekit.io'}
          className="flex-1 flex flex-col relative"
          onDisconnected={onEnd}
        >
          <CallContent 
            call={call} 
            displayPhoto={displayPhoto}
            displayName={displayName}
            onEnd={onEnd} 
            onMinimize={onToggleMinimize} 
            isFullScreen={isFullScreen}
            setIsFullScreen={setIsFullScreen}
          />
          <RoomAudioRenderer />
        </LiveKitRoom>
      ) : (
        <div className="flex-1 flex items-center justify-center text-white">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </motion.div>
  );
}

function MinimizedCallUI({ 
  call, 
  displayPhoto, 
  displayName, 
  onEnd, 
  onMaximize 
}: { 
  call: CallSession, 
  displayPhoto: string, 
  displayName: string, 
  onEnd: () => void, 
  onMaximize: () => void 
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  return (
    <motion.div 
      layoutId="call-overlay"
      className="absolute bottom-8 right-8 w-72 bg-[#1A1F2E] rounded-3xl border border-white/10 shadow-2xl pointer-events-auto flex flex-col overflow-hidden z-50"
    >
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
          <img src={displayPhoto} className="w-full h-full object-cover" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{displayName}</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-[10px] text-primary font-black uppercase tracking-widest">{call.media} Active</p>
          </div>
        </div>
        <button 
          onClick={onMaximize}
          className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="px-4 pb-4 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <button 
            onClick={() => localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isMicrophoneEnabled ? 'bg-white/5 text-white/60 hover:text-white' : 'bg-rose-500 text-white'}`}
          >
            {isMicrophoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          </button>
          {call.media === 'video' && (
            <button 
              onClick={() => localParticipant?.setCameraEnabled(!isCameraEnabled)}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isCameraEnabled ? 'bg-white/5 text-white/60 hover:text-white' : 'bg-rose-500 text-white'}`}
            >
              {isCameraEnabled ? <VideoIcon size={16} /> : <VideoOff size={16} />}
            </button>
          )}
        </div>
        <button 
          onClick={onEnd}
          className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </motion.div>
  );
}

function RingingUI({ call, displayPhoto, displayName, onEnd }: { call: CallSession, displayPhoto: string, displayName: string, onEnd: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-white relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
         <img src={displayPhoto} className="w-full h-full object-cover blur-3xl scale-110" alt="" />
      </div>
      
      <motion.div 
        animate={{ scale: [1, 1.05, 1]}} 
        transition={{ duration: 2, repeat: Infinity }}
        className="w-48 h-48 rounded-[3rem] overflow-hidden shadow-2xl relative z-10"
      >
        <img src={displayPhoto} className="w-full h-full object-cover" alt="" />
      </motion.div>
      
      <div className="text-center mt-12 relative z-10">
        <h2 className="text-4xl font-black mb-3">{displayName}</h2>
        <div className="flex items-center justify-center gap-3">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div 
                key={i} 
                animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-primary" 
              />
            ))}
          </div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary/80">
            {call.callerId === auth.currentUser?.uid ? 'Calling...' : 'In-bound call'}
          </p>
        </div>
      </div>

      <div className="mt-24 relative z-10">
        <button 
          onClick={onEnd}
          className="w-20 h-20 rounded-full bg-rose-500 text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_20px_40px_rgba(244,63,94,0.3)]"
        >
          <PhoneOff size={32} />
        </button>
      </div>
    </div>
  );
}

function CallContent({ 
  call, 
  displayPhoto, 
  displayName, 
  onEnd, 
  onMinimize, 
  isFullScreen, 
  setIsFullScreen 
}: { 
  call: CallSession, 
  displayPhoto: string,
  displayName: string,
  onEnd: () => void, 
  onMinimize: () => void,
  isFullScreen: boolean,
  setIsFullScreen: (val: boolean) => void
}) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  // Separate local and remote tracks
  const remoteTracks = tracks.filter(t => !t.participant.isLocal);
  const localTracks = tracks.filter(t => t.participant.isLocal);

  return (
    <>
      <div className="p-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl px-5 py-2.5 rounded-2xl border border-white/10">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border border-white/10">
             <img src={displayPhoto} className="w-full h-full object-cover" alt="" />
          </div>
          <div>
            <p className="text-sm font-black text-white leading-tight">{displayName}</p>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <CallTimer startTime={call.createdAt} />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-3 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button 
            onClick={onMinimize}
            className="p-3 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {call.media === 'video' ? (
          <div className="h-full w-full relative">
            {/* Main Stage (Remote Participants) */}
            <div className="h-full w-full p-8 grid grid-cols-1 gap-6 pb-32">
              {remoteTracks.length > 0 ? (
                remoteTracks.map((track) => (
                  <div key={`${track.participant.identity}-${track.source}`} className="relative rounded-3xl overflow-hidden bg-white/5 border border-white/5 group h-full w-full">
                    <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                    
                    {/* Overlay for when remote video is off */}
                    {!track.participant.isCameraEnabled && (
                      <div className="absolute inset-0 bg-[#0F1219] flex flex-col items-center justify-center z-10">
                         <div className="absolute inset-0 overflow-hidden opacity-5">
                            <img 
                              src={(getParticipantMetadata(track.participant).avatar && getParticipantMetadata(track.participant).avatar?.trim() !== '') ? getParticipantMetadata(track.participant).avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${track.participant.identity}`} 
                              className="w-full h-full object-cover blur-3xl scale-110" 
                              alt="" 
                            />
                         </div>
                         <motion.div 
                           initial={{ scale: 0.9, opacity: 0 }}
                           animate={{ scale: 1, opacity: 1 }}
                           className="relative"
                         >
                           <div className="w-48 h-48 rounded-[4rem] overflow-hidden shadow-2xl border-2 border-white/10 relative z-20">
                              <img 
                                src={(getParticipantMetadata(track.participant).avatar && getParticipantMetadata(track.participant).avatar?.trim() !== '') ? getParticipantMetadata(track.participant).avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${track.participant.identity}`} 
                                className="w-full h-full object-cover" 
                                alt="" 
                              />
                           </div>
                           <div className="mt-6 text-center">
                              <p className="text-xl font-black text-white">{track.participant.name || 'Participant'}</p>
                              <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Camera Off</p>
                           </div>
                         </motion.div>
                      </div>
                    )}
                    
                    {/* Name Label */}
                    <div className="absolute bottom-6 left-6 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 z-20">
                       <p className="text-xs font-black text-white">{track.participant.name || 'Participant'}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center">
                   <div className="w-48 h-48 rounded-[4rem] overflow-hidden shadow-2xl border-2 border-primary/20 mb-8">
                      <img src={displayPhoto} className="w-full h-full object-cover" alt="" />
                   </div>
                   <h2 className="text-2xl font-black text-white mb-2">{displayName}</h2>
                   <p className="text-xs text-primary font-black uppercase tracking-widest animate-pulse">Waiting for participant...</p>
                </div>
              )}
            </div>

            {/* PIP (Local Participant) */}
            <motion.div 
              drag
              dragConstraints={{ left: -500, right: 0, top: 0, bottom: 500 }}
              className="absolute top-8 right-8 w-48 aspect-[3/4] bg-[#1A1F2E] rounded-3xl overflow-hidden border border-white/10 shadow-2xl z-30 group cursor-grab active:cursor-grabbing"
            >
              {localTracks.find(t => t.source === Track.Source.Camera) ? (
                <>
                  <VideoTrack 
                    trackRef={localTracks.find(t => t.source === Track.Source.Camera)!} 
                    className={`w-full h-full object-cover ${!isCameraEnabled ? 'hidden' : ''}`} 
                  />
                  {!isCameraEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0F1219]">
                       <img 
                        src={(auth.currentUser?.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`} 
                        className="w-16 h-16 rounded-2xl object-cover border border-white/10" 
                        alt="" 
                       />
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                     <p className="text-[10px] font-black text-white">You</p>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                   <VideoOff size={24} className="text-white/20" />
                </div>
              )}
            </motion.div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center pb-32">
            <div className="text-center">
              <motion.div 
                animate={{ scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="w-64 h-64 rounded-[4rem] overflow-hidden shadow-2xl border-2 border-primary/20 mb-8 mx-auto"
              >
                <img src={displayPhoto} className="w-full h-full object-cover" alt="" />
              </motion.div>
              <h2 className="text-4xl font-black text-white mb-2">{displayName}</h2>
              <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-1.5 rounded-full">
                 <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                 <p className="text-primary text-[10px] font-black uppercase tracking-widest">Ongoing Call</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-4 bg-black/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl z-20">
        <button 
          onClick={() => localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
          className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all ${isMicrophoneEnabled ? 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10' : 'bg-rose-500 text-white shadow-neon'}`}
        >
          {isMicrophoneEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        {call.media === 'video' && (
          <button 
            onClick={() => localParticipant?.setCameraEnabled(!isCameraEnabled)}
            className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all ${isCameraEnabled ? 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10' : 'bg-rose-500 text-white shadow-neon'}`}
          >
            {isCameraEnabled ? <VideoIcon size={24} /> : <VideoOff size={24} />}
          </button>
        )}

        <button 
          onClick={onEnd}
          className="w-20 h-20 rounded-[2rem] bg-rose-500 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_rgba(244,63,94,0.3)]"
        >
          <PhoneOff size={32} />
        </button>

        <button className="w-16 h-16 rounded-[1.5rem] bg-white/5 text-white/60 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all">
          <MessageSquare size={24} />
        </button>

        <button className="w-16 h-16 rounded-[1.5rem] bg-white/5 text-white/60 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all">
           <Volume2 size={24} />
        </button>
      </div>
    </>
  );
}

function CallTimer({ startTime }: { startTime: any }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = startTime?.toDate ? startTime.toDate().getTime() : (typeof startTime === 'number' ? startTime : new Date().getTime());
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return <p className="text-[10px] text-white/40 font-mono font-bold tracking-wider">{formatTime(seconds)}</p>;
}
