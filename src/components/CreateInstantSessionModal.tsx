import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Search, Share2, ArrowRight, Loader2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc, doc, serverTimestamp, getDoc, writeBatch, increment } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { createNotification } from '../lib/notifications';

interface CreateInstantSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateInstantSessionModal({ isOpen, onClose }: CreateInstantSessionModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Title, 2: Invite
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && step === 2) {
      const fetchFriends = async () => {
        if (!auth.currentUser) return;
        setFriendsLoading(true);
        try {
          const followingSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'following'));
          const followingIds = followingSnap.docs.map(d => d.id);

          if (followingIds.length === 0) {
            setFriends([]);
            return;
          }

          const userPromises = followingIds.map(async (id) => {
            const userDoc = await getDoc(doc(db, 'users', id));
            return userDoc.exists() ? { id: userDoc.id, ...userDoc.data() } : null;
          });

          const users = await Promise.all(userPromises);
          setFriends(users.filter(u => u !== null));
        } catch (error) {
          console.error("Error fetching friends:", error);
        } finally {
          setFriendsLoading(false);
        }
      };
      fetchFriends();
    }
  }, [isOpen, step]);

  const handleStartSession = async () => {
    if (!auth.currentUser || !title.trim()) return;
    setLoading(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 60000);

      const eventData = {
        title: title.trim(),
        description: 'Instant live session',
        hostId: auth.currentUser.uid,
        eventType: 'user',
        type: 'instant',
        visibility: 'unlisted',
        startDate: now.toISOString(),
        endDate: expiresAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        status: 'live',
        category: 'Community',
        banner: `https://picsum.photos/seed/${Math.random()}/1200/600`,
        onlineType: 'internal',
        createdAt: serverTimestamp(),
        attendeeCount: 0,
        isInstant: true,
        expiresAt: expiresAt.toISOString()
      };

      const docRef = await addDoc(collection(db, 'events'), eventData);
      const eventId = docRef.id;

      if (selectedFriends.length > 0) {
        toast.loading('Sending invitations...', { id: 'invites' });
        const inviteMessage = `Hey! I just started an instant live session: "${title.trim()}". Join me here: ${window.location.origin}/live/${eventId}`;
        
        for (const friendId of selectedFriends) {
          const conversationId = [auth.currentUser.uid, friendId].sort().join('_');
          const convRef = doc(db, 'conversations', conversationId);
          const convDoc = await getDoc(convRef);

          const batch = writeBatch(db);
          
          if (!convDoc.exists()) {
            batch.set(convRef, {
              participants: [auth.currentUser.uid, friendId],
              lastMessage: inviteMessage,
              lastMessageAt: serverTimestamp(),
              unreadCount: { [friendId]: 1, [auth.currentUser.uid]: 0 }
            });
          } else {
            batch.update(convRef, {
              lastMessage: inviteMessage,
              lastMessageAt: serverTimestamp(),
              [`unreadCount.${friendId}`]: increment(1)
            });
          }

          const messageRef = doc(collection(db, 'conversations', conversationId, 'messages'));
          batch.set(messageRef, {
            senderId: auth.currentUser.uid,
            receiverId: friendId,
            content: inviteMessage,
            createdAt: serverTimestamp(),
            read: false,
            conversationId
          });

          await batch.commit();

          await createNotification({
            recipientId: friendId,
            senderId: auth.currentUser.uid,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            type: 'message',
            content: 'invited you to an instant session',
            relatedId: eventId
          });
        }
        toast.success('Invitations sent!', { id: 'invites' });
      }

      toast.success('Session started!');
      navigate(`/live/${eventId}`);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
    }
  };

  const filteredFriends = friends.filter(f => 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-background border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="text-yellow-400 fill-yellow-400" size={24} />
                Instant Session
              </h2>
              <p className="text-foreground/40 text-sm">Start a 30-minute live room</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <X size={24} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Session Title</label>
                  <input 
                    type="text"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What are we talking about?"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 outline-none focus:border-primary transition-all text-lg font-bold"
                  />
                </div>

                <div className="p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/20">
                  <div className="flex gap-3">
                    <Zap size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/60 leading-relaxed">
                      Instant sessions are fast, public, and automatically end after <span className="text-yellow-500 font-bold">30 minutes</span> to keep things energetic!
                    </p>
                  </div>
                </div>

                <button
                  disabled={!title.trim()}
                  onClick={() => setStep(2)}
                  className="w-full bg-foreground text-background py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-foreground/90 transition-all disabled:opacity-50"
                >
                  Continue to Invites
                  <ArrowRight size={20} />
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
                  <input 
                    type="text"
                    placeholder="Search followers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary transition-all text-sm"
                  />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {friendsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="animate-spin text-primary" size={24} />
                    </div>
                  ) : filteredFriends.length > 0 ? (
                    filteredFriends.map(friend => (
                      <button
                        key={friend.id}
                        onClick={() => {
                          setSelectedFriends(prev => 
                            prev.includes(friend.id) 
                              ? prev.filter(id => id !== friend.id)
                              : [...prev, friend.id]
                          );
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all border ${
                          selectedFriends.includes(friend.id) 
                            ? 'bg-primary/20 border-primary/50' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/10">
                            <img src={friend.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.id}`} alt="" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-bold">{friend.displayName || friend.username}</p>
                            <p className="text-[10px] text-foreground/40">@{friend.username}</p>
                          </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedFriends.includes(friend.id) ? 'bg-primary border-primary text-white' : 'border-white/20'
                        }`}>
                          {selectedFriends.includes(friend.id) && <Share2 size={12} />}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-10 text-foreground/30 italic text-sm">
                      No followers found to invite.
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 bg-white/5 text-white py-4 rounded-2xl font-bold hover:bg-white/10 transition-all border border-white/10 text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStartSession}
                    disabled={loading}
                    className="flex-[2] bg-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-[0_0_30px_rgba(var(--primary),0.3)] text-sm"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} fill="currentColor" />}
                    Start & Send {selectedFriends.length > 0 ? `(${selectedFriends.length})` : ''} Invites
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
