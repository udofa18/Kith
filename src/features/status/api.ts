/**
 * Statuses: photo, video or text updates that disappear after 24 hours and are visible only
 * to the author's followers (enforced in firestore.rules).
 *
 * `statuses/{id}` holds each update. `users/{uid}.statusUntil` marks who has one active, so the
 * tray can find them with one query instead of checking every account the viewer follows.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../../firebase';

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const STATUS_TEXT_MAX = 700;
export const STATUS_BACKGROUNDS = ['#7c3aed', '#db2777', '#ea580c', '#059669', '#0284c7', '#111827'];

export interface Status {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhoto: string;
  type: 'image' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  background?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface StatusGroup {
  uid: string;
  name: string;
  photo: string;
  items: Status[];
  isMine: boolean;
}

export interface Author {
  uid: string;
  name: string;
  username: string;
  photo: string;
}

const toDate = (v: any) => (v?.toDate ? v.toDate() : v ? new Date(v) : new Date());

function fromDoc(id: string, d: any): Status {
  return {
    id,
    authorUid: d.authorUid,
    authorName: d.authorName || 'Member',
    authorPhoto: d.authorPhoto || '',
    type: d.type,
    mediaUrl: d.mediaUrl,
    text: d.text,
    background: d.background,
    createdAt: toDate(d.createdAt),
    expiresAt: toDate(d.expiresAt),
  };
}

/** One person's live statuses, oldest first. Fails if you aren't allowed to see them. */
export async function fetchUserStatuses(uid: string): Promise<Status[]> {
  const snap = await getDocs(query(
    collection(db, 'statuses'),
    where('authorUid', '==', uid),
    where('expiresAt', '>', Timestamp.now()),
    orderBy('expiresAt', 'asc'),
    limit(30),
  ));
  return snap.docs.map(d => fromDoc(d.id, d.data()));
}

/** Active statuses from the viewer and the people they follow; the viewer's own group first. */
export async function fetchStatusTray(uid: string, followingIds: Set<string>): Promise<StatusGroup[]> {
  const active = await getDocs(query(collection(db, 'users'), where('statusUntil', '>', Timestamp.now()), limit(300)));
  const authors = active.docs.filter(d => d.id === uid || followingIds.has(d.id));

  const groups = await Promise.all(authors.map(async d => {
    // Someone may have stopped sharing with us (unfollowed, blocked): skip rather than fail the tray.
    const items = await fetchUserStatuses(d.id).catch(() => []);
    const u = d.data();
    return {
      uid: d.id,
      name: u.displayName || u.username || 'Member',
      photo: u.profileImage || u.photoURL || '',
      items,
      isMine: d.id === uid,
    };
  }));

  return groups
    .filter(g => g.items.length > 0)
    .sort((a, b) => Number(b.isMine) - Number(a.isMine) || latest(b) - latest(a));
}

const latest = (g: StatusGroup) => Math.max(...g.items.map(s => s.createdAt.getTime()));

export async function createStatus(author: Author, input: { file?: File; text?: string; background?: string }) {
  const expiresAt = Timestamp.fromMillis(Date.now() + STATUS_TTL_MS);
  const data: Record<string, unknown> = {
    authorUid: author.uid,
    authorName: author.name,
    authorUsername: author.username,
    authorPhoto: author.photo,
    createdAt: serverTimestamp(),
    expiresAt,
  };

  if (input.file) {
    const path = `statuses/${author.uid}/${Date.now()}_${input.file.name.replace(/[^\w.-]/g, '_')}`;
    const task = await uploadBytesResumable(ref(storage, path), input.file);
    data.type = input.file.type.startsWith('video/') ? 'video' : 'image';
    data.mediaUrl = await getDownloadURL(task.ref);
    if (input.text?.trim()) data.text = input.text.trim().slice(0, STATUS_TEXT_MAX);
  } else {
    data.type = 'text';
    data.text = (input.text || '').trim().slice(0, STATUS_TEXT_MAX);
    data.background = input.background || STATUS_BACKGROUNDS[0];
  }

  await addDoc(collection(db, 'statuses'), data);
  await updateDoc(doc(db, 'users', author.uid), { statusUntil: expiresAt });
}

export async function deleteStatus(status: Status, remaining: Status[]) {
  await deleteDoc(doc(db, 'statuses', status.id));
  // Keep the tray marker in step with whatever is still live.
  const until = remaining.filter(s => s.id !== status.id).reduce<Date | null>((max, s) => (!max || s.expiresAt > max ? s.expiresAt : max), null);
  await updateDoc(doc(db, 'users', status.authorUid), { statusUntil: until ? Timestamp.fromDate(until) : Timestamp.fromMillis(0) });
}

/** Records that the viewer saw a status. Write-once per viewer; repeat calls are ignored by the rules. */
export function recordStatusView(statusId: string, viewerUid: string) {
  return setDoc(doc(db, 'statuses', statusId, 'views', viewerUid), { viewedAt: serverTimestamp() }).catch(() => undefined);
}

export interface StatusViewer {
  uid: string;
  name: string;
  photo: string;
  viewedAt: Date;
}

/** Who has seen one of your statuses, most recent first. */
export async function fetchStatusViewers(statusId: string): Promise<StatusViewer[]> {
  const snap = await getDocs(collection(db, 'statuses', statusId, 'views'));
  const viewers = await Promise.all(snap.docs.map(async v => {
    const user = await getDoc(doc(db, 'users', v.id)).catch(() => null);
    const u = user?.data() || {};
    return { uid: v.id, name: u.displayName || u.username || 'Member', photo: u.profileImage || u.photoURL || '', viewedAt: toDate(v.data().viewedAt) };
  }));
  return viewers.sort((a, b) => b.viewedAt.getTime() - a.viewedAt.getTime());
}

// ---------------------------------------------------------------- Seen state (per device)

const SEEN_KEY = 'kith:seen-statuses';

function readSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
}

export function isSeen(statusId: string) {
  return statusId in readSeen();
}

export function markSeen(statusId: string) {
  const seen = readSeen();
  const cutoff = Date.now() - STATUS_TTL_MS;
  for (const [id, at] of Object.entries(seen)) if (at < cutoff) delete seen[id];
  seen[statusId] = Date.now();
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}
