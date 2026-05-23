import { useState } from 'react';
import { Volume2, Loader2, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { CommunityChannel } from '../types/community';
import { auth, db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import VoiceRoom from './VoiceRoom';
import { toast } from 'react-hot-toast';
import { useVoice } from '../contexts/VoiceContext';

interface VoiceChannelViewProps {
  communityId: string;
  channel: CommunityChannel;
  currentUserProfile: any;
  isAdmin: boolean;
  myPermissions?: string[];
}

export default function VoiceChannelView({ 
  communityId, 
  channel, 
  currentUserProfile, 
  isAdmin,
  myPermissions = []
}: VoiceChannelViewProps) {
  const { activeSession, joinVoice, leaveVoice } = useVoice();
  const [loading, setLoading] = useState(false);

  const isCurrentVoiceActive = activeSession?.channelId === channel.id;
  const serverUrl = import.meta.env.VITE_LIVEKIT_URL;
  const canVoice = isAdmin || myPermissions.includes('start_voice');
  const isLocked = (channel as any).isLocked && !isAdmin;

  const handleJoin = async () => {
    if (!auth.currentUser) {
      toast.error('You must be signed in to join voice channels');
      return;
    }

    if (isLocked || !canVoice) {
      toast.error(isLocked ? 'This voice channel is locked.' : 'You don\'t have permission to join voice channels.');
      return;
    }

    if (!currentUserProfile) {
      toast.error('You must join this community to enter the voice channel');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: channel.id,
          userId: auth.currentUser?.uid,
          username: currentUserProfile.username || currentUserProfile.displayName,
          photoURL: currentUserProfile.profileImage || currentUserProfile.photoURL
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      // Register presence in Firestore
      await setDoc(doc(db, 'communities', communityId, 'channels', channel.id, 'voiceParticipants', auth.currentUser!.uid), {
        userId: auth.currentUser!.uid,
        userName: currentUserProfile.username || currentUserProfile.displayName,
        userPhoto: currentUserProfile.profileImage || currentUserProfile.photoURL,
        role: 'member',
        joinedAt: new Date().toISOString(),
        isMuted: false,
        handRaised: false
      });

      joinVoice({
        communityId,
        channelId: channel.id,
        channelName: channel.name,
        token: data.token,
        serverUrl,
        mode: (channel.voiceConfig?.mode as any) || 'open'
      });
    } catch (error: any) {
      console.error('Failed to join voice:', error);
      toast.error(error.message || 'Failed to join voice channel');
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = async () => {
    try {
      if (auth.currentUser) {
        await deleteDoc(doc(db, 'communities', communityId, 'channels', channel.id, 'voiceParticipants', auth.currentUser.uid));
      }
    } catch (error) {
      console.error('Error cleaning up presence:', error);
    }
    leaveVoice();
  };

  if (isCurrentVoiceActive && activeSession?.token && serverUrl) {
    return (
      <VoiceRoom 
        communityId={communityId}
        channelId={channel.id}
        token={activeSession.token}
        serverUrl={serverUrl}
        mode={activeSession.mode}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background p-8 text-center h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full p-8 rounded-[3rem] bg-foreground/5 border border-foreground/10 dark:bg-white/5 dark:border-white/10 backdrop-blur-3xl shadow-2xl space-y-6"
      >
        <div className="w-20 h-20 rounded-[2rem] bg-green-500/20 text-green-500 flex items-center justify-center mx-auto neon-glow">
          <Volume2 size={40} />
        </div>
        
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-foreground">{channel.name}</h2>
          <p className="text-foreground/40 text-sm leading-relaxed">
            {channel.description || 'Drop in and chat with other members of the community in real-time.'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            disabled={loading || isLocked || !canVoice}
            onClick={handleJoin}
            className={`w-full py-2.5 font-bold rounded-xl shadow-neon hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 text-sm ${
              isLocked || !canVoice ? 'bg-foreground/10 dark:bg-zinc-800 text-foreground/30 dark:text-white/20' : 'bg-green-500 text-white'
            }`}
          >
            {loading ? <Loader2 className="animate-spin" /> : (isLocked || !canVoice) ? <Lock size={18} /> : <Volume2 size={18} />}
            {loading ? 'Connecting...' : isLocked ? 'Room Locked' : !canVoice ? 'Permission Denied' : 'Join Channel'}
          </button>
          
          <p className="text-[10px] text-foreground/20 uppercase tracking-[0.2em]">
            {isLocked ? 'Only admins can enter this room' : 'Secure encrypted audio • Low latency'}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
