import { useState, useCallback, useMemo } from 'react';
import { 
  Mic, MicOff, PhoneOff, Users, Volume2, UserPlus, Shield, 
  Hand, MessageSquare, Plus, Smile, MoreVertical 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LiveKitRoom, 
  useParticipants, 
  useLocalParticipant,
  ParticipantTile,
  ParticipantContext,
  useParticipantContext,
  useTrackRefContext,
  VideoTrack,
  AudioTrack,
  useTracks,
  GridLayout,
  ControlBar,
  useDataChannel,
  Chat
} from '@livekit/components-react';
import { 
  Track, 
  Participant, 
  LocalParticipant, 
  RemoteParticipant,
  RoomEvent,
  DataPacket_Kind
} from 'livekit-client';
import { auth, db } from '../firebase';
import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';

interface VoiceRoomProps {
  communityId: string;
  channelId: string;
  token: string;
  serverUrl: string;
  mode: 'open' | 'stage' | 'private';
  onLeave: () => void;
}

export default function VoiceRoom({ communityId, channelId, token, serverUrl, mode, onLeave }: VoiceRoomProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      <VoiceRoomContent 
        communityId={communityId} 
        channelId={channelId} 
        mode={mode} 
        onLeave={onLeave} 
      />
    </div>
  );
}

