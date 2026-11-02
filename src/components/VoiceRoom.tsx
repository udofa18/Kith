import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Hand, MessageSquare, Mic, MicOff, PhoneOff, Smile, WifiOff, X } from 'lucide-react';
import { Chat, useConnectionState, useDataChannel, useIsSpeaking, useLocalParticipant, useParticipants } from '@livekit/components-react';
import { ConnectionState, type Participant } from 'livekit-client';
import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db } from '../firebase';
import Avatar from './ui/Avatar';

interface VoiceRoomProps {
  communityId: string;
  channelId: string;
  channelName?: string;
  token: string;
  serverUrl: string;
  mode: 'open' | 'stage' | 'private';
  onLeave: () => void;
}

const REACTIONS = ['👏', '😂', '🔥', '❤️', '🎉', '💯'];

const metaOf = (p: Participant) => {
  try { return p.metadata ? JSON.parse(p.metadata) : {}; } catch { return {}; }
};

/** Inside a voice room: everyone as a circle that lights up when they talk, plus controls. */
export default function VoiceRoom({ communityId, channelId, channelName, mode, onLeave }: VoiceRoomProps) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const state = useConnectionState();
  const [showChat, setShowChat] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [floating, setFloating] = useState<{ id: string; emoji: string; x: number }[]>([]);

  const float = (emoji: string) => {
    const id = Math.random().toString(36).slice(2);
    setFloating(prev => [...prev, { id, emoji, x: Math.random() * 60 - 30 }]);
    setTimeout(() => setFloating(prev => prev.filter(r => r.id !== id)), 2500);
  };

  const { send } = useDataChannel('reactions', msg => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(msg.payload));
      if (payload.type === 'reaction' && REACTIONS.includes(payload.emoji)) float(payload.emoji);
    } catch { /* ignore malformed */ }
  });

  const react = (emoji: string) => {
    send(new TextEncoder().encode(JSON.stringify({ type: 'reaction', emoji })), { reliable: true });
    float(emoji);
    setShowReactions(false);
  };

  const toggleHand = async () => {
    const next = !handRaised;
    setHandRaised(next);
    await updateDoc(doc(db, 'communities', communityId, 'channels', channelId, 'voiceParticipants', localParticipant.identity), { handRaised: next }).catch(() => undefined);
  };

  const toggleMic = () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
    .catch(() => toast.error('Allow microphone access in your browser to talk.'));

  const status = state === ConnectionState.Reconnecting ? 'Reconnecting…' : state === ConnectionState.Connecting ? 'Connecting…' : `${participants.length} in the room`;

  return (
    <div className="flex-1 flex h-full min-h-0">
      <div className="relative flex-1 flex flex-col min-w-0">
        <div className="shrink-0 px-4 sm:px-6 pt-5 pb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1.5">
              {state === ConnectionState.Reconnecting ? <WifiOff size={12} /> : <span className="w-2 h-2 rounded-full bg-green-500" />} Voice room
            </p>
            <h2 className="text-lg font-bold truncate">{channelName || 'Voice'}</h2>
            <p className="text-sm text-foreground/55">{status}</p>
          </div>
        </div>

        {/* People */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6 justify-items-center">
            {participants.map(p => <Person key={p.sid} participant={p} isMe={p.identity === localParticipant.identity} />)}
          </div>
        </div>

        {/* Floating reactions */}
        <div className="pointer-events-none absolute inset-x-0 bottom-24 h-64 overflow-hidden">
          <AnimatePresence>
            {floating.map(r => (
              <motion.span
                key={r.id}
                initial={{ y: 0, opacity: 0, scale: 0.6 }}
                animate={{ y: -220, opacity: [0, 1, 1, 0], scale: 1.3 }}
                transition={{ duration: 2.4, ease: 'easeOut' }}
                className="absolute bottom-0 left-1/2 text-4xl"
                style={{ marginLeft: `${r.x}%` }}
              >
                {r.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="shrink-0 flex items-center justify-center gap-3 px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
          <Control label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} onClick={toggleMic} tone={isMicrophoneEnabled ? 'neutral' : 'off'}>
            {isMicrophoneEnabled ? <Mic size={22} /> : <MicOff size={22} />}
          </Control>
          {mode === 'stage' && (
            <Control label={handRaised ? 'Lower hand' : 'Raise hand'} onClick={toggleHand} tone={handRaised ? 'active' : 'neutral'}>
              <Hand size={22} />
            </Control>
          )}
          <div className="relative">
            <Control label="React" onClick={() => setShowReactions(v => !v)} tone={showReactions ? 'active' : 'neutral'}><Smile size={22} /></Control>
            {showReactions && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex gap-1 p-1.5 rounded-full bg-background border border-foreground/10 shadow-xl">
                {REACTIONS.map(e => <button key={e} onClick={() => react(e)} className="w-10 h-10 rounded-full text-2xl hover:bg-foreground/5 hover:scale-110 transition-transform">{e}</button>)}
              </div>
            )}
          </div>
          <Control label="Chat" onClick={() => setShowChat(v => !v)} tone={showChat ? 'active' : 'neutral'}><MessageSquare size={22} /></Control>
          <Control label="Leave" onClick={onLeave} tone="danger"><PhoneOff size={22} /></Control>
        </div>
      </div>

      {showChat && (
        <aside className="fixed inset-0 z-50 sm:static sm:z-auto sm:w-80 shrink-0 flex flex-col bg-background sm:border-l border-foreground/10">
          <div className="flex items-center justify-between px-4 h-14 border-b border-foreground/10">
            <p className="font-semibold">Room chat</p>
            <button onClick={() => setShowChat(false)} aria-label="Close chat" className="p-2 rounded-full hover:bg-foreground/10"><X size={18} /></button>
          </div>
          <Chat className="flex-1 min-h-0" />
        </aside>
      )}
    </div>
  );
}

function Person({ participant, isMe }: { participant: Participant; isMe: boolean }) {
  const speaking = useIsSpeaking(participant);
  const meta = metaOf(participant);
  const name = participant.name || 'Member';
  return (
    <div className="flex flex-col items-center gap-2 w-24">
      <span className="relative">
        <span className={`block rounded-full p-1 transition-shadow duration-150 ${speaking ? 'shadow-[0_0_0_3px_rgb(34,197,94)]' : 'shadow-[0_0_0_3px_transparent]'}`}>
          <Avatar src={meta.avatar} seed={participant.identity} size={72} />
        </span>
        {!participant.isMicrophoneEnabled && (
          <span className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-background border border-foreground/10 flex items-center justify-center text-red-500"><MicOff size={13} /></span>
        )}
      </span>
      <span className="text-sm font-medium text-center truncate w-full">{isMe ? 'You' : name}</span>
    </div>
  );
}

function Control({ label, onClick, tone, children }: { label: string; onClick: () => void; tone: 'neutral' | 'active' | 'off' | 'danger'; children: React.ReactNode }) {
  const cls = {
    neutral: 'bg-foreground/10 hover:bg-foreground/15',
    active: 'bg-primary text-white',
    off: 'bg-red-500/15 text-red-500',
    danger: 'bg-red-500 hover:bg-red-600',
  }[tone];
  return (
    <div className="flex flex-col items-center gap-1">
      <button onClick={onClick} aria-label={label} title={label} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${cls}`} style={tone === 'danger' ? { color: '#fff' } : undefined}>
        {children}
      </button>
      <span className="text-[11px] text-foreground/55">{label}</span>
    </div>
  );
}
