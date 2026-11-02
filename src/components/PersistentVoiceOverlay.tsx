import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, PhoneOff, Maximize2, Volume2, User } from 'lucide-react';
import { useVoice } from '../contexts/VoiceContext';
import { 
  LiveKitRoom, 
  useLocalParticipant,
  useParticipants,
  AudioTrack,
  useTracks
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import Avatar from './ui/Avatar';
import { auth, db } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface PersistentVoiceOverlayProps {
  onReturn: (communityId: string, channelId: string) => void;
}

export default function PersistentVoiceOverlay({ onReturn }: PersistentVoiceOverlayProps) {
  const { activeSession, leaveVoice } = useVoice();

  const handleLeave = async () => {
    if (activeSession && auth.currentUser) {
      try {
        await deleteDoc(doc(db, 'communities', activeSession.communityId, 'channels', activeSession.channelId, 'voiceParticipants', auth.currentUser.uid));
      } catch (e) {
        console.error('Failed to cleanup presence:', e);
      }
    }
    leaveVoice();
  };

  if (!activeSession) return null;

  return (
    <AnimatePresence>
      <OverlayContent session={activeSession} onReturn={onReturn} onLeave={handleLeave} />
    </AnimatePresence>
  );
}

function OverlayContent({ session, onReturn, onLeave }: any) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const avatarOf = (p: any) => { try { return JSON.parse(p.metadata || '{}').avatar || ''; } catch { return ''; } };

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="keep-dark fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-[90] flex items-center gap-2 p-2 pl-3 rounded-full bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-white cursor-grab active:cursor-grabbing"
    >
      <button onClick={() => onReturn(session.communityId, session.channelId)} className="flex items-center gap-2.5 min-w-0 text-left" title="Back to the room">
        <span className="relative flex -space-x-2">
          {participants.slice(0, 3).map(p => (
            <span key={p.identity} className="rounded-full ring-2 ring-neutral-900"><Avatar src={avatarOf(p)} seed={p.identity} size={28} /></span>
          ))}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-semibold truncate max-w-[140px]"><Volume2 size={13} className="text-green-400 shrink-0" />{session.channelName}</span>
          <span className="block text-xs text-white/60">{participants.length} in the room</span>
        </span>
      </button>
      <button
        onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        aria-label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        className={`ml-1 w-9 h-9 rounded-full flex items-center justify-center ${isMicrophoneEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-white'}`}
        style={isMicrophoneEnabled ? undefined : { color: '#111' }}
      >
        {isMicrophoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
      <button onClick={onLeave} aria-label="Leave room" className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center">
        <PhoneOff size={16} />
      </button>
    </motion.div>
  );
}
