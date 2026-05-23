import { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, MessageCircle } from 'lucide-react';
import { formatDate } from '../lib/utils';
import AnimatedEmojiRenderer, { isSoloEmoji } from './AnimatedEmojiRenderer';
import SafeAnimatedEmoji from './SafeAnimatedEmoji';

interface ThreadSidebarProps {
  communityId: string;
  channelId: string;
  parentMessageId: string;
  onClose: () => void;
  currentUserProfile: any;
}

export default function ThreadSidebar({ 
  communityId, 
  channelId, 
  parentMessageId, 
  onClose,
  currentUserProfile 
}: ThreadSidebarProps) {
  const [parentMessage, setParentMessage] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [newReply, setNewReply] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus input on mount
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Fetch parent message
    const fetchParent = async () => {
      const docRef = doc(db, 'communities', communityId, 'channels', channelId, 'messages', parentMessageId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setParentMessage({ id: snap.id, ...snap.data() });
      }
    };
    fetchParent();

    // Listen for replies (any message with threadId matching parentId)
    const q = query(
      collection(db, 'communities', communityId, 'channels', channelId, 'messages'),
      where('threadId', '==', parentMessageId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReplies(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [communityId, channelId, parentMessageId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [replies]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReply.trim() || !auth.currentUser) return;

    const content = newReply.trim();
    // Optimistic UI: Clear input immediately
    setNewReply('');

    try {
      const sendAction = async () => {
        await addDoc(collection(db, 'communities', communityId, 'channels', channelId, 'messages'), {
          authorUid: auth.currentUser!.uid,
          authorName: currentUserProfile?.displayName || auth.currentUser!.displayName || 'Anonymous',
          authorPhoto: currentUserProfile?.profileImage || auth.currentUser!.photoURL,
          content: content,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          threadId: parentMessageId,
          isThreadRoot: false
        });
      };
      
      sendAction().catch(error => {
        console.error("Error sending reply:", error);
        setNewReply(content); // Restore if failed
      });
    } catch (error) {
      console.error("Error sending reply:", error);
    }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-background border-l border-foreground/10 z-[60] flex flex-col shadow-2xl"
    >
      <div className="p-4 border-b border-foreground/5 flex items-center justify-between bg-foreground/2">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-primary" />
          <h3 className="font-bold text-sm">Thread</h3>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-foreground/5 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {/* Parent Message */}
        {parentMessage && (
          <div className="pb-6 border-b border-foreground/5">
            <div className="flex gap-3">
              <img 
                src={(parentMessage.authorPhoto && parentMessage.authorPhoto.trim() !== '') ? parentMessage.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${parentMessage.authorUid}`}
                className="w-10 h-10 rounded-full"
                alt=""
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm">{parentMessage.authorName}</span>
                  <span className="text-[10px] text-foreground/20">
                    {formatDate(parentMessage.createdAt, 'HH:mm')}
                  </span>
                </div>
                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {(() => {
                    const solo = isSoloEmoji(parentMessage.content);
                    if (solo?.type === 'animated') {
                      return (
                        <div className="w-32 h-32 my-2">
                          <SafeAnimatedEmoji emoji={solo.value as any} />
                        </div>
                      );
                    }
                    if (solo?.type === 'standard') {
                      return (
                        <div className="text-5xl my-3 leading-none">
                          {solo.value}
                        </div>
                      );
                    }
                    return <AnimatedEmojiRenderer content={parentMessage.content} />;
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Replies */}
        <div className="space-y-4">
          {replies.map((reply) => (
            <div key={reply.id} className="flex gap-3">
              <img 
                src={(reply.authorPhoto && reply.authorPhoto.trim() !== '') ? reply.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.authorUid}`}
                className="w-8 h-8 rounded-full" 
                alt=""
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-xs">{reply.authorName}</span>
                  <span className="text-[9px] text-foreground/20">
                    {formatDate(reply.createdAt, 'HH:mm')}
                  </span>
                </div>
                <div className="text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap">
                  {(() => {
                    const solo = isSoloEmoji(reply.content);
                    if (solo?.type === 'animated') {
                      return (
                        <div className="w-24 h-24 my-1">
                          <SafeAnimatedEmoji emoji={solo.value as any} />
                        </div>
                      );
                    }
                    if (solo?.type === 'standard') {
                      return (
                        <div className="text-4xl my-2 leading-none">
                          {solo.value}
                        </div>
                      );
                    }
                    return <AnimatedEmojiRenderer content={reply.content} />;
                  })()}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-center p-4">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-foreground/2 border-t border-foreground/5">
        <form onSubmit={handleSendReply} className="flex items-center gap-2 bg-foreground/5 rounded-xl border border-foreground/10 px-3 py-2">
          <input 
            type="text"
            ref={inputRef}
            value={newReply}
            onChange={(e) => setNewReply(e.target.value)}
            placeholder="Reply to thread..."
            className="flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-foreground/20"
          />
          <button type="submit" disabled={!newReply.trim()} className="text-primary hover:scale-110 transition-transform disabled:opacity-20">
            <Send size={18} />
          </button>
        </form>
      </div>
    </motion.div>
  );
}
