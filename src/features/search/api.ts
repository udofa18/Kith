/**
 * People and topic lookups for search. Firestore matches by prefix only and is case-sensitive,
 * so a few spellings of the query are tried and the results merged.
 */
import { collection, documentId, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { usersRepository } from '../../services/db/usersRepository';
import { normalizeTag, words } from './tokens';

export interface PersonResult {
  id: string;
  username: string;
  displayName: string;
  photo: string;
  bio: string;
  verified: boolean;
}

export interface TopicResult {
  tag: string;
  count: number;
}

const END = '';

const capitalize = (s: string) => s.replace(/\b\p{L}/gu, c => c.toUpperCase());

async function prefixQuery(field: string, prefix: string, max: number) {
  if (!prefix) return [];
  const snap = await getDocs(query(
    collection(db, 'users'),
    where(field, '>=', prefix),
    where(field, '<=', prefix + END),
    orderBy(field),
    limit(max),
  ));
  return snap.docs;
}

export async function searchPeople(raw: string, max = 8): Promise<PersonResult[]> {
  const q = raw.trim().replace(/^@/, '');
  if (q.length < 2) return [];

  const lower = q.toLowerCase();
  const attempts = [
    prefixQuery('username', lower, max),
    prefixQuery('username', q, max),
    prefixQuery('displayName', q, max),
    prefixQuery('displayName', capitalize(lower), max),
  ];
  const [settled, pool] = await Promise.all([Promise.allSettled(attempts), getActivePool()]);

  const people = new Map<string, PersonResult>();
  const add = (id: string, u: any) => {
    if (people.has(id)) return;
    // Respect a member's discovery choice even if a prefix query returned them.
    if (u?.settings?.privacy?.discoverable === false || u?.privacySearchable === false) return;
    if (u?.settings?.profile?.visibility === 'hidden') return;
    people.set(id, {
      id,
      username: u.username || '',
      displayName: u.displayName || u.username || 'Member',
      photo: u.profileImage || u.photoURL || '',
      bio: u.bio || '',
      verified: !!u.verified,
    });
  };
  for (const result of settled) {
    if (result.status === 'fulfilled') for (const d of result.value) add(d.id, d.data());
  }
  // Prefix queries can't find a later word ("daniel" in "Udofa Daniel"), so also check the
  // most active members by any word of their name.
  const qWords = words(q);
  for (const u of pool) {
    const nameWords = words(`${u.displayName || ''} ${u.username || ''}`);
    if (qWords.length && qWords.every(w => nameWords.some(n => n.startsWith(w)))) add(String(u.id), u);
  }
  return [...people.values()].slice(0, max);
}

let poolPromise: Promise<Record<string, any>[]> | null = null;
let poolAt = 0;

/** The 200 highest-XP members, cached for five minutes. */
function getActivePool() {
  if (!poolPromise || Date.now() - poolAt > 5 * 60_000) {
    poolAt = Date.now();
    poolPromise = usersRepository.getTopByXp(200).catch(() => {
      poolPromise = null;
      return [];
    });
  }
  return poolPromise;
}

/** Topics (from the hashtag tracker) whose name starts with the query. */
export async function searchTopics(raw: string, max = 5): Promise<TopicResult[]> {
  const tag = normalizeTag(raw);
  if (tag.length < 2) return [];
  const snap = await getDocs(query(
    collection(db, 'hashtags'),
    where(documentId(), '>=', tag),
    where(documentId(), '<=', tag + END),
    orderBy(documentId()),
    limit(max * 2),
  ));
  return snap.docs
    .map(d => ({ tag: d.id, count: Number(d.data().count) || 0 }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

// ---------------------------------------------------------------- Recent searches

const RECENT_KEY = 'kith:recent-searches';

export function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 6);
  } catch {
    return [];
  }
}

export function addRecentSearch(term: string) {
  const t = term.trim();
  if (!t) return;
  const next = [t, ...getRecentSearches().filter(s => s.toLowerCase() !== t.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
}
