/**
 * Direct messages: conversations live at `conversations/{uidA_uidB}` with their messages in a
 * subcollection. Read receipts and typing are per-conversation maps (`readAt`, `typing`) so they
 * cost one write each instead of one per message. Attachments go to Storage, not Firestore.
 */
import {
  collection, deleteField, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { createNotification } from '../../lib/notifications';
import { getConversationId, type ConversationData, type ConversationStatus } from '../../lib/messaging';

export interface Message {
  id: string;
  senderId: string;
  receiverId?: string;
  content: string;
  createdAt: Date | null;
  type?: 'text' | 'gift' | 'attachment' | 'call_history';
  giftAmount?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  metadata?: { media: 'voice' | 'video'; status: 'missed' | 'ended' | 'declined'; duration?: number };
  replyTo?: { id: string; senderId: string; content: string };
  reactions?: Record<string, { count: number; uids: string[] }>;
  isEdited?: boolean;
  /** Not yet confirmed by the server (serverTimestamp pending). */
  pending?: boolean;
}

export interface Sender {
  uid: string;
  name: string;
  photo: string;
}

export const PAGE_SIZE = 40;
export const MAX_ATTACHMENT_MB = 25;
const TYPING_TTL_MS = 6000;

export const toDate = (v: any): Date | null =>
  v?.toDate ? v.toDate() : typeof v?.seconds === 'number' ? new Date(v.seconds * 1000) : v ? new Date(v) : null;

const fromDoc = (d: QueryDocumentSnapshot): Message => {
  // Estimate pending server timestamps so a just-sent message sorts to the bottom right away.
  const data = d.data({ serverTimestamps: 'estimate' });
  return { ...data, id: d.id, createdAt: toDate(data.createdAt), pending: d.metadata.hasPendingWrites } as Message;
};

// ---------------------------------------------------------------- Conversations

const userCache = new Map<string, { at: number; user: Promise<any> }>();
const USER_TTL_MS = 2 * 60_000;

/** Profile of the other person in a chat, cached briefly (it carries their "active" time). */
export function getUser(uid: string) {
  const hit = userCache.get(uid);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  const user = getDoc(doc(db, 'users', uid)).then(s => (s.exists() ? { id: s.id, ...s.data() } : null)).catch(() => null);
  userCache.set(uid, { at: Date.now(), user });
  return user;
}

export function subscribeConversations(uid: string, onChange: (convs: ConversationData[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, 'conversations'), where('participants', 'array-contains', uid), orderBy('lastMessageAt', 'desc'), limit(100)),
    async snap => {
      const convs = await Promise.all(snap.docs.map(async d => {
        const data = d.data() as ConversationData;
        const otherId = data.participants.find(p => p !== uid) ?? uid;
        return { ...data, id: d.id, otherUser: await getUser(otherId) };
      }));
      onChange(convs);
    },
    onError,
  );
}

export const followsEachOther = async (a: string, b: string) => {
  const [ab, ba] = await Promise.all([
    getDoc(doc(db, 'users', a, 'following', b)),
    getDoc(doc(db, 'users', b, 'following', a)),
  ]);
  return ab.exists() && ba.exists();
};

// ---------------------------------------------------------------- Messages

/** Live view of the newest PAGE_SIZE messages, oldest first. */
export function subscribeLatestMessages(convId: string, onChange: (msgs: Message[], oldest: QueryDocumentSnapshot | null, full: boolean) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE)),
    { includeMetadataChanges: true },
    snap => onChange(snap.docs.map(fromDoc).reverse(), snap.docs.at(-1) ?? null, snap.docs.length === PAGE_SIZE),
    onError,
  );
}

/** The page of messages before `cursor`, oldest first. */
export async function fetchOlderMessages(convId: string, cursor: QueryDocumentSnapshot) {
  const snap = await getDocs(query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE)));
  return { messages: snap.docs.map(fromDoc).reverse(), cursor: snap.docs.at(-1) ?? null, more: snap.docs.length === PAGE_SIZE };
}

