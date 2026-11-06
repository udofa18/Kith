/**
 * Data for profile pages and hover cards. Everything is fetched on demand (per tab) with
 * one-shot reads; counts use aggregate queries instead of downloading whole collections.
 */
import {
  collection, collectionGroup, doc, documentId, getCountFromServer, getDoc, getDocs, limit, orderBy,
  query, serverTimestamp, startAfter, updateDoc, where, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from '../../lib/storage';
import { auth, db } from '../../firebase';

export interface Profile {
  id: string;
  data: Record<string, any>;
}

export interface Relationship {
  followers: number;
  following: number;
  followsYou: boolean;
  youFollow: boolean;
  mutuals: { id: string; name: string; photo: string }[];
  mutualCount: number;
}

export interface PersonRow {
  id: string;
  name: string;
  username: string;
  photo: string;
  bio: string;
  verified: boolean;
}

export const displayName = (u: Record<string, any>) => u.displayName || u.username || 'Member';
export const photoOf = (u: Record<string, any>) => u.profileImage || u.photoURL || '';
export const toDate = (v: any): Date | null => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

const count = (q: Parameters<typeof getCountFromServer>[0]) =>
  getCountFromServer(q).then(s => s.data().count).catch(() => 0);

/** Loads a profile by uid, falling back to a username (so `/creators/someone` links work). */
export async function resolveProfile(idOrUsername: string): Promise<Profile | null> {
  const byId = await getDoc(doc(db, 'users', idOrUsername));
  if (byId.exists()) return { id: byId.id, data: byId.data() };
  const handle = idOrUsername.replace(/^@/, '');
  for (const name of new Set([handle, handle.toLowerCase()])) {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', name), limit(1)));
    if (!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() };
  }
  return null;
}

/** Follower counts, whether you follow each other, and people you follow who follow them. */
export async function fetchRelationship(userId: string, me: string | null, myFollowing: string[]): Promise<Relationship> {
  const other = !!me && me !== userId;
  const candidates = myFollowing.filter(id => id !== userId).slice(0, 30);
  const [followers, following, followsYou, youFollow, mutualSnap] = await Promise.all([
    count(collection(db, 'users', userId, 'followers')),
    count(collection(db, 'users', userId, 'following')),
    other ? getDoc(doc(db, 'users', userId, 'following', me!)).then(s => s.exists()).catch(() => false) : false,
    other ? getDoc(doc(db, 'users', me!, 'following', userId)).then(s => s.exists()).catch(() => false) : false,
    // Firestore `in` takes up to 30 values, so this checks your first 30 follows.
    other && candidates.length
      ? getDocs(query(collection(db, 'users', userId, 'followers'), where(documentId(), 'in', candidates))).catch(() => null)
      : null,
  ]);

  const mutualIds = mutualSnap?.docs.map(d => d.id) ?? [];
  const mutuals = await Promise.all(mutualIds.slice(0, 2).map(async id => {
    const u = (await getDoc(doc(db, 'users', id)).catch(() => null))?.data() || {};
    return { id, name: displayName(u), photo: photoOf(u) };
  }));
  return { followers, following, followsYou, youFollow, mutuals, mutualCount: mutualIds.length };
}

/** Followers or following list (newest first), with each person's profile. */
export async function fetchFollowList(userId: string, kind: 'followers' | 'following', max = 60): Promise<PersonRow[]> {
  const snap = await getDocs(query(collection(db, 'users', userId, kind), limit(max)));
  const edges = snap.docs
    .map(d => ({ id: d.id, at: toDate(d.data().createdAt)?.getTime() ?? 0 }))
    .sort((a, b) => b.at - a.at);
  const people = await Promise.all(edges.map(async ({ id }) => {
    const u = await getDoc(doc(db, 'users', id)).catch(() => null);
    if (!u?.exists()) return null;
    const d = u.data();
    return { id, name: displayName(d), username: d.username || '', photo: photoOf(d), bio: d.bio || '', verified: !!d.verified };
  }));
  return people.filter((p): p is PersonRow => p !== null);
}

// ---------------------------------------------------------------- Posts

export const POSTS_PAGE = 10;

export const fetchPostCount = (userId: string) => count(query(collection(db, 'posts'), where('authorUid', '==', userId)));

export async function fetchProfilePosts(userId: string, cursor?: QueryDocumentSnapshot, includeFollowers = true) {
  const snap = await getDocs(query(
    collection(db, 'posts'),
    where('authorUid', '==', userId),
    orderBy('createdAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(POSTS_PAGE),
  ));
  const visible = snap.docs.filter((d) =>
    includeFollowers || d.data().visibility !== 'followers' || d.data().authorUid === auth.currentUser?.uid,
  );
  return {
    posts: visible.map(d => ({ id: d.id, ...d.data() })) as any[],
    cursor: snap.docs.length === POSTS_PAGE ? snap.docs[snap.docs.length - 1] : undefined,
  };
}

export interface MediaTile {
  postId: string;
  url: string;
  type: 'image' | 'video';
  more: number;
}

/** Photos and videos from the user's recent posts, one tile per post. */
export async function fetchProfileMedia(userId: string, includeFollowers = true): Promise<MediaTile[]> {
  const snap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', userId), orderBy('createdAt', 'desc'), limit(60)));
  return snap.docs.filter((d) =>
    includeFollowers || d.data().visibility !== 'followers' || d.data().authorUid === auth.currentUser?.uid,
  ).flatMap(d => {
    const media = (d.data().media || []).filter((m: any) => m?.url);
    return media.length ? [{ postId: d.id, url: media[0].url, type: media[0].type === 'video' ? 'video' : 'image', more: media.length - 1 }] : [];
  });
}

export interface Reply {
  id: string;
  content: string;
  createdAt: Date | null;
  postId: string;
  post: { authorName: string; authorUsername: string; content: string } | null;
}

/** The user's recent comments with a snippet of the post each one replies to. */
export async function fetchProfileReplies(userId: string): Promise<Reply[]> {
  const snap = await getDocs(query(collectionGroup(db, 'comments'), where('authorUid', '==', userId), limit(40)));
  const comments = snap.docs
    .filter(d => d.ref.parent.parent?.parent.id === 'posts')
    .map(d => ({ id: d.id, ...d.data(), postId: d.ref.parent.parent!.id }) as any)
    .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
    .slice(0, 20);

  const postIds = [...new Set(comments.map(c => c.postId))];
  const posts = new Map<string, Reply['post']>();
  await Promise.all(postIds.map(async id => {
    const p = await getDoc(doc(db, 'posts', id)).catch(() => null);
    if (p?.exists()) {
      const d = p.data();
      posts.set(id, { authorName: d.authorName || 'Member', authorUsername: d.authorUsername || '', content: d.content || '' });
    }
  }));

  return comments.map(c => ({
    id: c.id,
    content: c.content || '',
    createdAt: toDate(c.createdAt),
    postId: c.postId,
    post: posts.get(c.postId) ?? null,
  }));
}

// ---------------------------------------------------------------- Other content

export type SectionKey = 'articles' | 'products' | 'events' | 'communities';

const sectionQuery = (key: SectionKey, userId: string, isMe: boolean) => {
  switch (key) {
    case 'articles':
      return isMe
        ? query(collection(db, 'articles'), where('authorUid', '==', userId), orderBy('createdAt', 'desc'))
        : query(collection(db, 'articles'), where('authorUid', '==', userId), where('status', '==', 'published'), orderBy('createdAt', 'desc'));
    case 'products':
      return query(collection(db, 'products'), where('creatorUid', '==', userId), orderBy('createdAt', 'desc'));
    case 'events':
      return query(collection(db, 'events'), where('hostId', '==', userId));
    case 'communities':
      return query(collectionGroup(db, 'members'), where('userId', '==', userId));
  }
};

/** How many of each kind of content the user has, so empty tabs can be hidden. */
export async function fetchSectionCounts(userId: string, isMe: boolean): Promise<Record<SectionKey, number>> {
  const keys: SectionKey[] = ['articles', 'products', 'events', 'communities'];
  const values = await Promise.all(keys.map(k => count(sectionQuery(k, userId, isMe))));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<SectionKey, number>;
}

export async function fetchSection(key: SectionKey, userId: string, isMe: boolean): Promise<any[]> {
  const snap = await getDocs(sectionQuery(key, userId, isMe));
  if (key !== 'communities') return snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const viewerUid = auth.currentUser?.uid ?? null;
  const userSnap = isMe ? null : await getDoc(doc(db, 'users', userId)).catch(() => null);
  const settings = userSnap?.exists() ? userSnap.data().settings : null;
  const audience = settings?.communities?.showMembership ?? settings?.profile?.showCommunities ?? 'everyone';

  if (!isMe && audience === 'me') return [];

  if (!isMe && (audience === 'followers' || audience === 'mutuals' || audience === 'members')) {
    if (!viewerUid) return [];
    const viewerFollows = (await getDoc(doc(db, 'users', viewerUid, 'following', userId)).catch(() => null))?.exists();
    const followsViewer = (await getDoc(doc(db, 'users', userId, 'following', viewerUid)).catch(() => null))?.exists();
    if (audience === 'followers' && !viewerFollows) return [];
    if (audience === 'mutuals' && !(viewerFollows && followsViewer)) return [];
    if (audience === 'members') {
      const memberships = await getDocs(query(
        collectionGroup(db, 'members'),
        where('userId', '==', viewerUid),
        limit(1),
      )).catch(() => null);
      if (!memberships?.size) return [];
    }
  }

  const showRole = settings?.communities?.showRole !== false;
  const communities = await Promise.all(snap.docs.map(async m => {
    const communityId = m.ref.parent.parent?.id;
    if (!communityId) return null;
    const c = await getDoc(doc(db, 'communities', communityId)).catch(() => null);
    return c?.exists()
      ? { id: c.id, ...c.data(), userRole: showRole ? m.data().role : undefined }
      : null;
  }));
  return communities.filter(Boolean);
}

/** Your saved posts, products and articles. */
export async function fetchBookmarks(userId: string): Promise<any[]> {
  const [general, articles] = await Promise.all([
    getDocs(query(collection(db, 'users', userId, 'bookmarks'), orderBy('bookmarkedAt', 'desc'), limit(40))),
    getDocs(query(collection(db, 'users', userId, 'bookmarkedArticles'), orderBy('bookmarkedAt', 'desc'), limit(40))),
  ]);
  const resolve = async (id: string, sources: [string, string][]) => {
    for (const [path, type] of sources) {
      const d = await getDoc(doc(db, path, id)).catch(() => null);
      if (d?.exists()) return { id: d.id, ...d.data(), bookmarkType: type };
    }
    return null;
  };
  const items = await Promise.all([
    ...general.docs.map(d => resolve(d.id, [['posts', 'post'], ['products', 'product']])),
    ...articles.docs.map(d => resolve(d.id, [['articles', 'article']])),
  ]);
  return items.filter(Boolean);
}

/** Replaces your cover photo. */
export async function uploadBanner(userId: string, file: File): Promise<string> {
  const storageRef = ref(null, `avatars/${userId}/banner_${Date.now()}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, 'users', userId), { bannerImage: url, updatedAt: serverTimestamp() });
  return url;
}
