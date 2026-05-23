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
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }]);

  // We only show the overlay if we are NOT on the voice channel page
  // The logic for "if currently viewing" will be handled by the parent App state
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed bottom-6 right-6 z-[9999] bg-[#0A0A0A]/90 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-4 shadow-2xl w-72 flex flex-col gap-4 overflow-hidden"
    >
      <div className="flex items-center justify-between">
        <div 
          onClick={() => onReturn(session.communityId, session.channelId)}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 group-hover:scale-110 transition-transform">
            <Volume2 size={20} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black text-white truncate">{session.channelName}</span>
            <div className="flex items-center gap-1.5 overflow-hidden">
               <div className="flex -space-x-1">
                 {participants.slice(0, 3).map(p => (
                   <img 
                    key={p.identity} 
                    src={p.metadata ? JSON.parse(p.metadata).avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.identity}`}
                    className="w-4 h-4 rounded-full border border-black"
                    alt=""
                   />
                 ))}
               </div>
               <span className="text-[10px] text-white/40 font-bold truncate">
                 {participants.length} connected
               </span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => onReturn(session.communityId, session.channelId)}
          className="p-2 text-white/40 hover:text-white transition-colors"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="h-px bg-white/5" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
            className={`p-3 rounded-xl transition-all ${
              !localParticipant.isMicrophoneEnabled 
                ? 'bg-red-500/20 text-red-500' 
                : 'bg-white/5 text-white hover:bg-white/10'
            }`}
          >
            {localParticipant.isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          </button>
          
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-white/20 font-black">Audio Status</span>
            <span className={`text-[10px] font-bold ${localParticipant.isMicrophoneEnabled ? 'text-green-500' : 'text-red-500'}`}>
              {localParticipant.isMicrophoneEnabled ? 'Voice Active' : 'Muted'}
            </span>
          </div>
        </div>

        <button 
          onClick={onLeave}
          className="p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors shadow-lg active:scale-95"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </motion.div>
  );
}