function VoiceRoomContent({ communityId, channelId, mode, onLeave }: any) {
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const [showChat, setShowChat] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [reactions, setReactions] = useState<{id: string, emoji: string, participantId: string}[]>([]);

  // Real-time reactions logic using LiveKit DataChannel
  const { send } = useDataChannel('reactions', (msg) => {
    const payload = JSON.parse(new TextDecoder().decode(msg.payload));
    if (payload.type === 'reaction') {
       const newReaction = {
         id: Math.random().toString(36).substr(2, 9),
         emoji: payload.emoji,
         participantId: msg.from?.identity || 'unknown'
       };
       setReactions(prev => [...prev, newReaction]);
       setTimeout(() => {
         setReactions(prev => prev.filter(r => r.id !== newReaction.id));
       }, 3000);
    }
  });

  const sendReaction = (emoji: string) => {
    const payload = JSON.stringify({ type: 'reaction', emoji });
    send(new TextEncoder().encode(payload), { reliable: true });
    
    // Also show locally
    const newReaction = {
      id: Math.random().toString(36).substr(2, 9),
      emoji,
      participantId: localParticipant?.identity || 'me'
    };
    setReactions(prev => [...prev, newReaction]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 3000);
  };

  const toggleHand = async () => {
    const newState = !handRaised;
    setHandRaised(newState);
    
    // Sync with Firebase for stage management visual persistence
    const participantRef = doc(db, 'communities', communityId, 'channels', channelId, 'voiceParticipants', localParticipant.identity);
    await updateDoc(participantRef, { handRaised: newState });
  };

  const isStageHost = mode === 'stage' && participants.find(p => p.identity === localParticipant.identity)?.permissions?.canPublish;

  return (
    <div className="flex-1 flex flex-col relative h-full">
      {/* Participants View */}
      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide grid gap-4 md:gap-6 ${
          participants.length === 1 ? 'grid-cols-1' :
          participants.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
          participants.length <= 4 ? 'grid-cols-2' :
          'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        } items-center justify-center auto-rows-fr`}>
           <AnimatePresence>
            {participants.map((p) => (
              <CustomParticipantTile key={p.sid} participant={p} mode={mode} />
            ))}
          </AnimatePresence>
        </div>

        {/* Sidebar Chat (Discord style) */}
        <AnimatePresence>
          {showChat && (
            <motion.div 
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="w-80 border-l border-foreground/10 dark:border-white/5 bg-foreground/5 dark:bg-black/40 backdrop-blur-xl shrink-0"
            >
              <Chat className="h-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Reactions Board */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ y: 200, x: Math.random() * 200 - 100, opacity: 0, scale: 0.5 }}
              animate={{ y: -500, x: Math.random() * 400 - 200, opacity: 1, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3, ease: 'easeOut' }}
              className="absolute bottom-40 left-1/2 text-4xl"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modern Control Bar */}
      <div className="h-28 bg-gradient-to-t from-background via-background/80 to-transparent flex items-center justify-center gap-4 px-6 pb-6 pt-4 relative z-10">
        <div className="flex items-center gap-3 bg-foreground/5 dark:bg-white/5 backdrop-blur-2xl border border-foreground/10 dark:border-white/10 p-3 rounded-[2.5rem] shadow-2xl">
          <AudioToggle />
          
          {mode === 'stage' && (
            <button 
              onClick={toggleHand}
              className={`p-4 rounded-2xl transition-all ${handRaised ? 'bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,0.4)]' : 'bg-foreground/5 text-foreground/60 dark:bg-white/5 dark:text-white/60 hover:bg-foreground/10 dark:hover:bg-white/10'}`}
            >
              <Hand size={20} className={handRaised ? 'animate-bounce' : ''} />
            </button>
          )}

          <div className="w-px h-8 bg-foreground/10 dark:bg-white/10 mx-1" />

          <EmojiSelector onSelect={sendReaction} />

          <button 
            onClick={() => setShowChat(!showChat)}
            className={`p-4 rounded-2xl transition-all ${showChat ? 'bg-primary text-white shadow-neon' : 'bg-foreground/5 text-foreground/60 dark:bg-white/5 dark:text-white/60 hover:bg-foreground/10 dark:hover:bg-white/10'}`}
          >
            <MessageSquare size={20} />
          </button>

          <button 
            onClick={onLeave}
            className="p-4 bg-red-500 text-white rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-xl hover:rotate-12"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomParticipantTile({ participant, mode }: { participant: Participant, mode: string }) {
  const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
  const isSpeaking = participant.isSpeaking;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`relative w-full aspect-square md:aspect-video rounded-[2rem] overflow-hidden group transition-all duration-300 ${
        isSpeaking ? 'ring-4 ring-green-500 ring-offset-4 ring-offset-background' : 'ring-1 ring-foreground/10 dark:ring-white/10'
      }`}
    >
      <div className="absolute inset-0 bg-muted">
         <img 
            src={(metadata.avatar && metadata.avatar.trim() !== '') ? metadata.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${participant.identity}`} 
            className={`w-full h-full object-cover transition-all duration-700 ${isSpeaking ? 'scale-110' : 'grayscale-[20%]'}`}
            alt={participant.name}
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
      </div>

      <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-foreground dark:text-white drop-shadow-md">{participant.name || participant.identity}</span>
            {participant.identity === 'owner' && <Shield size={14} className="text-primary" />}
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40 dark:text-white/40">
            {participant.permissions?.canPublish ? 'Speaker' : 'Listener'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!participant.isMicrophoneEnabled && (
            <div className="p-2 bg-red-500/20 backdrop-blur-md rounded-xl text-red-500 border border-red-500/20">
              <MicOff size={16} />
            </div>
          )}
        </div>
      </div>

      {isSpeaking && (
        <div className="absolute top-6 right-6 flex gap-1.5 items-end h-6">
          <motion.div animate={{ height: [4, 16, 8, 20, 6] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 bg-green-500 rounded-full" />
          <motion.div animate={{ height: [8, 4, 16, 6, 12] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 bg-green-500 rounded-full" />
          <motion.div animate={{ height: [12, 8, 20, 4, 16] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1.5 bg-green-500 rounded-full" />
        </div>
      )}
    </motion.div>
  );
}

function AudioToggle() {
  const { localParticipant } = useLocalParticipant();
  const toggleMute = useCallback(() => {
    localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
  }, [localParticipant]);

  return (
    <button 
      onClick={toggleMute}
      className={`p-4 rounded-2xl transition-all ${
        !localParticipant.isMicrophoneEnabled 
          ? 'bg-red-500/20 text-red-500 border border-red-500/30' 
          : 'bg-foreground/10 text-foreground dark:bg-white/10 dark:text-white hover:bg-foreground/20 dark:hover:bg-white/20'
      }`}
    >
      {!localParticipant.isMicrophoneEnabled ? <MicOff size={24} /> : <Mic size={24} />}
    </button>
  );
}

function EmojiSelector({ onSelect }: { onSelect: (emoji: string) => void }) {
  const emojis = ['🔥', '🚀', '💯', '👏', '❤️', '😂', '🎉', '💡'];
  return (
    <div className="group relative">
      <button className="p-4 bg-foreground/5 text-foreground/60 dark:bg-white/5 dark:text-white/60 hover:bg-foreground/10 dark:hover:bg-white/10 rounded-2xl transition-all hover:text-foreground dark:hover:text-white">
        <Smile size={20} />
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-2 bg-background/60 dark:bg-black/60 backdrop-blur-2xl border border-foreground/10 dark:border-white/10 rounded-3xl grid grid-cols-4 gap-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all translate-y-2 group-hover:translate-y-0 active:scale-95">
        {emojis.map(e => (
          <button 
            key={e} 
            onClick={() => onSelect(e)}
            className="p-3 text-2xl hover:scale-125 transition-transform active:scale-90"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
