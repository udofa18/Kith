import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, startAfter, updateDoc, where, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { formatDistanceToNowStrict } from 'date-fns';
import { CheckCircle2, Heart, Loader2, MoreHorizontal, Send, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { createNotification } from '../../lib/notifications';
import { updateDailyStats } from '../../lib/stats';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { trackEngagement } from '../../features/feed/signals/tracker';
import UserHoverCard from '../UserHoverCard';
import VerifiedBadge from '../VerifiedBadge';
import ConfirmModal from '../ConfirmModal';
import Avatar from '../ui/Avatar';

const PAGE_SIZE = 10;
const HELPFUL_XP = 15;

interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  authorUsername?: string;
  authorPhoto?: string;
  content: string;
  createdAt: any;
  likesCount?: number;
  repliesCount?: number;
  replyToId?: string | null;
  helpful?: boolean;
}

interface CommentThreadProps {
  post: { id: string; authorUid: string; kind?: string; communityId?: string; hashtags?: string[]; tags?: string[] };
  collectionName: string;
  autoFocus?: boolean;
}

function timeAgo(value: any): string {
  const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : value ? new Date(value) : new Date();
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return 'now';
  return formatDistanceToNowStrict(date).replace(/ (\w)\w*$/, '$1').replace(' ', '');
}

