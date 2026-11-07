import { useEffect, useState } from 'react';
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { MessageCircleQuestion, Pin, Send, ThumbsUp, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';
import { gainXP } from '../../lib/xp';

interface LiveQAProps {
  /** Event sessions pass `eventId`; community streams pass the stream document path. */
  eventId?: string;
  path?: string;
  isHost: boolean;
  /** When true, the audience can read but not ask new questions. */
  locked?: boolean;
}

/** Ask questions, upvote the ones you want answered; the host can pin and remove them. */
export default function LiveQA({ eventId, path, isHost, locked = false }: LiveQAProps) {
  const base = path ?? `eventSessions/${eventId}`;
  const [questions, setQuestions] = useState<any[]>([]);
  const [text, setText] = useState('');
  const me = auth.currentUser?.uid;

  useEffect(() => onSnapshot(query(collection(db, `${base}/questions`), orderBy('createdAt', 'desc')), snap => {
    setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data(), upvotes: d.data().upvotes || [] })));
  }, () => setQuestions([])), [base]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !auth.currentUser) return;
    setText('');
    try {
      await addDoc(collection(db, `${base}/questions`), {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Member',
        content: content.slice(0, 300),
        createdAt: new Date().toISOString(),
        isPinned: false,
        upvotes: [],
      });
      if (eventId) gainXP(auth.currentUser.uid, 'ask_question', eventId).catch(() => undefined);
    } catch {
      setText(content);
      toast.error("Couldn't send your question");
    }
  };

  const upvote = (q: any) => {
    if (!me) return;
    updateDoc(doc(db, `${base}/questions`, q.id), { upvotes: q.upvotes.includes(me) ? arrayRemove(me) : arrayUnion(me) }).catch(() => toast.error("Couldn't vote"));
  };

  const sorted = [...questions].sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned) || b.upvotes.length - a.upvotes.length);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sorted.map(q => {
          const mine = q.upvotes.includes(me);
          return (
            <div key={q.id} className={`p-3 rounded-2xl border ${q.isPinned ? 'border-primary/40 bg-primary/5' : 'border-foreground/10'}`}>
              <div className="flex items-center gap-1.5 text-xs text-foreground/55">
                <span className="font-semibold text-foreground/80">{q.userName}</span>
                {q.isPinned && <span className="flex items-center gap-0.5 text-primary"><Pin size={11} className="fill-current" /> Pinned</span>}
                <span className="ml-auto">{new Date(q.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed">{q.content}</p>
              <div className="mt-2 flex items-center gap-1">
                <button onClick={() => upvote(q)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${mine ? 'bg-primary/10 border-primary/40 text-primary' : 'border-foreground/15 text-foreground/60 hover:bg-foreground/5'}`}>
                  <ThumbsUp size={12} /> {q.upvotes.length}
                </button>
                {isHost && (
                  <>
                    <button onClick={() => updateDoc(doc(db, `${base}/questions`, q.id), { isPinned: !q.isPinned })} aria-label={q.isPinned ? 'Unpin' : 'Pin'} className={`ml-auto p-1.5 rounded-full hover:bg-foreground/5 ${q.isPinned ? 'text-primary' : 'text-foreground/45'}`}><Pin size={14} /></button>
                    <button onClick={() => deleteDoc(doc(db, `${base}/questions`, q.id))} aria-label="Remove" className="p-1.5 rounded-full text-foreground/45 hover:text-red-500 hover:bg-red-500/5"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {questions.length === 0 && (
          <div className="py-12 text-center text-foreground/50">
            <MessageCircleQuestion size={28} className="mx-auto opacity-50" />
            <p className="mt-2 text-sm">No questions yet. Ask the first one.</p>
          </div>
        )}
      </div>
      <form onSubmit={ask} className="shrink-0 p-3 border-t border-foreground/10 flex items-center gap-2">
        <input value={text} maxLength={300} onChange={e => setText(e.target.value)} disabled={locked} placeholder={locked ? 'Questions are paused' : 'Ask a question'} className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-foreground/5 border border-transparent focus:border-primary outline-none text-sm disabled:opacity-50" />
        <button type="submit" disabled={!text.trim() || locked} aria-label="Send" className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-30"><Send size={16} /></button>
      </form>
      {locked && <p className="shrink-0 pb-3 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-faint">Q&amp;A paused by the host</p>}
    </div>
  );
}
