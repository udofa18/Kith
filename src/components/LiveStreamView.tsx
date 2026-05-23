import { useState, useEffect } from 'react';
import { Play, Loader2, Signal, Radio, Users, Plus, Timer, Shield, Info, DollarSign, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CommunityChannel } from '../types/community';
import { auth, db } from '../firebase';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  limit, 
  orderBy, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { useLiveSession } from '../contexts/LiveSessionContext';
import LiveStreamRoom from './live/LiveStreamRoom';

interface LiveStream {
  id: string;
  hostId: string;
  title: string;
  description: string;
  status: 'waiting' | 'live' | 'ended';
  type: 'broadcast' | 'guest' | 'webinar' | 'paid';
  price?: number;
  viewerCount: number;
  startTime: any;
  thumbnail?: string;
}

interface LiveStreamViewProps {
  communityId: string;
  channel: CommunityChannel;
  currentUserProfile: any;
  isOwner: boolean;
  isAdmin: boolean;
  myPermissions?: string[];
}

export default function LiveStreamView({ 
  communityId, 
  channel, 
  currentUserProfile, 
  isOwner, 
  isAdmin,
  myPermissions = []
}: LiveStreamViewProps) {
  const { session, startSession, endSession } = useLiveSession();
  const [activeStream, setActiveStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joining, setJoining] = useState(false);

  const canHost = isOwner || isAdmin || myPermissions.includes('host_stream');
  const serverUrl = import.meta.env.VITE_LIVEKIT_URL;
  const isLocked = (channel as any).isLocked && !isAdmin;

  const isCurrentActiveSession = session.isActive && session.eventId === activeStream?.id;

  // Listen for active stream in this channel
  useEffect(() => {
    if (!communityId || !channel.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'communities', communityId, 'channels', channel.id, 'liveStreams'),
      where('status', '==', 'live'),
      orderBy('startTime', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setActiveStream({ id: snap.docs[0].id, ...data } as LiveStream);
      } else {
        setActiveStream(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [communityId, channel.id]);

  const handleStartStream = async (config: { title: string, type: 'broadcast' | 'guest' | 'webinar' | 'paid', description: string, price?: number }) => {
    if (!auth.currentUser) return;

    if (isLocked) {
      toast.error('This stage is locked. Only admins can broadcast.');
      return;
    }
    
    setJoining(true);
    try {
      // 1. Create stream document
      const streamRef = await addDoc(collection(db, 'communities', communityId, 'channels', channel.id, 'liveStreams'), {
        communityId,
        channelId: channel.id,
        hostId: auth.currentUser.uid,
        title: config.title,
        description: config.description,
        status: 'live',
        type: config.type,
        price: config.price || 0,
        viewerCount: 0,
        startTime: serverTimestamp(),
      });

      // 2. Start global session
      await startSession(streamRef.id);
      
      setShowCreateModal(false);
      toast.success('Live stream started!');
    } catch (error: any) {
      console.error('Failed to start stream:', error);
      toast.error(error.message || 'Failed to start stream');
    } finally {
      setJoining(false);
    }
  };

  const handleJoinStream = async () => {
    if (!activeStream) return;
    
    if (isLocked) {
      toast.error('This stage is locked. Only admins can watch.');
      return;
    }

    setJoining(true);
    try {
      await startSession(activeStream.id);
      toast.success('Joined stream!');
    } catch (error: any) {
      console.error('Failed to join stream:', error);
      toast.error(error.message || 'Failed to join stream');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (activeStream && activeStream.hostId === auth.currentUser?.uid) {
      try {
        await updateDoc(doc(db, 'communities', communityId, 'channels', channel.id, 'liveStreams', activeStream.id), {
          status: 'ended',
          endTime: serverTimestamp()
        });
      } catch (e) {
        console.error('Error ending stream:', e);
      }
    }
    endSession();
  };

  if (isCurrentActiveSession && activeStream && serverUrl) {
    return (
      <LiveStreamRoom
        communityId={communityId}
        channelId={channel.id}
        streamId={activeStream.id}
        token={session.token!}
        serverUrl={serverUrl}
        isHost={activeStream.hostId === auth.currentUser?.uid}
        hostId={activeStream.hostId}
        onLeave={handleLeave}
        streamTitle={activeStream.title}
        streamType={activeStream.type}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background p-6 text-center h-full overflow-y-auto">
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-foreground/40 font-medium animate-pulse">Scanning frequencies...</p>
        </div>
      ) : activeStream ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full"
        >
          <div className="relative group cursor-pointer overflow-hidden rounded-[3rem] border border-foreground/10 bg-foreground/5 dark:border-white/10 dark:bg-white/5 backdrop-blur-3xl p-1 shadow-2xl">
            <div className="aspect-video relative rounded-[2.5rem] overflow-hidden bg-black/5 dark:bg-zinc-900 border border-foreground/5 dark:border-white/5 shadow-inner">
              {activeStream.thumbnail ? (
                <img src={activeStream.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-purple-500/10" />
              )}
              
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white shadow-[0_0_40px_rgba(var(--primary-rgb),0.5)] group-hover:scale-110 transition-transform">
                  <Play size={32} fill="currentColor" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                      <div className="w-1 h-1 rounded-full bg-rose-500" />
                      Live Now
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-foreground/10 dark:bg-white/10 text-foreground/60 dark:text-white/60 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                      <Users size={10} />
                      {activeStream.viewerCount || 0} watching
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-foreground dark:text-white">{activeStream.title}</h2>
                  <p className="text-foreground/40 dark:text-white/40 text-xs max-w-sm mx-auto line-clamp-2">
                    {activeStream.description || 'Watch the live stream and interact with the host.'}
                  </p>
                </div>

                <div className="flex gap-4 w-full max-w-xs mt-2">
                  <button 
                    disabled={joining || isLocked}
                    onClick={handleJoinStream}
                    className={`flex-1 py-2.5 font-bold rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl text-sm ${
                      isLocked ? 'bg-foreground/10 dark:bg-zinc-800 text-foreground/20 dark:text-white/20' : 'bg-foreground text-background'
                    }`}
                  >
                    {joining ? <Loader2 className="animate-spin" /> : isLocked ? <Lock size={16} /> : <Play size={16} fill="currentColor" />}
                    {isLocked ? 'Stage Locked' : 'Watch Now'}
                  </button>
                </div>
              </div>

              {activeStream.type === 'paid' && (
                <div className="absolute top-6 right-6">
                  <div className="px-4 py-2 bg-amber-500 text-black font-black rounded-xl text-xs flex items-center gap-2 shadow-lg ring-4 ring-black/20">
                    <DollarSign size={14} />
                    PREMIUM
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="max-w-md w-full p-8 rounded-[3rem] bg-foreground/5 border border-foreground/10 dark:bg-white/5 dark:border-white/10 backdrop-blur-3xl shadow-2xl space-y-8"
        >
          <div className="relative mx-auto">
            <div className="w-20 h-20 rounded-[2rem] bg-primary/10 text-primary flex items-center justify-center mx-auto relative z-10">
              <Radio size={40} className="animate-pulse" />
            </div>
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-foreground">{channel.name}</h2>
            <p className="text-foreground/30 text-sm leading-relaxed">
              {channel.description || "The stage is quiet. There aren't any active broadcasts right now."}
            </p>
          </div>

          {canHost && (
            <div className="space-y-3 pt-2">
               <button 
                disabled={isLocked}
                onClick={() => setShowCreateModal(true)}
                className={`w-full py-2.5 font-bold rounded-xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm border border-white/20 ${
                  isLocked ? 'bg-foreground/10 dark:bg-zinc-800 text-foreground/20 dark:text-white/20' : 'bg-primary text-white'
                }`}
              >
                {isLocked ? <Lock size={20} /> : <Plus size={20} />}
                {isLocked ? 'Stage Locked' : 'Go Live Now'}
              </button>
              <p className="text-[10px] text-foreground/20 dark:text-white/10 uppercase tracking-[0.2em] font-bold">
                {isLocked ? 'Only admins can go live' : `Broadcast to members`}
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Create Stream Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-lg bg-background border border-foreground/10 dark:bg-[#0F0F11] dark:border-white/10 rounded-[3rem] p-10 overflow-hidden shadow-2xl"
            >
              {/* Glow effects */}
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-500/10 blur-[100px] pointer-events-none" />

              <div className="relative space-y-8 text-left">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center">
                    <Radio size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-foreground">Setup Stream</h3>
                    <p className="text-foreground/40 text-sm italic">Prepare your broadcast stage</p>
                  </div>
                </div>

                <form onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = {
                    title: (form.elements.namedItem('title') as HTMLInputElement).value,
                    type: (form.elements.namedItem('type') as HTMLSelectElement).value as any,
                    description: (form.elements.namedItem('description') as HTMLTextAreaElement).value,
                    price: Number((form.elements.namedItem('price') as HTMLInputElement)?.value || 0)
                  };
                  handleStartStream(data);
                }} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest pl-1">Stream Title</label>
                    <input 
                      name="title"
                      required
                      placeholder="e.g. Building a SaaS in 60 minutes"
                      className="w-full h-14 bg-foreground/5 border border-foreground/10 rounded-2xl px-6 text-foreground placeholder:text-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest pl-1">Broadcast Type</label>
                      <select 
                        name="type"
                        className="w-full h-14 bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded-2xl px-6 text-foreground dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer"
                      >
                        <option value="broadcast">Live Show</option>
                        <option value="webinar">Webinar/Lesson</option>
                        <option value="guest">Guest Panel</option>
                        <option value="paid">Premium Stream</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest pl-1">Premium Price (XP)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-foreground/20 dark:text-white/20" size={18} />
                        <input 
                          name="price"
                          type="number"
                          defaultValue={0}
                          className="w-full h-14 bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded-2xl pl-14 pr-6 text-foreground dark:text-white placeholder:text-foreground/20 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest pl-1">Description</label>
                    <textarea 
                      name="description"
                      rows={3}
                      placeholder="What should members expect?"
                      className="w-full bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded-2xl p-6 text-foreground dark:text-white placeholder:text-foreground/20 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 h-14 bg-foreground/5 dark:bg-white/5 text-foreground/60 dark:text-white/60 font-bold rounded-2xl hover:bg-foreground/10 dark:hover:bg-white/10 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={joining}
                      className="flex-[2] h-14 bg-primary text-white font-black rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      {joining ? <Loader2 className="animate-spin" /> : <Radio size={20} />}
                      Launch Broadcast
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
