/**
 * Low-level content queries for the feed. Each reads from Firestore or Supabase
 * according to the migration phase (see lib/database-config).
 */
import {
  collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where,
  type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { getSupabase } from '../../../supabase';
import { supabasePostToApp } from '../../../lib/db-mappers';
import { shouldReadCollectionFromSupabase } from '../../../lib/database-config';
import type { ContentType, FeedItem } from '../types';
import { toDate } from '../ranking/score';
import { extractHashtags, indexKey, matchesWords, normalizeTag, queryWords } from '../../search/tokens';

export type SourceType = 'post' | 'article' | 'challenge' | 'event' | 'product' | 'job';

const SOURCES: Record<SourceType, { path: string; filter?: { field: string; column: string; value: string } }> = {
  post: { path: 'posts', filter: { field: 'visibility', column: 'visibility', value: 'public' } },
  article: { path: 'articles', filter: { field: 'status', column: 'status', value: 'published' } },
  challenge: { path: 'challenges' },
  event: { path: 'events', filter: { field: 'visibility', column: 'visibility', value: 'public' } },
  product: { path: 'products' },
  job: { path: 'jobs' },
};

/** Opaque position in one source: a Firestore snapshot or a Postgres timestamp. */
export type SourceCursor = { snap?: QueryDocumentSnapshot; iso?: string };

const FIRESTORE_IN_LIMIT = 30;

export function normalizeItem(id: string, type: ContentType, raw: any): FeedItem {
  return {
    id,
    type,
    data: {
      id,
      ...raw,
      authorUid: raw.authorUid || raw.author_uid || raw.creatorUid || raw.creator_uid || raw.hostId || raw.host_id,
      authorName: raw.authorName || raw.author_name || raw.creatorName || raw.company || 'Anonymous',
      authorPhoto: raw.authorPhoto || raw.author_photo || raw.creatorPhoto || '',
      content: raw.content || raw.description || '',
      contentType: type,
      likesCount: raw.likesCount ?? raw.likes_count ?? 0,
      commentsCount: raw.commentsCount ?? raw.comments_count ?? 0,
      createdAt: raw.createdAt || raw.created_at,
    },
    score: 0,
    reasons: [],
    reason: '',
  };
}

const fromSupabaseRow = (type: SourceType, row: Record<string, unknown>) =>
  normalizeItem(row.id as string, type, type === 'post' ? supabasePostToApp(row) : row);

/** Newest items of one type, after `cursor`. Returns `cursor: null` once the source is exhausted. */
export async function fetchRecent(type: SourceType, count: number, cursor?: SourceCursor) {
  const { path, filter } = SOURCES[type];

  if (shouldReadCollectionFromSupabase(path)) {
    let q = getSupabase().from(path).select('*');
    if (filter) q = q.eq(filter.column, filter.value);
    if (cursor?.iso) q = q.lt('created_at', cursor.iso);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(count);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    return {
      items: rows.map(row => fromSupabaseRow(type, row)),
      cursor: rows.length < count ? null : { iso: rows[rows.length - 1].created_at as string },
    };
  }

  const constraints: QueryConstraint[] = [];
  if (filter) constraints.push(where(filter.field, '==', filter.value));
  constraints.push(orderBy('createdAt', 'desc'));
  if (cursor?.snap) constraints.push(startAfter(cursor.snap));
  constraints.push(limit(count));
  const snap = await getDocs(query(collection(db, path), ...constraints));
  return {
    items: snap.docs.map(d => normalizeItem(d.id, type, d.data())),
    cursor: snap.docs.length < count ? null : { snap: snap.docs[snap.docs.length - 1] },
  };
}

/** Public and followers-only posts by any of `authorIds`, newest first, strictly older than `before`. */
export async function fetchPostsByAuthors(authorIds: string[], count: number, before?: string): Promise<FeedItem[]> {
  if (authorIds.length === 0) return [];

  if (shouldReadCollectionFromSupabase('posts')) {
    let q = getSupabase().from('posts').select('*').in('author_uid', authorIds).in('visibility', ['public', 'followers']);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(count);
    if (error) throw error;
    return ((data || []) as Record<string, unknown>[]).map(row => fromSupabaseRow('post', row));
  }

  // Firestore caps `in` at 30 values: query each chunk, then merge.
  const chunks: string[][] = [];
  for (let i = 0; i < authorIds.length; i += FIRESTORE_IN_LIMIT) chunks.push(authorIds.slice(i, i + FIRESTORE_IN_LIMIT));
  const snaps = await Promise.all(chunks.map(chunk => getDocs(query(
    collection(db, 'posts'),
    where('authorUid', 'in', chunk),
    where('visibility', 'in', ['public', 'followers']),
    ...(before ? [where('createdAt', '<', Timestamp.fromDate(new Date(before)))] : []),
    orderBy('createdAt', 'desc'),
    limit(count),
  ))));
  return snaps
    .flatMap(snap => snap.docs.map(d => normalizeItem(d.id, 'post', d.data())))
    .sort((a, b) => toDate(b.data.createdAt).getTime() - toDate(a.data.createdAt).getTime())
    .slice(0, count);
}

/** Public posts created since `since`, newest first. */
export async function fetchPostsSince(since: Date, max: number): Promise<FeedItem[]> {
  if (shouldReadCollectionFromSupabase('posts')) {
    const { data, error } = await getSupabase().from('posts').select('*')
      .eq('visibility', 'public').gte('created_at', since.toISOString())
      .order('created_at', { ascending: false }).limit(max);
    if (error) throw error;
    return ((data || []) as Record<string, unknown>[]).map(row => fromSupabaseRow('post', row));
  }

  const snap = await getDocs(query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    where('createdAt', '>=', Timestamp.fromDate(since)),
    orderBy('createdAt', 'desc'),
    limit(max),
  ));
  return snap.docs.map(d => normalizeItem(d.id, 'post', d.data()));
}

