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

/** Public posts by any of `authorIds`, newest first, strictly older than `before`. */
export async function fetchPostsByAuthors(authorIds: string[], count: number, before?: string): Promise<FeedItem[]> {
  if (authorIds.length === 0) return [];

  if (shouldReadCollectionFromSupabase('posts')) {
    let q = getSupabase().from('posts').select('*').in('author_uid', authorIds).eq('visibility', 'public');
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
    where('visibility', '==', 'public'),
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

/**
 * Text/hashtag search over public posts.
 * Supabase does it in SQL; Firestore has no text search, so we scan recent posts in batches.
 */
export async function searchPosts(
  match: { search?: string; hashtag?: string },
  count: number,
  cursor?: SourceCursor,
): Promise<{ items: FeedItem[]; cursor: SourceCursor | null }> {
  const term = match.search?.trim().toLowerCase();
  // Restrict to tag characters: the value is interpolated into a PostgREST filter string.
  const tag = match.hashtag?.toLowerCase().replace(/[^a-z0-9_]/g, '');

  if (shouldReadCollectionFromSupabase('posts')) {
    let q = getSupabase().from('posts').select('*').eq('visibility', 'public');
    if (tag) q = q.or(`hashtags.cs.{#${tag}},hashtags.cs.{${tag}}`);
    if (term) q = q.ilike('content', `%${term}%`);
    if (cursor?.iso) q = q.lt('created_at', cursor.iso);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(count);
    if (error) throw error;
    const rows = (data || []) as Record<string, unknown>[];
    return {
      items: rows.map(row => fromSupabaseRow('post', row)),
      cursor: rows.length < count ? null : { iso: rows[rows.length - 1].created_at as string },
    };
  }

  const matches = (post: any) => {
    if (tag) return (post.hashtags || []).some((h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, '') === tag);
    if (term) return `${post.content || ''} ${post.authorName || ''}`.toLowerCase().includes(term);
    return true;
  };

  const BATCH = 50;
  const MAX_BATCHES = 4;
  const found: FeedItem[] = [];
  let snapCursor = cursor?.snap;
  for (let i = 0; i < MAX_BATCHES && found.length < count; i++) {
    const snap = await getDocs(query(
      collection(db, 'posts'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      ...(snapCursor ? [startAfter(snapCursor)] : []),
      limit(BATCH),
    ));
    found.push(...snap.docs.filter(d => matches(d.data())).map(d => normalizeItem(d.id, 'post', d.data())));
    if (snap.docs.length < BATCH) return { items: found, cursor: null };
    snapCursor = snap.docs[snap.docs.length - 1];
  }
  return { items: found, cursor: { snap: snapCursor } };
}
