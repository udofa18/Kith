import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, Ban, Info, MoreHorizontal, Phone, Pin, PinOff, UserRound, Video, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../../firebase';
import { useCall } from '../../contexts/CallContext';
import { playNotificationSound } from '../../lib/sounds';
import {
  getConversationStatus, isConversationAccepted, isFavourited, isIncomingRequest, isOutgoingRequest, unreadFor,
  type ConversationData,
} from '../../lib/messaging';
import Avatar from '../../components/ui/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import ConfirmModal from '../../components/ConfirmModal';
import {
  blockUser, deleteMessage, editMessage, fetchOlderMessages, followsEachOther, isTyping, markRead, presenceLabel,
  respondToRequest, sendAttachment, sendGift, sendText, setPinned, signalTyping, stopTyping, subscribeLatestMessages,
  toDate, toggleReaction, type Message, type Sender,
} from './api';
import { clock, dayLabel, nameOf, photoOf, sameDay } from './format';
import MessageBubble, { type GroupPosition } from './MessageBubble';
import Composer from './Composer';

const GROUP_GAP_MS = 5 * 60_000;

/** The open conversation. `conv.status` is undefined-safe; a draft (no messages yet) has `exists: false`. */
export default function ChatView({ me, conv, exists, onBack, onClosed, showDetails, onToggleDetails, onMessagesChange }: {
  me: Sender;
  conv: ConversationData;
  exists: boolean;
  onBack: () => void;
  onClosed: () => void;
  showDetails: boolean;
  onToggleDetails: () => void;
  /** Lets the details panel list shared photos and links. */
  onMessagesChange?: (messages: Message[]) => void;
}) {
  const { initiateCall } = useCall();
  const otherId = conv.participants.find(p => p !== me.uid) ?? me.uid;
  const [other, setOther] = useState<any>(conv.otherUser);
  const [latest, setLatest] = useState<Message[]>([]);
  const [older, setOlder] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loaded, setLoaded] = useState(!exists);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Message | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const [now, setNow] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastSeenId = useRef<string | null>(null);
  const restoreFrom = useRef<number | null>(null);

  const messages = useMemo(() => {
    const byId = new Map<string, Message>();
    for (const m of [...older, ...latest]) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => (a.createdAt?.getTime() ?? Infinity) - (b.createdAt?.getTime() ?? Infinity));
  }, [older, latest]);

  useEffect(() => { onMessagesChange?.(messages); }, [messages]);

  // Live profile of the other person (for "Active now").
  useEffect(() => onSnapshot(doc(db, 'users', otherId), s => s.exists() && setOther({ id: s.id, ...s.data() }), () => undefined), [otherId]);

  // Messages: live newest page, older pages on demand.
  useEffect(() => {
    setLatest([]); setOlder([]); setCursor(null); setHasMore(false); setReplyTo(null); setEditing(null);
    lastSeenId.current = null;
    atBottom.current = true;
    if (!exists) { setLoaded(true); return; }
    setLoaded(false);
    return subscribeLatestMessages(conv.id, (msgs, oldest, full) => {
      setLatest(msgs);
      setCursor(c => c ?? oldest);
      setHasMore(h => h || full);
      setLoaded(true);
    }, () => setLoaded(true));
  }, [conv.id, exists]);

  // Clock for typing / presence labels.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3000);
    return () => clearInterval(t);
  }, []);

  const incoming = exists && isIncomingRequest(conv, me.uid);
  const outgoing = exists && isOutgoingRequest(conv, me.uid);
  const accepted = !exists ? false : isConversationAccepted(conv);

  // Read receipts: mark read when new messages arrive while the chat is open and visible.
  useEffect(() => {
    if (!exists || incoming || !loaded) return;
    const lastFromOther = [...messages].reverse().find(m => m.senderId !== me.uid);
    if (!lastFromOther && !unreadFor(conv, me.uid)) return;
    if (document.visibilityState === 'visible') markRead(conv.id, me.uid);
  }, [messages.length, exists, incoming, loaded, conv.id]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && exists && !incoming) markRead(conv.id, me.uid); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [conv.id, exists, incoming]);

  // Stop the typing signal when leaving the chat.
  useEffect(() => () => stopTyping(conv.id, me.uid), [conv.id]);

  // Scroll: stick to the bottom for new messages, keep position when older ones load.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
      return;
    }
    const last = messages.at(-1);
    if (!last || last.id === lastSeenId.current) return;
    const firstLoad = lastSeenId.current === null;
    lastSeenId.current = last.id;
    if (firstLoad || atBottom.current || last.senderId === me.uid) {
      el.scrollTop = el.scrollHeight;
      setNewBelow(false);
    } else {
      setNewBelow(true);
      if (!last.pending) playNotificationSound();
    }
  }, [messages]);

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const page = await fetchOlderMessages(conv.id, cursor);
      restoreFrom.current = (scrollRef.current?.scrollHeight ?? 0) - (scrollRef.current?.scrollTop ?? 0);
      setOlder(prev => [...page.messages, ...prev]);
      setCursor(page.cursor);
      setHasMore(page.more);
    } finally {
      setLoadingOlder(false);
    }
  }, [cursor, loadingOlder, hasMore, conv.id]);

  const onScroll = () => {
    const el = scrollRef.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setNewBelow(false);
    if (el.scrollTop < 120) loadOlder();
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setNewBelow(false);
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(`message-${id}`);
    if (!el) return toast('That message is further back in the chat');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate([{ backgroundColor: 'rgba(124,58,237,0.15)' }, { backgroundColor: 'transparent' }], { duration: 1500 });
  };

  // Mutual follows skip the request step; shown as a hint on a brand-new chat.
  const { data: mutual } = useQuery({
    queryKey: ['dm-mutual', me.uid, otherId],
    queryFn: () => followsEachOther(me.uid, otherId),
    enabled: !exists,
    staleTime: 60_000,
  });

  const status = exists ? getConversationStatus(conv) : null;
  const myMessages = messages.filter(m => m.senderId === me.uid).length;
  const waiting = outgoing && myMessages >= 1;
  const canSend = !incoming && !waiting;
  const name = nameOf(other);
  const first = name.split(' ')[0];
  const typing = isTyping(conv, otherId, now);
  const presence = presenceLabel(other?.lastActiveAt, now);
  const pinned = isFavourited(conv, me.uid);

  const mutedByOther = !!conv.mutedBy?.includes(otherId);
  const send = (content: string) => sendText({ convId: conv.id, me, otherId, status, requestedBy: conv.requestedBy, content, replyTo, mutedByOther })
    .then(() => setReplyTo(null));
  const sendFile = (file: File, caption: string, onProgress: (p: number) => void) =>
    sendAttachment({ convId: conv.id, me, otherId, status, requestedBy: conv.requestedBy, file, caption, onProgress, mutedByOther }).then(() => setReplyTo(null));

  const lastMine = [...messages].reverse().find(m => m.senderId === me.uid);
  const otherReadAt = toDate(conv.readAt?.[otherId])?.getTime() ?? 0;

  const call = (media: 'voice' | 'video') => initiateCall(
    conv.id, [otherId], 'one-to-one', media,
    { name: me.name, photo: me.photo },
    { [otherId]: { displayName: name, photoURL: photoOf(other) } },
  ).catch(() => toast.error("Couldn't start the call"));

  const block = async () => {
    setConfirmBlock(false);
    try {
      await blockUser(me.uid, otherId);
      if (incoming) await respondToRequest(conv.id, false);
      toast.success(`${first} is blocked`);
      onClosed();
    } catch {
      toast.error("Couldn't block");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="relative z-30 shrink-0 flex items-center gap-2 px-2 sm:px-3 h-[60px] border-b border-black/10 dark:border-white/10 bg-background/90 backdrop-blur-md">
        <button onClick={onBack} aria-label="Back" className="md:hidden p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><ArrowLeft size={20} /></button>
        <Link to={`/creators/${otherId}`} className="flex items-center gap-2.5 min-w-0 rounded-xl pr-2">
          <span className="relative shrink-0">
            <Avatar src={photoOf(other)} seed={otherId} size={38} />
            {presence === 'Active now' && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-background" />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-semibold leading-tight truncate">{name}<VerifiedBadge verified={!!other?.verified} /></span>
            <span className={`block text-xs truncate ${typing ? 'text-primary' : 'text-black/50 dark:text-white/50'}`}>
              {typing ? 'typing…' : incoming ? 'Message request' : waiting ? 'Request sent' : presence || (other?.username ? `@${other.username}` : '')}
            </span>
          </span>
        </Link>
        <div className="ml-auto flex items-center">
          {accepted && (
            <>
              <HeaderButton label="Voice call" onClick={() => call('voice')}><Phone size={18} /></HeaderButton>
              <HeaderButton label="Video call" onClick={() => call('video')}><Video size={19} /></HeaderButton>
            </>
          )}
          <HeaderButton label="Details" active={showDetails} onClick={onToggleDetails}><Info size={19} /></HeaderButton>
          <div className="relative">
            <HeaderButton label="More" onClick={() => setMenuOpen(o => !o)}><MoreHorizontal size={19} /></HeaderButton>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-52 py-1.5 rounded-2xl bg-background border border-black/10 dark:border-white/15 shadow-xl text-sm">
                  {exists && (
                    <button onClick={() => { setMenuOpen(false); setPinned(conv.id, me.uid, !pinned, conv.favouritedBy); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                      {pinned ? <PinOff size={16} /> : <Pin size={16} />} {pinned ? 'Unpin chat' : 'Pin chat'}
                    </button>
                  )}
                  <Link to={`/creators/${otherId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                    <UserRound size={16} /> View profile
                  </Link>
                  <button onClick={() => { setMenuOpen(false); setConfirmBlock(true); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-red-500 hover:bg-red-500/5">
                    <Ban size={16} /> Block {first}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      {/* z-0 keeps bubble layers (reactions, action bars) below the header menu. */}
      <div className="relative z-0 flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScroll} onClick={() => setActionsFor(null)} className="h-full overflow-y-auto overflow-x-hidden px-3 sm:px-5 pb-3">
          {loadingOlder && <div className="py-3 flex justify-center"><span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}

          {(!hasMore || !exists) && loaded && (
            <div className="pt-8 pb-4 flex flex-col items-center text-center">
              <Avatar src={photoOf(other)} seed={otherId} size={72} />
              <p className="mt-2 flex items-center gap-1 text-lg font-bold">{name}<VerifiedBadge verified={!!other?.verified} size={16} /></p>
              {other?.username && <p className="text-sm text-black/50 dark:text-white/50">@{other.username}</p>}
              {other?.bio && <p className="mt-1 text-sm text-black/60 dark:text-white/60 max-w-xs line-clamp-2">{other.bio}</p>}
              <Link to={`/creators/${otherId}`} className="mt-3 px-4 py-1.5 rounded-full border border-black/15 dark:border-white/20 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10">View profile</Link>
            </div>
          )}

          {!loaded && (
            <div className="py-10 flex justify-center"><span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          )}

          {messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || !sameDay(prev.createdAt, msg.createdAt);
            const joinsPrev = !!prev && !newDay && prev.senderId === msg.senderId && gap(prev, msg) < GROUP_GAP_MS && prev.type !== 'call_history' && msg.type !== 'call_history';
            const joinsNext = !!next && sameDay(next.createdAt, msg.createdAt) && next.senderId === msg.senderId && gap(msg, next) < GROUP_GAP_MS && next.type !== 'call_history' && msg.type !== 'call_history';
            const position: GroupPosition = joinsPrev ? (joinsNext ? 'middle' : 'last') : joinsNext ? 'first' : 'single';
            const isMe = msg.senderId === me.uid;
            const isLastMine = lastMine?.id === msg.id;
            const seen = isLastMine && !!msg.createdAt && otherReadAt >= msg.createdAt.getTime();

            return (
              <Fragment key={msg.id}>
                {newDay && msg.createdAt && (
                  <div className="py-4 text-center text-xs font-medium text-black/45 dark:text-white/45">{dayLabel(msg.createdAt)}</div>
                )}
                <MessageBubble
                  msg={msg}
                  isMe={isMe}
                  me={me.uid}
                  position={position}
                  otherName={first}
                  actionsOpen={actionsFor === msg.id}
                  onOpenActions={open => setActionsFor(open ? msg.id : null)}
                  onReply={() => { setEditing(null); setReplyTo(msg); setActionsFor(null); }}
                  onEdit={() => { setReplyTo(null); setEditing(msg); setActionsFor(null); }}
                  onDelete={() => { setToDelete(msg); setActionsFor(null); }}
                  onReact={emoji => toggleReaction(conv.id, msg, emoji, me.uid).catch(() => toast.error("Couldn't react"))}
                  onJumpTo={jumpTo}
                  onOpenImage={setLightbox}
                />
                {(position === 'last' || position === 'single') && (
                  <p className={`mt-1 px-1 text-[11px] text-black/40 dark:text-white/40 ${isMe ? 'text-right' : ''}`}>
                    {msg.pending ? 'Sending…' : clock(msg.createdAt)}
                    {isLastMine && !msg.pending && accepted && <> · {seen ? 'Seen' : 'Sent'}</>}
                  </p>
                )}
              </Fragment>
            );
          })}

          {typing && (
            <div className="mt-3 flex">
              <span className="px-4 py-3 rounded-[20px] bg-black/[0.06] dark:bg-white/10 flex gap-1">
                {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-black/40 dark:bg-white/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            </div>
          )}
        </div>

        {newBelow && (
          <button onClick={scrollToBottom} className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary text-white text-sm font-medium shadow-lg">
            <ArrowDown size={14} /> New messages
          </button>
        )}
      </div>

      {/* Bottom: request handling or composer */}
      {incoming ? (
        <div className="shrink-0 border-t border-black/10 dark:border-white/10 px-4 py-4 text-center">
          <p className="font-semibold">{first} wants to message you</p>
          <p className="mt-0.5 text-sm text-black/55 dark:text-white/55">They won't know you've seen this unless you accept.</p>
          <div className="mt-3 grid grid-cols-3 gap-2 max-w-sm mx-auto">
            <button onClick={() => setConfirmBlock(true)} className="py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold text-red-500 hover:bg-red-500/5">Block</button>
            <button onClick={() => respondToRequest(conv.id, false).then(onClosed).catch(() => toast.error('Something went wrong'))} className="py-2 rounded-full border border-black/15 dark:border-white/20 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10">Delete</button>
            <button onClick={() => respondToRequest(conv.id, true).then(() => markRead(conv.id, me.uid)).catch(() => toast.error('Something went wrong'))} className="py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">Accept</button>
          </div>
        </div>
      ) : waiting ? (
        <div className="shrink-0 border-t border-black/10 dark:border-white/10 px-4 py-4 text-center text-sm text-black/60 dark:text-white/60">
          Request sent. You can send more messages once {first} accepts.
        </div>
      ) : canSend ? (
        <>
          {!exists && mutual === false && (
            <p className="shrink-0 px-4 pt-2 text-xs text-center text-black/50 dark:text-white/50">
              {first} doesn't follow you back yet, so your first message is sent as a request.
            </p>
          )}
          <Composer
            autoFocusKey={conv.id}
            placeholder={`Message ${first}`}
            extras={accepted}
            replyTo={replyTo}
            replyName={replyTo?.senderId === me.uid ? 'yourself' : first}
            editing={editing}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onSend={send}
            onSendFile={sendFile}
            onSaveEdit={text => editMessage(conv.id, editing!.id, text).then(() => setEditing(null)).catch(() => toast.error("Couldn't edit"))}
            onGift={amount => sendGift(conv.id, me, otherId, amount)}
            onTyping={() => exists && signalTyping(conv.id, me.uid)}
          />
        </>
      ) : null}

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const m = toDelete!;
          setToDelete(null);
          deleteMessage(conv.id, m, messages.at(-1)?.id === m.id).catch(() => toast.error("Couldn't delete"));
        }}
        title="Delete message?"
        message="It will be removed for both of you."
        confirmText="Delete"
      />
      <ConfirmModal
        isOpen={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={block}
        title={`Block ${first}?`}
        message="They won't be able to message you, and you won't see their posts."
        confirmText="Block"
      />

      {lightbox && (
        <div className="keep-dark fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X size={22} /></button>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

const gap = (a: Message, b: Message) => Math.abs((b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

function HeaderButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${active ? 'text-primary bg-primary/10' : 'text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}
