import { useEffect, useRef, useState } from 'react';
import { collection, doc, increment, onSnapshot, updateDoc, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { motion } from 'motion/react';
import { MessageCircle, Send, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../firebase';
import { formatDate } from '../lib/utils';
import AnimatedEmojiRenderer, { isSoloEmoji } from './AnimatedEmojiRenderer';
import SafeAnimatedEmoji from './SafeAnimatedEmoji';
import Avatar from './ui/Avatar';

interface ThreadSidebarProps {
  communityId: string;
  channelId: string;
  parentMessageId: string;
  onClose: () => void;
  currentUserProfile: any;
  /** False when the channel is locked, the member is timed out, or they can't post. */
  canReply?: boolean;
  canModerate?: boolean;
}

function Body({ content, size }: { content: string; size: 'lg' | 'sm' }) {
  const solo = isSoloEmoji(content);
  if (solo?.type === 'animated') return <div className={size === 'lg' ? 'w-32 h-32 my-2' : 'w-24 h-24 my-1'}><SafeAnimatedEmoji emoji={solo.value as any} /></div>;
  if (solo?.type === 'standard') return <div className={`${size === 'lg' ? 'text-5xl' : 'text-4xl'} my-2 leading-none`}>{solo.value}</div>;
  return <AnimatedEmojiRenderer content={content} />;
}

export default function ThreadSidebar({ communityId, channelId, parentMessageId, onClose, currentUserProfile, canReply = true, canModerate = false }: ThreadSidebarProps) {
  const [parent, setParent] = useState<any>(null);
  const [parentGone, setParentGone] = useState(false);
  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = collection(db, 'communities', communityId, 'channels', channelId, 'messages');
  const me = auth.currentUser?.uid;

  useEffect(() => { if (canReply) inputRef.current?.focus(); }, [parentMessageId, canReply]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true); setParent(null); setParentGone(false);
    const unsubParent = onSnapshot(doc(messages, parentMessageId), snap => {
      if (snap.exists()) setParent({ id: snap.id, ...snap.data() }); else setParentGone(true);
    }, () => setParentGone(true));
    const unsubReplies = onSnapshot(query(messages, where('threadId', '==', parentMessageId), orderBy('createdAt', 'asc')), snap => {
      setReplies(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      setLoading(false);
    }, err => { console.error('Thread replies failed:', err); setLoading(false); });
    return () => { unsubParent(); unsubReplies(); };
  }, [communityId, channelId, parentMessageId]);

  // Threads that predate reply counts get their count filled in the first time someone opens them.
  const repaired = useRef('');
  useEffect(() => {
    if (!parent || loading || !canReply || replies.length === 0) return;
    if ((parent.replyCount || 0) === replies.length || repaired.current === `${parentMessageId}:${replies.length}`) return;
    repaired.current = `${parentMessageId}:${replies.length}`;
    const last = replies[replies.length - 1];
    updateDoc(doc(messages, parentMessageId), { replyCount: replies.length, lastReplyAt: last.createdAt ?? serverTimestamp(), lastReplyByName: last.authorName || '' }).catch(() => {});
  }, [parent?.replyCount, replies.length, loading, canReply]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [replies.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || !me || sending || !canReply) return;
    setSending(true);
    try {
      const name = currentUserProfile?.displayName || auth.currentUser?.displayName || 'Anonymous';
      const batch = writeBatch(db);
      batch.set(doc(messages), {
        authorUid: me, authorName: name,
        authorPhoto: currentUserProfile?.profileImage || auth.currentUser?.photoURL || '',
        content, createdAt: serverTimestamp(), threadId: parentMessageId, isThreadRoot: false,
      });
      // The parent carries the count, so the channel can show "3 replies" without loading the thread.
      batch.update(doc(messages, parentMessageId), { replyCount: increment(1), lastReplyAt: serverTimestamp(), lastReplyByName: name });
      await batch.commit();
      setDraft('');
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error("Couldn't send your reply");
    } finally {
      setSending(false);
    }
  };

  const remove = async (reply: any) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(messages, reply.id));
      // Threads started before counts existed can read 0 here; never push the count below zero.
      if ((parent?.replyCount || 0) > 0) batch.update(doc(messages, parentMessageId), { replyCount: increment(-1) });
      await batch.commit();
    } catch {
      toast.error("Couldn't delete that reply");
    }
  };

  const count = Math.max(replies.length, 0);

  return (
    <motion.aside
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      role="complementary" aria-label="Thread"
      className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-background border-l border-foreground/10 z-[60] flex flex-col shadow-2xl"
    >
      <div className="h-14 px-4 shrink-0 border-b border-foreground/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-primary" />
          <h3 className="font-semibold text-sm">Thread <span className="font-normal text-foreground/50">· {count} {count === 1 ? 'reply' : 'replies'}</span></h3>
        </div>
        <button onClick={onClose} aria-label="Close thread" className="p-2 -mr-2 hover:bg-foreground/5 rounded-full"><X size={18} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
        {parentGone && <p className="text-sm text-foreground/55">The message this thread belongs to was deleted.</p>}
        {parent && (
          <div className="pb-5 border-b border-foreground/10 flex gap-3">
            <Avatar src={parent.authorPhoto} seed={parent.authorUid || parent.id} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2"><span className="font-semibold text-sm">{parent.authorName}</span><span className="text-xs text-foreground/40">{formatDate(parent.createdAt, 'MMM d, HH:mm')}</span></p>
              <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap break-words"><Body content={parent.content || ''} size="lg" /></div>
            </div>
          </div>
        )}

        {loading && <div className="flex justify-center py-6"><span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}
        {!loading && replies.length === 0 && <p className="text-sm text-center text-foreground/50 py-6">No replies yet.{canReply ? ' Start the conversation.' : ''}</p>}

        <ul className="space-y-4">
          {replies.map(r => (
            <li key={r.id} className="group flex gap-3">
              <Avatar src={r.authorPhoto} seed={r.authorUid || r.id} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm">{r.authorName}</span>
                  <span className="text-xs text-foreground/40">{formatDate(r.createdAt, 'MMM d, HH:mm')}</span>
                  {(r.authorUid === me || canModerate) && (
                    <button onClick={() => remove(r)} aria-label="Delete reply" className="ml-auto p-1 rounded text-foreground/30 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"><Trash2 size={13} /></button>
                  )}
                </p>
                <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words"><Body content={r.content || ''} size="sm" /></div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={send} className="p-3 border-t border-foreground/10 shrink-0">
        {canReply ? (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef} value={draft} rows={1} maxLength={4000} aria-label="Reply in thread" placeholder="Reply…"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="flex-1 max-h-32 resize-none rounded-xl bg-foreground/5 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
            />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Send reply" className="p-2.5 rounded-xl bg-primary text-white disabled:opacity-40"><Send size={16} /></button>
          </div>
        ) : (
          <p className="text-sm text-center text-foreground/50 py-1">You can't reply in this channel right now.</p>
        )}
      </form>
    </motion.aside>
  );
}
