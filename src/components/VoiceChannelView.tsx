import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Headphones, Loader2, Lock, Mic, Volume2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { CommunityChannel } from '../types/community';
import { auth, db } from '../firebase';
import { useVoice } from '../contexts/VoiceContext';
import VoiceRoom from './VoiceRoom';
import Avatar from './ui/Avatar';

interface VoiceChannelViewProps {
  communityId: string;
  channel: CommunityChannel;
  currentUserProfile: any;
  isAdmin: boolean;
  myPermissions?: string[];
}

/** Presence entries older than this are leftovers from a closed tab. */
const STALE_MS = 4 * 60 * 60 * 1000;

/** A voice room: who's in it, and a Join button. Once joined, the room itself. */
export default function VoiceChannelView({ communityId, channel, currentUserProfile, isAdmin }: VoiceChannelViewProps) {
  const { activeSession, joinVoice, leaveVoice } = useVoice();
  const [loading, setLoading] = useState(false);
  const [present, setPresent] = useState<any[]>([]);

  const inThisRoom = activeSession?.channelId === channel.id;
  const inAnotherRoom = !!activeSession && !inThisRoom;
  const serverUrl = import.meta.env.VITE_LIVEKIT_URL;
  const isLocked = (channel as any).isLocked && !isAdmin;
  const isMember = !!currentUserProfile;

  useEffect(() => onSnapshot(collection(db, 'communities', communityId, 'channels', channel.id, 'voiceParticipants'), snap => {
    const now = Date.now();
    setPresent(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p: any) => now - new Date(p.joinedAt || 0).getTime() < STALE_MS));
  }, () => setPresent([])), [communityId, channel.id]);

  const join = async () => {
    const user = auth.currentUser;
    if (!user) return toast.error('Sign in to join voice rooms');
    if (!isMember) return toast.error('Join the community to use voice rooms');
    if (isLocked) return toast.error('This room is locked');
    if (!serverUrl) return toast.error("Voice rooms aren't set up on this site yet");

    setLoading(true);
    try {
      const res = await fetch('/api/livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({
          eventId: `voice_${communityId}_${channel.id}`,
          username: currentUserProfile.displayName || currentUserProfile.username || 'Member',
          photoURL: currentUserProfile.profileImage || currentUserProfile.photoURL || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't join the room");

      // Leaving another room first keeps presence accurate.
      if (activeSession) await leavePresence(activeSession.communityId, activeSession.channelId);

      await setDoc(doc(db, 'communities', communityId, 'channels', channel.id, 'voiceParticipants', user.uid), {
        userId: user.uid,
        userName: currentUserProfile.displayName || currentUserProfile.username || 'Member',
        userPhoto: currentUserProfile.profileImage || currentUserProfile.photoURL || '',
        role: 'member',
        joinedAt: new Date().toISOString(),
        isMuted: false,
        handRaised: false,
      });

      joinVoice({
        communityId,
        channelId: channel.id,
        channelName: channel.name,
        token: data.token,
        serverUrl,
        mode: (channel.voiceConfig?.mode as any) || 'open',
      });
    } catch (error: any) {
      toast.error(error.message || "Couldn't join the room");
    } finally {
      setLoading(false);
    }
  };

  const leave = async () => {
    await leavePresence(communityId, channel.id);
    leaveVoice();
  };

  if (inThisRoom && activeSession?.token && serverUrl) {
    return (
      <VoiceRoom
        communityId={communityId}
        channelId={channel.id}
        channelName={channel.name}
        token={activeSession.token}
        serverUrl={serverUrl}
        mode={activeSession.mode}
        onLeave={leave}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <span className="mx-auto w-16 h-16 rounded-2xl bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center"><Volume2 size={30} /></span>
        <h2 className="mt-4 text-2xl font-bold">{channel.name}</h2>
        <p className="mt-1 text-foreground/60">{channel.description || 'Drop in and talk. Leave whenever you like.'}</p>

        <div className="mt-6 p-4 rounded-2xl border border-foreground/10">
          {present.length > 0 ? (
            <>
              <div className="flex justify-center -space-x-2">
                {present.slice(0, 6).map(p => (
                  <span key={p.id} className="rounded-full ring-2 ring-background"><Avatar src={p.userPhoto} seed={p.id} size={40} /></span>
                ))}
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                {present.length === 1 ? `${present[0].userName} is here` : `${present[0].userName} and ${present.length - 1} ${present.length === 2 ? 'other' : 'others'} are here`}
              </p>
            </>
          ) : (
            <p className="text-sm text-foreground/55 flex items-center justify-center gap-2"><Headphones size={16} /> No one's here yet. Start the conversation.</p>
          )}
        </div>

        <button
          onClick={join}
          disabled={loading || isLocked}
          className="mt-5 w-full py-3 rounded-full bg-green-500 hover:bg-green-600 font-semibold disabled:opacity-50 disabled:bg-foreground/10 flex items-center justify-center gap-2 transition-colors"
          style={isLocked ? undefined : { color: '#fff' }}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : isLocked ? <Lock size={18} /> : <Mic size={18} />}
          {loading ? 'Connecting…' : isLocked ? 'This room is locked' : inAnotherRoom ? `Switch to ${channel.name}` : 'Join room'}
        </button>
        <p className="mt-2 text-xs text-foreground/45">
          {isLocked ? 'Only admins can join right now.' : 'Your microphone turns on when you join. You can mute anytime.'}
        </p>
      </div>
    </div>
  );
}

async function leavePresence(communityId: string, channelId: string) {
  if (!auth.currentUser) return;
  await deleteDoc(doc(db, 'communities', communityId, 'channels', channelId, 'voiceParticipants', auth.currentUser.uid)).catch(() => undefined);
}
