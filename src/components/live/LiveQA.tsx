import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { MessageSquare, ThumbsUp, Pin, Trash2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { gainXP } from '../../lib/xp';

interface LiveQAProps {
  eventId: string;
  isHost: boolean;
}

export default function LiveQA({ eventId, isHost }: LiveQAProps) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'eventSessions', eventId, 'questions'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setQuestions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !auth.currentUser) return;

    const content = newQuestion;
    setNewQuestion('');

    try {
      await addDoc(collection(db, 'eventSessions', eventId, 'questions'), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
        content,
        createdAt: new Date().toISOString(),
        isPinned: false,
        upvotes: []
      });
      await gainXP(auth.currentUser.uid, 'ask_question', eventId);
    } catch (error) {
      console.error('Error submitting question:', error);
    }
  };

  const handleUpvote = async (questionId: string) => {
    if (!auth.currentUser) return;
    const question = questions.find(q => q.id === questionId);
    const hasUpvoted = question.upvotes.includes(auth.currentUser.uid);

    try {
      await updateDoc(doc(db, 'eventSessions', eventId, 'questions', questionId), {
        upvotes: hasUpvoted ? arrayRemove(auth.currentUser.uid) : arrayUnion(auth.currentUser.uid)
      });
    } catch (error) {
      console.error('Error upvoting:', error);
    }
  };

  const handlePin = async (questionId: string) => {
    if (!isHost) return;
    const question = questions.find(q => q.id === questionId);
    try {
      await updateDoc(doc(db, 'eventSessions', eventId, 'questions', questionId), {
        isPinned: !question.isPinned
      });
    } catch (error) {
      console.error('Error pinning:', error);
    }
  };

  const handleDelete = async (questionId: string) => {
    if (!isHost) return;
    try {
      await deleteDoc(doc(db, 'eventSessions', eventId, 'questions', questionId));
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const sortedQuestions = [...questions].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.upvotes?.length || 0) - (a.upvotes?.length || 0);
  });

  return (
    <div className="flex flex-col h-full bg-black/40 border-l border-white/5">
      <div className="p-4 border-b border-white/5">
        <h3 className="font-bold text-sm uppercase tracking-widest text-white/50">Q&A</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {sortedQuestions.map((q) => (
          <div 
            key={q.id} 
            className={`glass p-4 rounded-2xl border transition-all ${
              q.isPinned ? 'border-primary bg-primary/5' : 'border-white/5'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/60">{q.userName}</span>
                {q.isPinned && <Pin size={12} className="text-primary fill-primary" />}
              </div>
              <div className="flex items-center gap-2">
                {isHost && (
                  <>
                    <button 
                      onClick={() => handlePin(q.id)}
                      className={`p-1 rounded hover:bg-white/5 transition-colors ${q.isPinned ? 'text-primary' : 'text-white/20'}`}
                    >
                      <Pin size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(q.id)}
                      className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-white/90 mb-4">{q.content}</p>
            <div className="flex items-center justify-between">
              <button 
                onClick={() => handleUpvote(q.id)}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  q.upvotes.includes(auth.currentUser?.uid) 
                    ? 'bg-primary text-white' 
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                <ThumbsUp size={12} /> {q.upvotes.length}
              </button>
              <span className="text-[10px] text-white/20">
                {new Date(q.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {questions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-white/20">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p className="text-sm">No questions yet</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-white/5">
        <div className="relative flex items-center gap-2">
          <input 
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-primary transition-all"
          />
          <button 
            type="submit"
            disabled={!newQuestion.trim()}
            className="p-2 bg-primary text-white rounded-lg hover:scale-105 transition-all disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