/** Comments for a post: list, replies (one level deep), composer, likes, and "helpful" for feedback posts. */
export default function CommentThread({ post, collectionName, autoFocus = false }: CommentThreadProps) {
  const me = useCurrentUser();
  const uid: string | null = me?.uid ?? null;
  const commentsRef = collection(db, collectionName, post.id, 'comments');

  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replies, setReplies] = useState<Record<string, Comment[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [toDelete, setToDelete] = useState<Comment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Top-level comments, newest first. Readable by everyone, signed in or not.
  useEffect(() => {
    const q = query(commentsRef, where('replyToId', '==', null), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    return onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
      setCursor(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLoaded(true);
    }, err => {
      console.warn('Comments failed to load:', err);
      setLoaded(true);
    });
  }, [collectionName, post.id]);

  // Which visible comments the viewer has liked.
  useEffect(() => {
    if (!uid) return;
    const all = [...comments, ...Object.values(replies).flat()].filter(c => liked[c.id] === undefined);
    if (all.length === 0) return;
    Promise.all(all.map(c => getDoc(doc(commentsRef, c.id, 'likes', uid)).then(s => [c.id, s.exists()] as const)))
      .then(entries => setLiked(prev => ({ ...prev, ...Object.fromEntries(entries) })))
      .catch(() => { /* like state is cosmetic */ });
  }, [uid, comments, replies]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Grow the composer with its content.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const snap = await getDocs(query(commentsRef, where('replyToId', '==', null), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
      setComments(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment))]);
      setCursor(snap.docs[snap.docs.length - 1] ?? cursor);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${post.id}/comments`);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleReplies = async (parentId: string) => {
    if (expanded.has(parentId)) {
      setExpanded(prev => { const n = new Set(prev); n.delete(parentId); return n; });
      return;
    }
    setExpanded(prev => new Set(prev).add(parentId));
    if (replies[parentId]) return;
    setLoadingReplies(prev => new Set(prev).add(parentId));
    try {
      const snap = await getDocs(query(commentsRef, where('replyToId', '==', parentId), orderBy('createdAt', 'asc')));
      setReplies(prev => ({ ...prev, [parentId]: snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment)) }));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${post.id}/comments`);
    } finally {
      setLoadingReplies(prev => { const n = new Set(prev); n.delete(parentId); return n; });
    }
  };

  const startReply = (comment: Comment) => {
    // Replies stay one level deep: replying to a reply attaches to its parent.
    const parentId = comment.replyToId || comment.id;
    const parent = comments.find(c => c.id === parentId) ?? comment;
    setReplyTo(parent);
    const handle = comment.authorUsername || comment.authorName.replace(/\s+/g, '_').toLowerCase();
    setText(comment.authorUid === uid ? '' : `@${handle} `);
    setTimeout(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 50);
  };

  const submit = async () => {
    if (!auth.currentUser || !uid) return toast.error('Sign in to comment');
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    const authorName = me?.displayName || auth.currentUser.displayName || 'Anonymous';
    const authorUsername = me?.username || auth.currentUser.email?.split('@')[0] || 'user';
    const authorPhoto = me?.profileImage || auth.currentUser.photoURL || '';
    try {
      const data = {
        authorUid: uid, authorName, authorUsername, authorPhoto, content,
        createdAt: serverTimestamp(), likesCount: 0, repliesCount: 0, replyToId: replyTo?.id ?? null,
      };
      const ref = await addDoc(commentsRef, data);
      await updateDoc(doc(db, collectionName, post.id), { commentsCount: increment(1) });

      if (replyTo) {
        await updateDoc(doc(commentsRef, replyTo.id), { repliesCount: increment(1) });
        const reply = { id: ref.id, ...data, createdAt: new Date() } as Comment;
        setReplies(prev => ({ ...prev, [replyTo.id]: [...(prev[replyTo.id] ?? []), reply] }));
        setExpanded(prev => new Set(prev).add(replyTo.id));
        setComments(prev => prev.map(c => (c.id === replyTo.id ? { ...c, repliesCount: (c.repliesCount ?? 0) + 1 } : c)));
      }

      const recipientId = replyTo ? replyTo.authorUid : post.authorUid;
      if (recipientId !== uid) {
        createNotification({
          recipientId, senderId: uid, senderName: authorName, senderUsername: authorUsername, senderPhoto: authorPhoto,
          type: 'comment', content: replyTo ? 'replied to your comment' : 'commented on your post', relatedId: post.id,
        }).catch(console.error);
      }
      updateDoc(doc(db, 'users', uid), { xp: increment(1) }).catch(console.error);
      if (post.communityId) {
        updateDailyStats(post.communityId, 'xpAwarded', 1).catch(console.error);
        updateDoc(doc(db, 'communities', post.communityId, 'members', uid), { xp: increment(1) }).catch(console.error);
      }
      trackEngagement(uid, 'comment', { id: post.id, authorUid: post.authorUid, hashtags: post.hashtags, tags: post.tags });

      setText('');
      setReplyTo(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${collectionName}/${post.id}/comments`);
    } finally {
      setSending(false);
    }
  };

  const toggleLike = async (comment: Comment) => {
    if (!uid) return toast.error('Sign in to like comments');
    const was = !!liked[comment.id];
    const delta = was ? -1 : 1;
    const bump = (list: Comment[]) => list.map(c => (c.id === comment.id ? { ...c, likesCount: Math.max(0, (c.likesCount ?? 0) + delta) } : c));
    setLiked(prev => ({ ...prev, [comment.id]: !was }));
    setComments(bump);
    setReplies(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, bump(v)])));
    try {
      const likeRef = doc(commentsRef, comment.id, 'likes', uid);
      if (was) await deleteDoc(likeRef);
      else await setDoc(likeRef, { createdAt: serverTimestamp(), userId: uid, postId: post.id, commentId: comment.id });
      await updateDoc(doc(commentsRef, comment.id), { likesCount: increment(delta) });
    } catch (error) {
      setLiked(prev => ({ ...prev, [comment.id]: was }));
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${post.id}/comments/${comment.id}`);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const target = toDelete;
    try {
      await deleteDoc(doc(commentsRef, target.id));
      await updateDoc(doc(db, collectionName, post.id), { commentsCount: increment(-1) });
      if (target.replyToId) {
        await updateDoc(doc(commentsRef, target.replyToId), { repliesCount: increment(-1) }).catch(() => {});
        setReplies(prev => ({ ...prev, [target.replyToId!]: (prev[target.replyToId!] ?? []).filter(r => r.id !== target.id) }));
        setComments(prev => prev.map(c => (c.id === target.replyToId ? { ...c, repliesCount: Math.max(0, (c.repliesCount ?? 1) - 1) } : c)));
      } else {
        setComments(prev => prev.filter(c => c.id !== target.id));
      }
      setToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${post.id}/comments/${target.id}`);
    } finally {
      setDeleting(false);
    }
  };

  /** Feedback requests: the post author rewards a useful comment. */
  const markHelpful = async (comment: Comment) => {
    if (!uid || uid !== post.authorUid || comment.helpful) return;
    try {
      await updateDoc(doc(commentsRef, comment.id), { helpful: true });
      setComments(prev => prev.map(c => (c.id === comment.id ? { ...c, helpful: true } : c)));
      await updateDoc(doc(db, 'users', comment.authorUid), { xp: increment(HELPFUL_XP) });
      await createNotification({
        recipientId: comment.authorUid, senderId: uid,
        senderName: me?.displayName || 'Someone', senderPhoto: me?.profileImage || '',
        type: 'xp_gift', content: `marked your feedback as helpful (+${HELPFUL_XP} XP)`, relatedId: post.id,
      });
      toast.success(`Marked helpful. ${comment.authorName} earned ${HELPFUL_XP} XP.`);
    } catch (error) {
      console.error('Mark helpful failed:', error);
      toast.error("Couldn't mark that comment. Try again.");
    }
  };

  const isFeedback = post.kind === 'feedback';
  // On feedback requests, the answers the author found helpful come first.
  const ordered = isFeedback ? [...comments].sort((a, b) => Number(!!b.helpful) - Number(!!a.helpful)) : comments;

  const renderComment = (comment: Comment, isReply = false) => (
    <CommentRow
      key={comment.id}
      comment={comment}
      isReply={isReply}
      isAuthor={comment.authorUid === post.authorUid}
      isMine={comment.authorUid === uid}
      liked={!!liked[comment.id]}
      canMarkHelpful={isFeedback && !isReply && uid === post.authorUid && comment.authorUid !== post.authorUid && !comment.helpful}
      showHelpful={isFeedback && !!comment.helpful}
      onLike={() => toggleLike(comment)}
      onReply={() => startReply(comment)}
      onDelete={() => setToDelete(comment)}
      onMarkHelpful={() => markHelpful(comment)}
    />
  );

  return (
    <div className="mt-3" onClick={e => e.stopPropagation()}>
      {/* Composer */}
      {uid ? (
        <div className="flex gap-3 py-2">
          <Avatar src={me?.profileImage || me?.photoURL} seed={uid} size={32} />
          <div className="flex-1 min-w-0">
            {replyTo && (
              <div className="flex items-center gap-1.5 mb-1.5 text-xs text-black/50 dark:text-white/50">
                Replying to <span className="font-medium text-primary">@{replyTo.authorUsername || replyTo.authorName}</span>
                <button onClick={() => { setReplyTo(null); setText(''); }} aria-label="Cancel reply" className="p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10">
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] border border-transparent focus-within:border-primary/60 focus-within:bg-transparent transition-colors pl-4 pr-1.5 py-1.5">
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
                  if (e.key === 'Escape' && replyTo) { setReplyTo(null); setText(''); }
                }}
                rows={1}
                maxLength={2000}
                placeholder={replyTo ? 'Write a reply…' : isFeedback ? 'Share your feedback…' : 'Add a comment…'}
                aria-label="Write a comment"
                className="flex-1 bg-transparent outline-none resize-none text-[15px] leading-relaxed py-1 max-h-40 placeholder:text-black/40 dark:placeholder:text-white/40"
              />
              <button
                onClick={submit}
                disabled={!text.trim() || sending}
                aria-label="Send"
                className="shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-30 transition-opacity"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Link
          to="/login"
          className="flex items-center justify-center py-2.5 my-2 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06] text-sm text-black/60 dark:text-white/60 hover:text-primary transition-colors"
        >
          Sign in to join the conversation
        </Link>
      )}

      {/* List */}
      {!loaded ? (
        <CommentSkeleton />
      ) : ordered.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">
          {isFeedback ? 'No feedback yet. Be the first to help.' : 'No comments yet. Start the conversation.'}
        </p>
      ) : (
        <ul className="pt-1">
          {ordered.map(comment => (
            <li key={comment.id}>
              {renderComment(comment)}
              {(comment.repliesCount ?? 0) > 0 && (
                <div className="ml-4 pl-7 border-l-2 border-black/[0.06] dark:border-white/[0.08]">
                  {expanded.has(comment.id) && (replies[comment.id] ?? []).map(r => renderComment(r, true))}
                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="flex items-center gap-2 py-1.5 text-[13px] font-medium text-black/50 dark:text-white/50 hover:text-primary transition-colors"
                  >
                    {loadingReplies.has(comment.id) && <Loader2 size={12} className="animate-spin" />}
                    {expanded.has(comment.id)
                      ? 'Hide replies'
                      : `View ${comment.repliesCount} ${comment.repliesCount === 1 ? 'reply' : 'replies'}`}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-2.5 mt-1 text-sm font-medium text-primary hover:bg-primary/5 rounded-xl transition-colors disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Show more comments'}
        </button>
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete comment"
        message="This comment will be removed for everyone."
        confirmText="Delete"
        loading={deleting}
      />
    </div>
  );
}

function CommentRow({ comment, isReply, isAuthor, isMine, liked, canMarkHelpful, showHelpful, onLike, onReply, onDelete, onMarkHelpful }: {
  comment: Comment;
  isReply: boolean;
  isAuthor: boolean;
  isMine: boolean;
  liked: boolean;
  canMarkHelpful: boolean;
  showHelpful: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
  onMarkHelpful: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const likes = comment.likesCount ?? 0;

  return (
    <div className={`group flex gap-3 py-2.5 ${showHelpful ? 'rounded-xl bg-emerald-500/[0.06] -mx-2 px-2' : ''}`}>
      <UserHoverCard userId={comment.authorUid}>
        <Link to={`/creators/${comment.authorUid}`} className="shrink-0">
          <Avatar src={comment.authorPhoto} seed={comment.authorUid} size={isReply ? 24 : 32} />
        </Link>
      </UserHoverCard>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm leading-tight">
          <Link to={`/creators/${comment.authorUid}`} className="font-semibold hover:underline truncate">{comment.authorName}</Link>
          <VerifiedBadge userId={comment.authorUid} />
          {isAuthor && <span className="px-1.5 py-px rounded-md bg-primary/10 text-primary text-[11px] font-medium">Author</span>}
          <span className="text-black/40 dark:text-white/40">· {timeAgo(comment.createdAt)}</span>
          {isMine && (
            <div className="relative ml-auto">
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Comment options"
                className="p-1 rounded-full text-black/40 dark:text-white/40 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0B0F1A] shadow-xl overflow-hidden" onMouseLeave={() => setMenuOpen(false)}>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-0.5 text-[15px] leading-relaxed text-black/85 dark:text-white/85 whitespace-pre-wrap break-words">
          {comment.content.split(/(@[\w.]+)/g).map((part, i) =>
            part.startsWith('@') ? <span key={i} className="text-primary">{part}</span> : part
          )}
        </p>

        <div className="mt-1 flex items-center gap-4 text-[13px] text-black/50 dark:text-white/50">
          <button
            onClick={onLike}
            aria-pressed={liked}
            className={`flex items-center gap-1 transition-colors ${liked ? 'text-rose-500' : 'hover:text-rose-500'}`}
          >
            <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
            {likes > 0 && <span className="tabular-nums">{likes}</span>}
          </button>
          <button onClick={onReply} className="font-medium hover:text-primary transition-colors">Reply</button>
          {showHelpful && (
            <span className="flex items-center gap-1 font-medium text-emerald-500">
              <CheckCircle2 size={14} /> Helpful
            </span>
          )}
          {canMarkHelpful && (
            <button onClick={onMarkHelpful} className="flex items-center gap-1 font-medium hover:text-emerald-500 transition-colors">
              <CheckCircle2 size={14} /> Mark helpful
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div aria-busy="true" className="animate-pulse">
      {[0, 1].map(i => (
        <div key={i} className="flex gap-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-3/4 rounded bg-black/5 dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
