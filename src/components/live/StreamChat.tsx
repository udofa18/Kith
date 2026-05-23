import { useState, useEffect, useRef } from 'react';
import { 
  Send, Heart, Sparkles, Plus, Award, MoreVertical, Shield, 
  Trash2, Smile, Users as UsersIcon, X, MicOff, LogOut, ShieldAlert,
  MessageSquare
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  addDoc, 
  serverTimestamp,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useRemoteParticipants, useRoomContext } from '@livekit/components-react';

interface ChatMessage {
  id: string;
// ... (rest of imports and interface)
  userId: string;
  userName: string;
  userPhoto: string;
  content: string;
  createdAt: any;
  type?: 'text' | 'tip' | 'system';
  tipAmount?: number;
}

interface StreamChatProps {
  communityId: string;
  channelId: string;
  streamId: string;
  isHost: boolean;
}

export default function StreamChat({ communityId, channelId, streamId, isHost }: StreamChatProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const remoteParticipants = useRemoteParticipants();
  const room = useRoomContext();

  useEffect(() => {
    const q = query(
      collection(db, 'communities', communityId, 'channels', channelId, 'liveStreams', streamId, 'chat'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs.reverse());
    });

    return () => unsub();
  }, [communityId, channelId, streamId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || !auth.currentUser) return;

    const content = input.trim();
    setInput('');
    setShowEmoji(false);

    try {
      await addDoc(collection(db, 'communities', communityId, 'channels', channelId, 'liveStreams', streamId, 'chat'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'User',
        userPhoto: auth.currentUser.photoURL || '',
        content,
        createdAt: serverTimestamp(),
        type: 'text'
      });
    } catch (error) {
      console.error('Failed to send chat:', error);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'communities', communityId, 'channels', channelId, 'liveStreams', streamId, 'chat', msgId));
    } catch (error) {
       console.error('Failed to delete message:', error);
    }
  };

  const handleRemoteMute = (participantSid: string) => {
    const data = new TextEncoder().encode(JSON.stringify({ type: 'mute_request' }));
    room.localParticipant.publishData(data, { destinationIdentities: [participantSid] });
  };

  const handleKickParticipant = (participantSid: string) => {
    const data = new TextEncoder().encode(JSON.stringify({ type: 'kick_request' }));
    room.localParticipant.publishData(data, { destinationIdentities: [participantSid] });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header Tabs */}
      <div className="p-4 border-b border-foreground/5 dark:border-white/5 bg-foreground/5 dark:bg-black/20">
        <div className="flex p-1 bg-foreground/5 dark:bg-white/5 rounded-2xl">
          <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'chat' ? 'bg-primary text-white shadow-neon' : 'text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white'}`}
          >
            <MessageSquare size={14} />
            Chat
          </button>
          <button 
            onClick={() => setActiveTab('participants')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'participants' ? 'bg-primary text-white shadow-neon' : 'text-foreground/40 dark:text-white/40 hover:text-foreground dark:hover:text-white'}`}
          >
            <UsersIcon size={14} />
            Guests ({remoteParticipants.length + 1})
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'chat' ? (
          <motion.div 
            key="chat"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Messages */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
            >
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div
                    layout
                    key={msg.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`group flex gap-3 ${msg.type === 'tip' ? 'p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20' : ''}`}
                  >
                    <img 
                      src={(msg.userPhoto && msg.userPhoto.trim() !== '') ? msg.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userId}`} 
                      className="w-10 h-10 rounded-xl object-cover bg-foreground/5 dark:bg-zinc-800" 
                      alt="" 
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-foreground/90 dark:text-white/90 truncate max-w-[120px]">{msg.userName}</span>
                          {msg.type === 'tip' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-[8px] font-black text-black">TOP DONOR</span>
                          )}
                        </div>
                        <span className="text-[10px] text-foreground/20 dark:text-white/20 font-medium">
                          {msg.createdAt && format(msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(), 'HH:mm')}
                        </span>
                      </div>
                      <p className={`text-sm leading-relaxed ${msg.type === 'tip' ? 'text-amber-600 dark:text-amber-200 font-bold' : 'text-foreground/60 dark:text-white/60'}`}>
                        {msg.content}
                      </p>
                      {msg.tipAmount && (
                        <div className="mt-2 flex items-center gap-2 text-amber-500 text-xs font-black">
                          < Award size={14} />
                          GIFTED {msg.tipAmount} XP
                        </div>
                      )}
                    </div>

                    {isHost && (
                      <button 
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-foreground/5 dark:hover:bg-white/5 rounded-lg text-foreground/20 dark:text-white/20 hover:text-rose-500 transition-all self-start"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Input */}
            <div className="p-6 border-t border-foreground/5 dark:border-white/5 bg-foreground/2 dark:bg-black/40 relative">
              <form onSubmit={handleSendMessage} className="space-y-4">
                <div className="relative group">
                  <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onFocus={() => setShowEmoji(false)}
                    placeholder="Send a message..."
                    className="w-full h-14 bg-foreground/5 dark:bg-white/5 border border-foreground/10 dark:border-white/10 rounded-2xl px-14 text-sm text-foreground dark:text-white placeholder:text-foreground/20 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                  
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button 
                      type="button"
                      onClick={() => setShowEmoji(!showEmoji)}
                      className={`p-2 rounded-xl transition-all ${showEmoji ? 'bg-primary text-white' : 'text-foreground/20 dark:text-white/20 hover:text-foreground dark:hover:text-white hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                    >
                      <Smile size={20} />
                    </button>
                  </div>

                  <button 
                    type="submit"
                    disabled={!input.trim()}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-all disabled:opacity-30 disabled:scale-95"
                  >
                    <Send size={20} />
                  </button>
                </div>
                
                <div className="flex items-center justify-between px-2">
                  <div className="flex gap-2">
                    <button type="button" className="text-foreground/20 dark:text-white/20 hover:text-primary transition-colors"><Sparkles size={16} /></button>
                    <button type="button" className="text-foreground/20 dark:text-white/20 hover:text-rose-500 transition-colors"><Heart size={16} /></button>
                  </div>
                  <p className="text-[10px] text-foreground/20 dark:text-white/20 font-bold uppercase tracking-wider">Press Enter to send</p>
                </div>
              </form>

              {showEmoji && (
                <div className="absolute bottom-full right-6 mb-4 z-50">
                  <div className="shadow-2xl border border-foreground/10 dark:border-white/10 rounded-3xl overflow-hidden">
                    <EmojiPicker 
                      theme={Theme.AUTO} 
                      onEmojiClick={(emojiData) => setInput(prev => prev + emojiData.emoji)}
                      lazyLoadEmojis={true}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="participants"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide"
          >
            <div className="space-y-6">
              <h4 className="text-[10px] font-black text-foreground/40 dark:text-white/40 uppercase tracking-[0.2em] mb-4">Host</h4>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-foreground/5 dark:bg-white/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border border-primary/30 overflow-hidden">
                    <img src={(auth.currentUser?.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`} alt="" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground dark:text-white">{auth.currentUser?.displayName}</p>
                    <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Stream Host</p>
                  </div>
                </div>
              </div>

              <h4 className="text-[10px] font-black text-foreground/40 dark:text-white/40 uppercase tracking-[0.2em] mt-8 mb-4">Guests ({remoteParticipants.length})</h4>
              <div className="space-y-3">
                {remoteParticipants.map(p => (
                  <div key={p.sid} className="flex items-center justify-between p-4 rounded-2xl bg-foreground/5 dark:bg-white/5 border border-foreground/5 dark:border-white/5 group hover:border-foreground/20 dark:hover:border-white/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full border border-foreground/10 dark:border-white/10 overflow-hidden bg-foreground/5 dark:bg-zinc-800 font-bold flex items-center justify-center text-xs text-foreground/20 dark:text-white/20">
                        {p.identity.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-foreground dark:text-white">{p.name || p.identity}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-foreground/40 dark:text-white/40 font-bold uppercase tracking-widest">Guest</span>
                          {p.isSpeaking && <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />}
                          {!p.isMicrophoneEnabled && <MicOff size={10} className="text-rose-500" />}
                        </div>
                      </div>
                    </div>

                    {isHost && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => handleRemoteMute(p.identity)}
                          className="p-2 hover:bg-foreground/10 dark:hover:bg-white/10 rounded-lg text-foreground/40 dark:text-white/40 hover:text-amber-500 transition-all"
                          title="Mute Participant"
                        >
                          <MicOff size={16} />
                        </button>
                        <button 
                          onClick={() => handleKickParticipant(p.identity)}
                          className="p-2 hover:bg-foreground/10 dark:hover:bg-white/10 rounded-lg text-foreground/40 dark:text-white/40 hover:text-rose-500 transition-all"
                          title="Kick Participant"
                        >
                          <LogOut size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {remoteParticipants.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center gap-4 text-foreground/20 dark:text-white/20">
                    <UsersIcon size={48} strokeWidth={1} />
                    <p className="text-xs font-bold uppercase tracking-widest">No guests yet</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
