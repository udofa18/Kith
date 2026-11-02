import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown, MessageCircle, Mic, MicOff, MonitorUp, Phone, PhoneOff, Video as VideoIcon, VideoOff, WifiOff,
} from 'lucide-react';
import {
  LiveKitRoom, RoomAudioRenderer, VideoTrack, useConnectionState, useIsSpeaking, useLocalParticipant,
  useRemoteParticipants, useTracks,
} from '@livekit/components-react';
import { ConnectionState, Track, type Participant } from 'livekit-client';
import { toast } from 'react-hot-toast';
import { auth } from '../../firebase';
import { otherPartyOf, useCall, type CallOutcome, type CallSession } from '../../contexts/CallContext';
import Avatar from '../ui/Avatar';

const RINGTONE = 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3';
const DIALTONE = 'https://assets.mixkit.co/active_storage/sfx/1358/1358-preview.mp3';
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string | undefined;

/** Loops a sound while `on` is true. */
function useLoop(src: string, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const audio = new Audio(src);
    audio.loop = true;
    audio.play().catch(() => undefined);
    return () => { audio.pause(); audio.src = ''; };
  }, [src, on]);
}

const elapsed = (from: any) => {
  const start = from?.toMillis ? from.toMillis() : from instanceof Date ? from.getTime() : Date.now();
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function useTimer(from: any) {
  const [s, setS] = useState(() => elapsed(from));
  useEffect(() => {
    setS(elapsed(from));
    const t = setInterval(() => setS(elapsed(from)), 1000);
    return () => clearInterval(t);
  }, [from]);
  return mmss(s);
}

/** Global call UI: incoming call, the call screen (full or minimised), and the end-of-call notice. */
export default function CallInterface() {
  const { activeCall, incomingCall, outcome, acceptCall, declineCall, endCall, isMinimized, setIsMinimized } = useCall();
  const me = auth.currentUser?.uid;
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useLoop(RINGTONE, !!incomingCall && !activeCall);
  useLoop(DIALTONE, activeCall?.status === 'ringing' && activeCall.callerId === me);

  // Fetch a room token once the call is answered.
  useEffect(() => {
    setToken(null);
    setTokenError(null);
    if (!activeCall || activeCall.status !== 'active' || !auth.currentUser) return;
    if (!LIVEKIT_URL) { setTokenError("Calls aren't set up on this site yet."); return; }
    let cancelled = false;
    (async () => {
      try {
        const user = auth.currentUser!;
        const res = await fetch('/api/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify({ eventId: `call_${activeCall.id}`, username: user.displayName || 'Member', photoURL: user.photoURL || '' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not connect');
        if (!cancelled) setToken(data.token);
      } catch (err: any) {
        if (!cancelled) setTokenError(err.message || 'Could not connect');
      }
    })();
    return () => { cancelled = true; };
  }, [activeCall?.id, activeCall?.status]);

  return createPortal(
    <div className="keep-dark">
      <AnimatePresence>
        {incomingCall && !activeCall && (
          <IncomingCall key={incomingCall.id} call={incomingCall} onAccept={acceptCall} onDecline={declineCall} />
        )}
      </AnimatePresence>

      {activeCall && (
        activeCall.status === 'ringing' ? (
          <Shell minimized={isMinimized}>
            {isMinimized
              ? <MiniBar call={activeCall} label="Calling…" onExpand={() => setIsMinimized(false)} onEnd={endCall} />
              : <Ringing call={activeCall} onEnd={endCall} onMinimize={() => setIsMinimized(true)} />}
          </Shell>
        ) : token && LIVEKIT_URL ? (
          <LiveKitRoom
            serverUrl={LIVEKIT_URL}
            token={token}
            audio
            video={activeCall.media === 'video'}
            connect
            onDisconnected={() => endCall()}
            onMediaDeviceFailure={() => toast.error(`Allow ${activeCall.media === 'video' ? 'camera and microphone' : 'microphone'} access in your browser to talk.`)}
            className="contents"
          >
            <RoomAudioRenderer />
            <Shell minimized={isMinimized}>
              {isMinimized
                ? <LiveMiniBar call={activeCall} onExpand={() => setIsMinimized(false)} onEnd={endCall} />
                : <InCall call={activeCall} onEnd={endCall} onMinimize={() => setIsMinimized(true)} />}
            </Shell>
          </LiveKitRoom>
        ) : (
          <Shell minimized={false}>
            <Connecting call={activeCall} error={tokenError} onEnd={endCall} />
          </Shell>
        )
      )}

      <AnimatePresence>{outcome && !activeCall && <OutcomeNotice key="outcome" outcome={outcome} />}</AnimatePresence>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Layout

function Shell({ minimized, children }: { minimized: boolean; children: React.ReactNode }) {
  if (minimized) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[110] bg-neutral-950 text-white flex flex-col select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Call"
    >
      {children}
    </motion.div>
  );
}

function Backdrop({ photo }: { photo: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {photo && <img src={photo} alt="" className="w-full h-full object-cover blur-3xl scale-125 opacity-30" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />
    </div>
  );
}

function TopBar({ title, subtitle, onMinimize }: { title: string; subtitle: React.ReactNode; onMinimize?: () => void }) {
  return (
    <div className="relative z-20 flex items-center gap-3 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3">
      {onMinimize && (
        <button onClick={onMinimize} aria-label="Minimise call" title="Minimise" className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
          <ChevronDown size={22} />
        </button>
      )}
      <div className="min-w-0 flex-1 text-center pr-10">
        <p className="font-semibold truncate">{title}</p>
        <p className="text-xs text-white/70">{subtitle}</p>
      </div>
    </div>
  );
}

function RoundButton({ label, onClick, active = true, danger, children, size = 'md' }: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  size?: 'md' | 'lg';
  children: React.ReactNode;
}) {
  const dim = size === 'lg' ? 'w-16 h-16' : 'w-14 h-14';
  const tone = danger ? 'bg-red-500 hover:bg-red-600' : active ? 'bg-white/15 hover:bg-white/25' : 'bg-white text-neutral-900 hover:bg-white/90';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={onClick} aria-label={label} title={label} className={`${dim} rounded-full flex items-center justify-center transition-colors ${tone}`} style={!active && !danger ? { color: '#111' } : undefined}>
        {children}
      </button>
      <span className="text-[11px] text-white/70">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Incoming

function IncomingCall({ call, onAccept, onDecline }: { call: CallSession; onAccept: () => void; onDecline: () => void }) {
  const video = call.media === 'video';
  const Accept = video ? VideoIcon : Phone;
  return (
    <>
      {/* Phones: full screen */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sm:hidden fixed inset-0 z-[120] bg-neutral-950 text-white flex flex-col">
        <Backdrop photo={call.callerPhoto} />
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
          <span className="relative">
            <span className="absolute inset-0 rounded-full bg-white/20 animate-ping" />
            <Avatar src={call.callerPhoto} seed={call.callerId} size={112} />
          </span>
          <p className="mt-6 text-2xl font-bold">{call.callerName || 'Someone'}</p>
          <p className="mt-1 text-white/70">Incoming {video ? 'video' : 'voice'} call</p>
        </div>
        <div className="relative z-10 flex justify-around pb-[max(40px,env(safe-area-inset-bottom))] px-10">
          <RoundButton label="Decline" danger size="lg" onClick={onDecline}><PhoneOff size={26} /></RoundButton>
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={onAccept} aria-label="Accept" className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center animate-pulse"><Accept size={26} /></button>
            <span className="text-[11px] text-white/70">Accept</span>
          </div>
        </div>
      </motion.div>

      {/* Larger screens: card at the top */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="hidden sm:flex fixed top-5 left-1/2 -translate-x-1/2 z-[120] w-[380px] items-center gap-3 p-3 pl-4 rounded-3xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-white"
        role="alertdialog"
        aria-label={`Incoming call from ${call.callerName}`}
      >
        <Avatar src={call.callerPhoto} seed={call.callerId} size={48} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{call.callerName || 'Someone'}</p>
          <p className="text-sm text-white/60">Incoming {video ? 'video' : 'voice'} call</p>
        </div>
        <button onClick={onDecline} aria-label="Decline" title="Decline" className="w-11 h-11 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"><PhoneOff size={19} /></button>
        <button onClick={onAccept} aria-label="Accept" title="Accept" className="w-11 h-11 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center"><Accept size={19} /></button>
      </motion.div>
    </>
  );
}

// ---------------------------------------------------------------- Ringing (outgoing) and connecting

/** Your own camera while a video call rings, so you can check how you look. */
function SelfPreview() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true }).then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      if (ref.current) ref.current.srcObject = s;
    }).catch(() => undefined);
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return <video ref={ref} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-60" />;
}

