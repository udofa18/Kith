import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Send, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LiveChatProps {
  eventId: string;
}

export default function LiveChat({ eventId }: LiveChatProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setCurrentUserProfile(doc.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'eventSessions', eventId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    });

    return () => unsubscribe();
  }, [eventId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser) return;

    const content = newMessage;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'eventSessions', eventId, 'messages'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
        userPhoto: auth.currentUser.photoURL,
        content,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 border-l border-white/5">
      <div className="p-4 border-b border-white/5">
        <h3 className="font-bold text-sm uppercase tracking-widest text-white/50">Live Chat</h3>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden shrink-0">
              <img 
                src={(() => {
                  const candidate = (msg.userId === auth.currentUser?.uid ? currentUserProfile?.profileImage : null) || msg.userPhoto;
                  return (candidate && candidate.trim() !== '') ? candidate : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userId}`;
                })()} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                alt=""
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary">{msg.userName}</span>
                <span className="text-[10px] text-white/20">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-white/80">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-white/5">
        <div className="relative flex items-center gap-2">
          <input 
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-primary transition-all"
          />
          <button 
            type="submit"
            disabled={!newMessage.trim()}
            className="p-2 bg-primary text-white rounded-lg hover:scale-105 transition-all disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
