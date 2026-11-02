import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import { GraduationCap, Loader2, Lock, Play, Radio, User, Users, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDistanceToNowStrict } from 'date-fns';
import { CommunityChannel } from '../types/community';
import { auth, db } from '../firebase';
import LiveStreamRoom from './live/LiveStreamRoom';
import Avatar from './ui/Avatar';

type StreamFormat = 'broadcast' | 'guest' | 'webinar';

interface LiveStream {
  id: string;
  hostId: string;
  hostName?: string;
  hostPhoto?: string;
  title: string;
  description: string;
  status: 'waiting' | 'live' | 'ended';
  type: StreamFormat | 'paid';
  viewerCount: number;
  startTime: any;
  lastSeenAt?: any;
}

interface LiveStreamViewProps {
  communityId: string;
  channel: CommunityChannel;
  currentUserProfile: any;
  isOwner: boolean;
  isAdmin: boolean;
  myPermissions?: string[];
}

const HEARTBEAT_MS = 30_000;
/** A stream whose host hasn't checked in for this long is treated as over (tab closed). */
const STALE_MS = 2 * 60_000;
const toMillis = (v: any) => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : 0);

const FORMATS: { id: StreamFormat; label: string; body: string; icon: typeof User }[] = [
  { id: 'broadcast', label: 'Just me', body: 'You present, everyone watches and chats.', icon: User },
  { id: 'guest', label: 'With guests', body: 'Bring members on stage to talk with you.', icon: Users },
  { id: 'webinar', label: 'Lesson', body: 'Teach or demo, with Q&A for questions.', icon: GraduationCap },
];