export type SearchCursor = {
  /** Supabase: created_at of the last row. */
  iso?: string;
  /** Firestore: position in the token-indexed query (posts that have `searchTokens`). */
  indexed?: QueryDocumentSnapshot | null;
  /** Firestore: position in the scan over older posts written before indexing existed. */
  scan?: QueryDocumentSnapshot | null;
  indexedDone?: boolean;
  scanDone?: boolean;
};

/** How a post matches a search; also used by the scan over older, unindexed posts. */
export function postMatches(post: any, match: { search?: string; hashtag?: string }): boolean {
  const tag = match.hashtag ? normalizeTag(match.hashtag) : '';
  if (tag) {
    const tags = [...(post.hashtags || []), ...extractHashtags(post.content || '')].map(normalizeTag);
    return tags.includes(tag);
  }
  const qWords = queryWords(match.search || '');
  const text = [post.content, post.project, post.authorName, post.authorUsername, ...(post.hashtags || [])].join(' ');
  return matchesWords(text, qWords);
}

const SCAN_BATCH = 60;

/**
 * Text/hashtag search over public posts, newest first.
 *
 * Firestore has no text search. New posts carry `searchTokens` (see features/search/tokens), so one
 * `array-contains` query finds candidates and the remaining words are checked here. Older posts
 * without tokens are found by scanning recent posts alongside; both streams are merged by date.
 */
export async function searchPosts(
  match: { search?: string; hashtag?: string },
  count: number,
  cursor?: SearchCursor,
): Promise<{ items: FeedItem[]; cursor: SearchCursor | null }> {
  const tag = match.hashtag ? normalizeTag(match.hashtag) : '';
  const qWords = queryWords(match.search || '');
  if (!tag && qWords.length === 0) return { items: [], cursor: null };

  if (shouldReadCollectionFromSupabase('posts')) {
    // `tag` is restricted to [a-z0-9_]: it's interpolated into a PostgREST filter string.
    let q = getSupabase().from('posts').select('*').eq('visibility', 'public');
    if (tag) q = q.or(`hashtags.cs.{#${tag}},hashtags.cs.{${tag}}`);
    else for (const w of qWords) q = q.ilike('content', `%${w}%`);
    if (cursor?.iso) q = q.lt('created_at', cursor.iso);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(count);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    return {
      items: rows.map(row => fromSupabaseRow('post', row)),
      cursor: rows.length < count ? null : { iso: rows[rows.length - 1].created_at as string },
    };
  }

  const key = tag ? `#${tag}` : indexKey(qWords)!;
  const page = (after: QueryDocumentSnapshot | null | undefined, extra: QueryConstraint[], n: number) => getDocs(query(
    collection(db, 'posts'),
    where('visibility', '==', 'public'),
    ...extra,
    orderBy('createdAt', 'desc'),
    ...(after ? [startAfter(after)] : []),
    limit(n),
  ));

  const [indexedSnap, scanSnap] = await Promise.all([
    cursor?.indexedDone ? null : page(cursor?.indexed, [where('searchTokens', 'array-contains', key)], count).catch(err => {
      // Missing index (not deployed yet) shouldn't break search: the scan still runs.
      console.warn('[search] indexed query failed:', err);
      return null;
    }),
    cursor?.scanDone ? null : page(cursor?.scan, [], SCAN_BATCH),
  ]);

  const found = new Map<string, FeedItem>();
  for (const d of indexedSnap?.docs ?? []) {
    if (postMatches(d.data(), match)) found.set(d.id, normalizeItem(d.id, 'post', d.data()));
  }
  for (const d of scanSnap?.docs ?? []) {
    const data = d.data();
    // Indexed posts come from the query above; the scan only covers older ones.
    if (!data.searchTokens && postMatches(data, match)) found.set(d.id, normalizeItem(d.id, 'post', data));
  }

  const next: SearchCursor = {
    indexed: indexedSnap?.docs.at(-1) ?? cursor?.indexed,
    scan: scanSnap?.docs.at(-1) ?? cursor?.scan,
    indexedDone: cursor?.indexedDone || !indexedSnap || indexedSnap.docs.length < count,
    scanDone: cursor?.scanDone || !scanSnap || scanSnap.docs.length < SCAN_BATCH,
  };
  const items = [...found.values()].sort((a, b) => toDate(b.data.createdAt).getTime() - toDate(a.data.createdAt).getTime());
  return { items, cursor: next.indexedDone && next.scanDone ? null : next };
}