interface SendOptions {
  convId: string;
  me: Sender;
  otherId: string;
  /** What we know about the conversation; null when it doesn't exist yet. */
  status: ConversationStatus | null;
  requestedBy?: string;
  content: string;
  preview: string;
  extra?: Record<string, unknown>;
  /** Send the usual "sent you a message" notification (callers with their own can skip it). */
  notify?: boolean;
  /** The other person muted this chat: no notification. */
  mutedByOther?: boolean;
}

/**
 * Writes a message and updates the conversation in one batch. Creates the conversation when
 * needed (accepted if you follow each other, otherwise a request) and upgrades a request to a
 * chat once you follow each other.
 */
async function writeMessage({ convId, me, otherId, status, requestedBy, content, preview, extra = {}, notify = true, mutedByOther = false }: SendOptions) {
  const convRef = doc(db, 'conversations', convId);
  const messageRef = doc(collection(db, 'conversations', convId, 'messages'));
  const batch = writeBatch(db);
  let created = false;
  let nextStatus = status;

  const mutual = status !== 'accepted' ? await followsEachOther(me.uid, otherId) : true;

  if (status === null) {
    created = true;
    nextStatus = mutual ? 'accepted' : 'pending';
    batch.set(convRef, {
      participants: [me.uid, otherId].sort(),
      lastMessage: preview,
      lastMessageAt: serverTimestamp(),
      lastSenderId: me.uid,
      status: nextStatus,
      requestedBy: me.uid,
      favouritedBy: [],
      unreadCount: { [otherId]: 1, [me.uid]: 0 },
      readAt: { [me.uid]: serverTimestamp() },
    });
  } else {
    const update: Record<string, unknown> = {
      lastMessage: preview,
      lastMessageAt: serverTimestamp(),
      lastSenderId: me.uid,
      [`unreadCount.${otherId}`]: increment(1),
      [`readAt.${me.uid}`]: serverTimestamp(),
      [`typing.${me.uid}`]: deleteField(),
    };
    // Replying to a request you received (or following each other) turns it into a chat.
    if (status !== 'accepted' && (mutual || requestedBy !== me.uid)) {
      update.status = 'accepted';
      nextStatus = 'accepted';
    }
    batch.update(convRef, update);
  }

  batch.set(messageRef, {
    senderId: me.uid,
    receiverId: otherId,
    content,
    createdAt: serverTimestamp(),
    conversationId: convId,
    ...extra,
  });
  await batch.commit();

  const isRequest = nextStatus === 'pending' && created;
  if (notify && !mutedByOther) createNotification({
    recipientId: otherId,
    senderId: me.uid,
    senderName: me.name,
    senderPhoto: me.photo,
    type: isRequest ? 'message_request' : 'message',
    content: isRequest ? 'sent you a message request' : 'sent you a message',
    relatedId: convId,
  }).catch(() => undefined);

  return nextStatus;
}

export function sendText(opts: Omit<SendOptions, 'preview' | 'extra'> & { replyTo?: Message | null }) {
  const { replyTo, ...rest } = opts;
  return writeMessage({
    ...rest,
    preview: rest.content,
    extra: replyTo ? { replyTo: { id: replyTo.id, senderId: replyTo.senderId, content: replyTo.content.slice(0, 300) } } : {},
  });
}