function Ringing({ call, onEnd, onMinimize }: { call: CallSession; onEnd: () => void; onMinimize: () => void }) {
  const other = otherPartyOf(call, auth.currentUser?.uid);
  return (
    <>
      {call.media === 'video' ? <SelfPreview /> : <Backdrop photo={other.photo} />}
      <TopBar title={other.name} subtitle={call.media === 'video' ? 'Video call' : 'Voice call'} onMinimize={onMinimize} />
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center">
        <span className="relative">
          <span className="absolute -inset-3 rounded-full border-2 border-white/20 animate-ping" />
          <Avatar src={other.photo} seed={other.id} size={120} />
        </span>
        <p className="mt-6 text-2xl font-bold">{other.name}</p>
        <p className="mt-1 text-white/70">Calling…</p>
      </div>
      <div className="relative z-10 flex justify-center pb-[max(40px,env(safe-area-inset-bottom))]">
        <RoundButton label="Cancel" danger size="lg" onClick={onEnd}><PhoneOff size={26} /></RoundButton>
      </div>
    </>
  );
}

function Connecting({ call, error, onEnd }: { call: CallSession; error: string | null; onEnd: () => void }) {
  const other = otherPartyOf(call, auth.currentUser?.uid);
  return (
    <>
      <Backdrop photo={other.photo} />
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
        <Avatar src={other.photo} seed={other.id} size={112} />
        <p className="mt-6 text-2xl font-bold">{other.name}</p>
        {error ? (
          <p className="mt-2 text-red-300 max-w-xs">{error}</p>
        ) : (
          <p className="mt-2 text-white/70 flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Connecting…</p>
        )}
      </div>
      <div className="relative z-10 flex justify-center pb-[max(40px,env(safe-area-inset-bottom))]">
        <RoundButton label={error ? 'Close' : 'End'} danger size="lg" onClick={onEnd}><PhoneOff size={26} /></RoundButton>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- In call

function InCall({ call, onEnd, onMinimize }: { call: CallSession; onEnd: () => void; onMinimize: () => void }) {
  const navigate = useNavigate();
  const other = otherPartyOf(call, auth.currentUser?.uid);
  const timer = useTimer(call.answeredAt ?? call.createdAt);
  const state = useConnectionState();
  const remotes = useRemoteParticipants();
  const remote = remotes[0];
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  const remoteVideo = tracks.find(t => !t.participant.isLocal && t.source === Track.Source.ScreenShare && t.publication?.track)
    ?? tracks.find(t => !t.participant.isLocal && t.source === Track.Source.Camera && t.publication?.track && !t.publication.isMuted);
  const localVideo = tracks.find(t => t.participant.isLocal && t.source === Track.Source.Camera && t.publication?.track && !t.publication.isMuted);
  const anyVideo = !!remoteVideo || !!localVideo;

  // In video, controls fade after a few seconds without movement.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const poke = () => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (anyVideo) hideTimer.current = setTimeout(() => setControlsVisible(false), 4000);
  };
  useEffect(() => { poke(); return () => clearTimeout(hideTimer.current); }, [anyVideo]);

  const status = state === ConnectionState.Reconnecting ? 'Reconnecting…'
    : state === ConnectionState.Connecting ? 'Connecting…'
      : !remote ? `Waiting for ${other.name.split(' ')[0]}…`
        : timer;

  const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !/Mobi/i.test(navigator.userAgent);
  const toggle = (p: Promise<unknown> | undefined, what: string) => p?.catch(() => toast.error(`Couldn't turn on your ${what}. Check your browser permissions.`));

  return (
    <div className="relative flex-1 flex flex-col" onMouseMove={poke} onClick={poke}>
      {/* Stage */}
      {remoteVideo ? (
        <VideoTrack trackRef={remoteVideo} className={`absolute inset-0 w-full h-full ${remoteVideo.source === Track.Source.ScreenShare ? 'object-contain bg-black' : 'object-cover'}`} />
      ) : (
        <Backdrop photo={other.photo} />
      )}

      <div className={`transition-opacity duration-300 ${controlsVisible || !anyVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className={anyVideo ? 'bg-gradient-to-b from-black/60 to-transparent' : ''}>
          <TopBar
            title={other.name}
            subtitle={<span className="inline-flex items-center gap-1.5">{state === ConnectionState.Reconnecting && <WifiOff size={12} />}{status}{remote && !remote.isMicrophoneEnabled && <MicOff size={12} className="text-red-300" />}</span>}
            onMinimize={onMinimize}
          />
        </div>
      </div>

      {!remoteVideo && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
          <SpeakingAvatar participant={remote} photo={other.photo} seed={other.id} size={136} />
          <p className="mt-6 text-2xl font-bold">{other.name}</p>
          <p className="mt-1 text-white/70">{remote && !remote.isMicrophoneEnabled ? 'Muted' : status}</p>
        </div>
      )}
      {remoteVideo && <div className="flex-1" />}

      {/* Your camera */}
      {localVideo && (
        <motion.div
          drag
          dragMomentum={false}
          className="absolute z-20 right-4 bottom-32 w-28 sm:w-44 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-neutral-800 cursor-grab active:cursor-grabbing"
        >
          <VideoTrack trackRef={localVideo} className="w-full h-full object-cover -scale-x-100" />
        </motion.div>
      )}

      {/* Controls */}
      <div className={`relative z-20 transition-opacity duration-300 ${controlsVisible || !anyVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className={`flex items-start justify-center gap-5 sm:gap-7 px-4 pt-6 pb-[max(28px,env(safe-area-inset-bottom))] ${anyVideo ? 'bg-gradient-to-t from-black/70 to-transparent' : ''}`}>
          <RoundButton label={isMicrophoneEnabled ? 'Mute' : 'Unmute'} active={isMicrophoneEnabled} onClick={() => toggle(localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled), 'microphone')}>
            {isMicrophoneEnabled ? <Mic size={22} /> : <MicOff size={22} />}
          </RoundButton>
          <RoundButton label={isCameraEnabled ? 'Camera off' : 'Camera'} active={isCameraEnabled || call.media === 'voice'} onClick={() => toggle(localParticipant?.setCameraEnabled(!isCameraEnabled), 'camera')}>
            {isCameraEnabled ? <VideoIcon size={22} /> : <VideoOff size={22} />}
          </RoundButton>
          {canShare && (
            <RoundButton label={isScreenShareEnabled ? 'Stop sharing' : 'Share screen'} active={!isScreenShareEnabled} onClick={() => toggle(localParticipant?.setScreenShareEnabled(!isScreenShareEnabled), 'screen share')}>
              <MonitorUp size={22} />
            </RoundButton>
          )}
          <RoundButton label="Chat" onClick={() => { onMinimize(); navigate(`/feed?view=messages&c=${call.chatId}`); }}>
            <MessageCircle size={22} />
          </RoundButton>
          <RoundButton label="End" danger onClick={onEnd}><PhoneOff size={22} /></RoundButton>
        </div>
      </div>
    </div>
  );
}

/** Avatar with a ring that pulses while the person is talking. */
function SpeakingAvatar({ participant, photo, seed, size }: { participant?: Participant; photo: string; seed: string; size: number }) {
  return participant ? <SpeakingRing participant={participant} photo={photo} seed={seed} size={size} /> : <Avatar src={photo} seed={seed} size={size} />;
}

function SpeakingRing({ participant, photo, seed, size }: { participant: Participant; photo: string; seed: string; size: number }) {
  const speaking = useIsSpeaking(participant);
  return (
    <span className={`rounded-full p-1 transition-shadow duration-200 ${speaking ? 'shadow-[0_0_0_4px_rgba(34,197,94,0.7)]' : 'shadow-[0_0_0_4px_rgba(255,255,255,0.08)]'}`}>
      <Avatar src={photo} seed={seed} size={size} />
    </span>
  );
}

// ---------------------------------------------------------------- Minimised

function MiniShell({ onExpand, children }: { onExpand: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed z-[110] bottom-24 right-4 sm:bottom-6 sm:right-6 flex items-center gap-2 p-2 pl-2.5 rounded-full bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-white cursor-grab active:cursor-grabbing"
    >
      <button onClick={onExpand} className="flex items-center gap-2.5 min-w-0 pr-1" aria-label="Open call">
        {children}
      </button>
    </motion.div>
  );
}

function MiniBar({ call, label, onExpand, onEnd }: { call: CallSession; label: string; onExpand: () => void; onEnd: () => void }) {
  const other = otherPartyOf(call, auth.currentUser?.uid);
  return (
    <div className="contents">
      <MiniShell onExpand={onExpand}>
        <Avatar src={other.photo} seed={other.id} size={36} />
        <span className="text-left min-w-0">
          <span className="block text-sm font-semibold truncate max-w-[140px]">{other.name}</span>
          <span className="block text-xs text-white/60">{label}</span>
        </span>
        <span onClick={e => { e.stopPropagation(); onEnd(); }} role="button" aria-label="End call" className="ml-1 w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"><PhoneOff size={16} /></span>
      </MiniShell>
    </div>
  );
}

function LiveMiniBar({ call, onExpand, onEnd }: { call: CallSession; onExpand: () => void; onEnd: () => void }) {
  const other = otherPartyOf(call, auth.currentUser?.uid);
  const timer = useTimer(call.answeredAt ?? call.createdAt);
  const remote = useRemoteParticipants()[0];
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  return (
    <MiniShell onExpand={onExpand}>
      <SpeakingAvatar participant={remote} photo={other.photo} seed={other.id} size={36} />
      <span className="text-left min-w-0">
        <span className="block text-sm font-semibold truncate max-w-[140px]">{other.name}</span>
        <span className="block text-xs text-green-400">{timer}</span>
      </span>
      <span
        onClick={e => { e.stopPropagation(); localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled); }}
        role="button"
        aria-label={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        className={`ml-1 w-9 h-9 rounded-full flex items-center justify-center ${isMicrophoneEnabled ? 'bg-white/15 hover:bg-white/25' : 'bg-white'}`}
        style={isMicrophoneEnabled ? undefined : { color: '#111' }}
      >
        {isMicrophoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
      </span>
      <span onClick={e => { e.stopPropagation(); onEnd(); }} role="button" aria-label="End call" className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center"><PhoneOff size={16} /></span>
    </MiniShell>
  );
}

// ---------------------------------------------------------------- After the call

function OutcomeNotice({ outcome }: { outcome: CallOutcome }) {
  const first = outcome.name.split(' ')[0];
  const text = {
    declined: `${first} declined the call`,
    busy: `${first} is on another call`,
    'no-answer': `${first} didn't answer`,
    ended: `Call ended${outcome.seconds ? ` · ${mmss(outcome.seconds)}` : ''}`,
  }[outcome.reason];
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-white"
      role="status"
    >
      <Avatar src={outcome.photo} seed={outcome.name} size={32} />
      <span className="text-sm font-medium">{text}</span>
    </motion.div>
  );
}