/** A live stage: who's live and a Watch button, or Go live for hosts. Joined, the stream itself. */
export default function LiveStreamView({ communityId, channel, currentUserProfile, isOwner, isAdmin, myPermissions = [] }: LiveStreamViewProps) {
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGoLive, setShowGoLive] = useState(false);
  const [joining, setJoining] = useState(false);
  const [session, setSession] = useState<{ streamId: string; token: string } | null>(null);
  const [now, setNow] = useState(Date.now());

  const canHost = isOwner || isAdmin || myPermissions.includes('host_stream');
  const serverUrl = import.meta.env.VITE_LIVEKIT_URL as string | undefined;
  const isLocked = (channel as any).isLocked && !isAdmin;
  const me = auth.currentUser?.uid;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => onSnapshot(
    query(collection(db, 'communities', communityId, 'channels', channel.id, 'liveStreams'), where('status', '==', 'live'), orderBy('startTime', 'desc'), limit(1)),
    snap => {
      setStream(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as LiveStream));
      setLoading(false);
    },
    () => setLoading(false),
  ), [communityId, channel.id]);

  const isHost = !!stream && stream.hostId === me;
  const lastSeen = stream ? toMillis(stream.lastSeenAt) || toMillis(stream.startTime) : 0;
  const isFresh = !!stream && (isHost || now - lastSeen < STALE_MS);

  // Host heartbeat while live, so viewers can tell a live stream from an abandoned one.
  useEffect(() => {
    if (!session || !stream || !isHost) return;
    const ref = doc(db, 'communities', communityId, 'channels', channel.id, 'liveStreams', stream.id);
    const beat = () => updateDoc(ref, { lastSeenAt: serverTimestamp() }).catch(() => undefined);
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [session?.streamId, stream?.id, isHost]);

  const connect = async (streamId: string) => {
    const user = auth.currentUser;
    if (!user) return toast.error('Sign in to watch');
    if (!serverUrl) return toast.error("Live stages aren't set up on this site yet");
    const res = await fetch('/api/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({
        eventId: `stream_${communityId}_${streamId}`,
        username: currentUserProfile?.displayName || currentUserProfile?.username || user.displayName || 'Member',
        photoURL: currentUserProfile?.profileImage || user.photoURL || '',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't connect");
    setSession({ streamId, token: data.token });
  };

  const goLive = async (config: { title: string; description: string; type: StreamFormat }) => {
    if (!me) return;
    if (isLocked) return toast.error('This stage is locked');
    setJoining(true);
    try {
      const ref = await addDoc(collection(db, 'communities', communityId, 'channels', channel.id, 'liveStreams'), {
        communityId,
        channelId: channel.id,
        hostId: me,
        hostName: currentUserProfile?.displayName || currentUserProfile?.username || auth.currentUser?.displayName || 'Host',
        hostPhoto: currentUserProfile?.profileImage || auth.currentUser?.photoURL || '',
        title: config.title.trim(),
        description: config.description.trim(),
        status: 'live',
        type: config.type,
        viewerCount: 0,
        startTime: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
      await connect(ref.id);
      setShowGoLive(false);
    } catch (error: any) {
      toast.error(error.message || "Couldn't go live");
    } finally {
      setJoining(false);
    }
  };

  const watch = async () => {
    if (!stream) return;
    if (isLocked) return toast.error('This stage is locked');
    setJoining(true);
    try {
      await connect(stream.id);
    } catch (error: any) {
      toast.error(error.message || "Couldn't join the stream");
    } finally {
      setJoining(false);
    }
  };

  const leave = async () => {
    if (stream && isHost) {
      await updateDoc(doc(db, 'communities', communityId, 'channels', channel.id, 'liveStreams', stream.id), {
        status: 'ended',
        endTime: serverTimestamp(),
      }).catch(() => undefined);
      toast.success('Stream ended');
    }
    setSession(null);
  };

  // The stream ended (or the host disappeared) while we were watching.
  useEffect(() => {
    if (session && (!stream || stream.id !== session.streamId) && !loading) {
      setSession(null);
      toast('The stream has ended');
    }
  }, [stream?.id, loading]);

  if (session && stream && serverUrl) {
    return (
      <LiveKitRoom
        serverUrl={serverUrl}
        token={session.token}
        connect
        audio={isHost}
        video={isHost}
        onMediaDeviceFailure={() => toast.error('Allow camera and microphone access in your browser to go live.')}
        className="flex-1 flex flex-col min-h-0"
      >
        <RoomAudioRenderer />
        <LiveStreamRoom
          communityId={communityId}
          channelId={channel.id}
          streamId={stream.id}
          token={session.token}
          serverUrl={serverUrl}
          isHost={isHost}
          hostId={stream.hostId}
          onLeave={leave}
          streamTitle={stream.title}
          streamType={stream.type}
        />
      </LiveKitRoom>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
      {loading ? (
        <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      ) : stream && isFresh ? (
        <div className="max-w-lg w-full">
          <div className="relative aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-rose-500/25 via-primary/20 to-indigo-500/20 border border-foreground/10 flex flex-col items-center justify-center text-center p-6">
            <span className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500 text-xs font-semibold" style={{ color: '#fff' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/40 text-xs" style={{ color: '#fff' }}>
              <Users size={12} /> {stream.viewerCount || 0} watching
            </span>
            <Avatar src={stream.hostPhoto} seed={stream.hostId} size={64} />
            <h2 className="mt-3 text-xl font-bold">{stream.title}</h2>
            <p className="text-sm text-foreground/65">
              {stream.hostName || 'Host'} · started {stream.startTime ? formatDistanceToNowStrict(new Date(toMillis(stream.startTime)), { addSuffix: true }) : 'just now'}
            </p>
            {stream.description && <p className="mt-2 text-sm text-foreground/60 line-clamp-2 max-w-sm">{stream.description}</p>}
          </div>
          <button
            onClick={watch}
            disabled={joining || isLocked}
            className="mt-4 w-full py-3 rounded-full bg-primary text-white font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50"
          >
            {joining ? <Loader2 size={18} className="animate-spin" /> : isLocked ? <Lock size={18} /> : <Play size={18} fill="currentColor" />}
            {isLocked ? 'This stage is locked' : isHost ? 'Return to your stream' : 'Watch now'}
          </button>
        </div>
      ) : (
        <div className="max-w-sm w-full text-center">
          <span className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Radio size={30} /></span>
          <h2 className="mt-4 text-2xl font-bold">{channel.name}</h2>
          <p className="mt-1 text-foreground/60">{channel.description || 'Talks, demos and lessons happen here.'}</p>
          <div className="mt-6 p-4 rounded-2xl border border-foreground/10 text-sm text-foreground/60">
            Nobody's live right now.{canHost ? ' Start a stream and members can watch and chat.' : ' When someone goes live, you can watch here.'}
          </div>
          {canHost && (
            <button
              onClick={() => setShowGoLive(true)}
              disabled={isLocked}
              className="mt-5 w-full py-3 rounded-full bg-rose-500 hover:bg-rose-600 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              style={{ color: '#fff' }}
            >
              {isLocked ? <Lock size={18} /> : <Radio size={18} />} {isLocked ? 'This stage is locked' : 'Go live'}
            </button>
          )}
        </div>
      )}

      {showGoLive && <GoLiveDialog busy={joining} onClose={() => setShowGoLive(false)} onStart={goLive} />}
    </div>
  );
}

function GoLiveDialog({ busy, onClose, onStart }: { busy: boolean; onClose: () => void; onStart: (c: { title: string; description: string; type: StreamFormat }) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<StreamFormat>('broadcast');
  const input = 'mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/10 dark:border-white/15 outline-none focus:border-primary text-sm';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form
        onSubmit={e => { e.preventDefault(); if (title.trim()) onStart({ title, description, type }); }}
        className="w-full h-full sm:h-auto sm:max-w-md flex flex-col bg-background text-black dark:text-white sm:rounded-3xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/10 dark:border-white/10">
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={20} /></button>
          <h2 className="font-semibold">Go live</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          <div>
            <label htmlFor="live-title" className="text-sm font-medium">Title</label>
            <input id="live-title" autoFocus required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Portfolio reviews, live" className={input} />
          </div>
          <div>
            <label htmlFor="live-desc" className="text-sm font-medium">What's it about? <span className="font-normal text-black/45 dark:text-white/45">(optional)</span></label>
            <textarea id="live-desc" rows={2} maxLength={300} value={description} onChange={e => setDescription(e.target.value)} className={`${input} resize-none`} />
          </div>
          <div>
            <p className="text-sm font-medium">Format</p>
            <div className="mt-2 space-y-2">
              {FORMATS.map(f => (
                <button key={f.id} type="button" onClick={() => setType(f.id)} aria-pressed={type === f.id} className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors ${type === f.id ? 'border-primary bg-primary/5' : 'border-black/10 dark:border-white/10 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}>
                  <f.icon size={18} className={type === f.id ? 'text-primary' : 'text-black/45 dark:text-white/45'} />
                  <span>
                    <span className="block text-sm font-semibold">{f.label}</span>
                    <span className="block text-xs text-black/55 dark:text-white/55">{f.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50">Your camera and microphone turn on when you go live. You can turn them off anytime.</p>
        </div>
        <div className="p-4 border-t border-black/10 dark:border-white/10">
          <button type="submit" disabled={busy || !title.trim()} className="w-full py-3 rounded-full bg-rose-500 hover:bg-rose-600 font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ color: '#fff' }}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />} Start streaming
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