/** Uploads a file to Storage and sends it as an attachment message. */
export async function sendAttachment(opts: Omit<SendOptions, 'content' | 'preview' | 'extra'> & { file: File; caption?: string; onProgress?: (p: number) => void }) {
  const { file, caption, onProgress, ...rest } = opts;
  const path = `messages/${rest.me.uid}/${rest.convId}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', s => onProgress?.(s.bytesTransferred / s.totalBytes), reject, () => resolve());
  });
  const url = await getDownloadURL(task.snapshot.ref);
  const kind = file.type.startsWith('image/') ? '📷 Photo' : file.type.startsWith('video/') ? '🎥 Video' : `📎 ${file.name}`;
  return writeMessage({
    ...rest,
    content: caption?.trim() || file.name,
    preview: caption?.trim() ? `${kind}: ${caption.trim()}` : kind,
    extra: { type: 'attachment', attachmentUrl: url, attachmentName: file.name, attachmentType: file.type, attachmentSize: file.size },
  });
}

/** Sends XP to the other person as a gift message. */
export async function sendGift(convId: string, me: Sender, otherId: string, amount: number) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', otherId), { xp: increment(amount) });
  batch.set(doc(collection(db, 'conversations', convId, 'messages')), {
    senderId: me.uid,
    receiverId: otherId,
    content: `sent you ${amount} XP`,
    type: 'gift',
    giftAmount: amount,
    createdAt: serverTimestamp(),
    conversationId: convId,
  });
  batch.update(doc(db, 'conversations', convId), {
    lastMessage: `🎁 Sent ${amount} XP`,
    lastMessageAt: serverTimestamp(),
    lastSenderId: me.uid,
    [`unreadCount.${otherId}`]: increment(1),
  });
  await batch.commit();
}

/**
 * Records a finished call in the chat (written once, by the caller) and bumps the conversation so
 * it shows in the inbox. Missed and declined calls count as unread for the person who was called.
 */
export async function logCall(convId: string, callerId: string, calleeId: string, media: 'voice' | 'video', status: 'missed' | 'ended' | 'declined', duration = 0) {
  const label = media === 'video' ? 'video call' : 'voice call';
  const mins = Math.floor(duration / 60);
  const preview = status === 'ended'
    ? `📞 ${media === 'video' ? 'Video' : 'Voice'} call · ${mins ? `${mins}m ${duration % 60}s` : `${duration}s`}`
    : status === 'declined' ? `📞 Declined ${label}` : `📞 Missed ${label}`;

  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'conversations', convId, 'messages')), {
    senderId: callerId,
    receiverId: calleeId,
    content: preview.replace('📞 ', ''),
    type: 'call_history',
    metadata: { media, status, duration },
    createdAt: serverTimestamp(),
    conversationId: convId,
  });
  batch.update(doc(db, 'conversations', convId), {
    lastMessage: preview,
    lastMessageAt: serverTimestamp(),
    lastSenderId: callerId,
    ...(status !== 'ended' ? { [`unreadCount.${calleeId}`]: increment(1) } : {}),
  });
  await batch.commit();
}

export function editMessage(convId: string, messageId: string, content: string) {
  return updateDoc(doc(db, 'conversations', convId, 'messages', messageId), {
    content: content.trim(),
    isEdited: true,
    editedAt: serverTimestamp(),
  });
}

export async function deleteMessage(convId: string, message: Message, wasLatest: boolean) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'conversations', convId, 'messages', message.id));
  if (wasLatest) batch.update(doc(db, 'conversations', convId), { lastMessage: 'Message deleted' });
  await batch.commit();
}

export function toggleReaction(convId: string, message: Message, emoji: string, uid: string) {
  const current = message.reactions?.[emoji] ?? { count: 0, uids: [] };
  const has = current.uids.includes(uid);
  const uids = has ? current.uids.filter(u => u !== uid) : [...current.uids, uid];
  return updateDoc(doc(db, 'conversations', convId, 'messages', message.id), {
    [`reactions.${emoji}`]: uids.length ? { count: uids.length, uids } : deleteField(),
  });
}

// ---------------------------------------------------------------- Read state, typing, requests

/** Marks the chat read for `uid`: clears their unread count and records when. */
export function markRead(convId: string, uid: string) {
  return updateDoc(doc(db, 'conversations', convId), {
    [`unreadCount.${uid}`]: 0,
    [`readAt.${uid}`]: serverTimestamp(),
  }).catch(() => undefined);
}

let lastTypingWrite = 0;
/** Throttled "typing…" signal; cleared by sending or `stopTyping`. */
export function signalTyping(convId: string, uid: string) {
  if (Date.now() - lastTypingWrite < TYPING_TTL_MS / 2) return;
  lastTypingWrite = Date.now();
  updateDoc(doc(db, 'conversations', convId), { [`typing.${uid}`]: serverTimestamp() }).catch(() => undefined);
}

export function stopTyping(convId: string, uid: string) {
  if (!lastTypingWrite) return;
  lastTypingWrite = 0;
  updateDoc(doc(db, 'conversations', convId), { [`typing.${uid}`]: deleteField() }).catch(() => undefined);
}

export function isTyping(conv: ConversationData | null, uid: string | undefined, now = Date.now()) {
  if (!conv || !uid) return false;
  const at = toDate(conv.typing?.[uid]);
  return !!at && now - at.getTime() < TYPING_TTL_MS;
}

export function respondToRequest(convId: string, accept: boolean) {
  return updateDoc(doc(db, 'conversations', convId), { status: accept ? 'accepted' : 'declined' });
}

export function setPinned(convId: string, uid: string, pinned: boolean, current: string[] = []) {
  const next = pinned ? [...new Set([...current, uid])] : current.filter(u => u !== uid);
  return updateDoc(doc(db, 'conversations', convId), { favouritedBy: next });
}

export function setMuted(convId: string, uid: string, muted: boolean, current: string[] = []) {
  const next = muted ? [...new Set([...current, uid])] : current.filter(u => u !== uid);
  return updateDoc(doc(db, 'conversations', convId), { mutedBy: next });
}

export interface SharedFile {
  id: string;
  url: string;
  name: string;
  type: string;
  size?: number;
  senderId: string;
  createdAt: Date | null;
}

/** Photos, videos and files shared in a chat, newest first (not limited to loaded messages). */
export async function fetchSharedFiles(convId: string, max = 60): Promise<SharedFile[]> {
  const snap = await getDocs(query(
    collection(db, 'conversations', convId, 'messages'),
    where('type', '==', 'attachment'),
    orderBy('createdAt', 'desc'),
    limit(max),
  ));
  return snap.docs
    .map(d => ({ id: d.id, m: d.data() }))
    .filter(({ m }) => m.attachmentUrl)
    .map(({ id, m }) => ({
      id,
      url: m.attachmentUrl,
      name: m.attachmentName || 'Attachment',
      type: m.attachmentType || '',
      size: m.attachmentSize,
      senderId: m.senderId,
      createdAt: toDate(m.createdAt),
    }));
}

export function blockUser(me: string, other: string) {
  return setDoc(doc(db, 'users', me, 'blockedUsers', other), { blockedAt: serverTimestamp() });
}

// ---------------------------------------------------------------- Presence

export function heartbeat(uid: string) {
  return updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }).catch(() => undefined);
}

/** "Active now", "Active 5m ago", … or null if unknown or long ago. */
export function presenceLabel(lastActiveAt: any, now = Date.now()): string | null {
  const at = toDate(lastActiveAt);
  if (!at) return null;
  const mins = Math.floor((now - at.getTime()) / 60000);
  if (mins < 3) return 'Active now';
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `Active ${days}d ago` : null;
}

/** For other parts of the app that send a one-off DM (e.g. live session invites). */
export async function sendDirectMessage(me: Sender, otherId: string, content: string, notify = true) {
  const convId = getConversationId(me.uid, otherId);
  const snap = await getDoc(doc(db, 'conversations', convId));
  const data = snap.data();
  return writeMessage({
    convId,
    me,
    otherId,
    status: snap.exists() ? (data?.status || 'accepted') : null,
    requestedBy: data?.requestedBy,
    content,
    preview: content,
    notify,
  });
}
