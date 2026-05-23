import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Sparkles, ThumbsUp, Award, Zap } from 'lucide-react';
import { db, auth } from '../../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

interface Reaction {
  id: string;
  type: string;
  userId: string;
  x: number;
}

interface StreamEngagementProps {
  communityId: string;
  channelId: string;
  streamId: string;
}

const REACTION_TYPES = [
  { type: 'heart', icon: Heart, color: 'text-rose-500' },
  { type: 'sparkle', icon: Sparkles, color: 'text-amber-400' },
  { type: 'thumbsup', icon: ThumbsUp, color: 'text-sky-400' },
  { type: 'zap', icon: Zap, color: 'text-yellow-400' },
];

export default function StreamEngagement({ communityId, channelId, streamId }: StreamEngagementProps) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  
  // Listen for new reactions
  useEffect(() => {
    const q = query(
      collection(db, 'communities', communityId, 'channels', channelId, 'liveStreams', streamId, 'actions'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.type === 'reaction') {
            const id = change.doc.id;
            const x = Math.random() * 80 + 10; // 10% to 90% width
            setReactions(prev => [...prev.slice(-15), { id, type: data.value, userId: data.userId, x }]);
            
            // Clean up after 4 seconds
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== id));
            }, 4000);
          }
        }
      });
    });

    return () => unsub();
  }, [communityId, channelId, streamId]);

  const sendReaction = async (type: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'communities', communityId, 'channels', channelId, 'liveStreams', streamId, 'actions'), {
        userId: auth.currentUser.uid,
        type: 'reaction',
        value: type,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to send reaction:', e);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      {/* Floating animations */}
      <AnimatePresence>
        {reactions.map((r) => {
          const Icon = REACTION_TYPES.find(t => t.type === r.type)?.icon || Heart;
          const color = REACTION_TYPES.find(t => t.type === r.type)?.color || 'text-rose-500';

          return (
            <motion.div
              key={r.id}
              initial={{ y: 0, x: `${r.x}%`, opacity: 0, scale: 0.5 }}
              animate={{ y: -600, opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1.4, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 4, ease: "easeOut" }}
              className={`absolute bottom-32 left-0 ${color} drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]`}
            >
              <Icon size={44} fill="currentColor" />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Interaction Bar Overlay (Floating above controls) */}
      <div className="absolute bottom-32 right-8 pointer-events-auto flex flex-col items-center gap-3">
        <div className="flex flex-col gap-2 p-2 bg-white/5 backdrop-blur-3xl rounded-full border border-white/10 shadow-2xl">
          {REACTION_TYPES.map(({ type, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => sendReaction(type)}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-125 active:scale-95 group relative ${color} hover:bg-white/5`}
            >
               <Icon size={24} fill="currentColor" className="group-hover:drop-shadow-[0_0_8px_currentColor]" />
               {/* Small tooltip or count could go here */}
            </button>
          ))}
        </div>
        
        <button className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-neon hover:scale-110 active:scale-90 transition-all border border-white/20">
           <Award size={20} />
        </button>
      </div>
    </div>
  );
}
