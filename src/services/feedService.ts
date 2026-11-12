import { collection, query, getDocs, getDoc, doc, orderBy, limit, Firestore } from 'firebase/firestore';
import { db } from '../firebase';
import { getSupabase } from '../supabase';
import { contentRepository } from './db/postsRepository';
import { usersRepository } from './db/usersRepository';
import { dualRead } from './db/utils';

/**
 * Sidebar and discovery queries. The main feed (For You, Following, Trending, search)
 * lives in src/features/feed.
 */
export class FeedService {
  constructor(private firestore: Firestore) {}

  /** Largest communities by member count. */
  async getTrendingCommunities(count: number = 5): Promise<any[]> {
    return contentRepository.queryCollection('communities', 'communities', {
      orderBy: { field: 'memberCount', desc: true },
      limit: count,
    });
  }

  async getTrendingTags(count: number = 5): Promise<any[]> {
    return dualRead(
      async () => {
        const snap = await getDocs(query(collection(this.firestore, 'hashtags'), orderBy('count', 'desc'), limit(count)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('hashtags')
          .select('*')
          .order('count', { ascending: false })
          .limit(count);
        if (error) throw error;
        return (data || []).map(row => ({ id: row.id, name: row.tag, count: row.count }));
      },
      'hashtags'
    );
  }

  /**
   * Public events split into happening now and upcoming (soonest first); ended events are dropped.
   * Dates are stored inconsistently (ISO strings, Timestamps, snake_case in Postgres), so we
   * scan recent events and sort client-side rather than relying on a date index.
   */
  async getUpcomingEvents(count: number = 5): Promise<{ live: any[]; upcoming: any[] }> {
    const events = await contentRepository.queryCollection('events', 'events', {
      filters: [{ field: 'visibility', op: 'eq', value: 'public' }],
      orderBy: { field: 'createdAt', desc: true },
      limit: 40,
    });
    const now = Date.now();
    const withTimes = events.map(e => ({
      ...e,
      startMs: toMillis(e.startDate ?? e.start_date),
      endMs: toMillis(e.endDate ?? e.end_date),
    }));
    return {
      live: withTimes.filter(e => e.startMs <= now && e.endMs > now).slice(0, count),
      upcoming: withTimes.filter(e => e.startMs > now).sort((a, b) => a.startMs - b.startMs).slice(0, count),
    };
  }

  /**
   * Every discoverable room that is inside its live window.
   *
   * Public rooms come from the usual list query. Followers-only rooms are read
   * one by one from the on-air ids, because Firestore rules only allow the host
   * and their followers to read those documents; a broad followers query would
   * be rejected for everyone else. Unlisted rooms stay link-only.
   */
  async getLiveNowEvents(extraIds: string[] = []): Promise<any[]> {
    const publicEvents = await contentRepository.queryCollection('events', 'events', {
      filters: [{ field: 'visibility', op: 'eq', value: 'public' }],
      orderBy: { field: 'createdAt', desc: true },
      limit: 40,
    });

    const byId = new Map<string, any>();
    publicEvents.forEach((event) => {
      const id = event?.id;
      if (typeof id === 'string' && id) byId.set(id, event);
    });

    // Presence tells us exactly which rooms are on air, including rooms that
    // were created after the public list was cached.
    const missing = [...new Set(extraIds)].filter(
      (id) => typeof id === 'string' && id && !byId.has(id),
    );
    await Promise.all(
      missing.map(async (id) => {
        try {
          const snapshot = await getDoc(doc(this.firestore, 'events', id));
          if (snapshot.exists()) {
            byId.set(id, { id: snapshot.id, ...snapshot.data() });
          }
        } catch {
          // A followers-only room the viewer cannot read stays private.
        }
      }),
    );

    const now = Date.now();
    return [...byId.values()]
      .filter((event) => event.visibility === 'public' || event.visibility === 'followers')
      .map((event) => ({
        ...event,
        startMs: toMillis(event.startDate ?? event.start_date),
        endMs: toMillis(event.endDate ?? event.end_date),
      }))
      .filter((event) => event.startMs <= now && event.endMs > now)
      .sort((a, b) => b.startMs - a.startMs);
  }

  async getFeaturedArticles(count: number = 5): Promise<any[]> {
    return contentRepository.queryCollection('articles', 'articles', {
      filters: [{ field: 'status', op: 'eq', value: 'published' }],
      orderBy: { field: 'createdAt', desc: true },
      limit: count,
    });
  }

  /** Active challenges still accepting submissions, closing soonest first. */
  async getFeaturedChallenges(count: number = 3): Promise<any[]> {
    const challenges = await contentRepository.queryCollection('challenges', 'challenges', {
      filters: [{ field: 'status', op: 'eq', value: 'active' }],
      limit: 20,
    });
    const now = Date.now();
    const deadline = (c: any) => toMillis(c.deadlines?.submissionEnd);
    return challenges
      .filter(c => !deadline(c) || deadline(c) > now)
      .sort((a, b) => (deadline(a) || Infinity) - (deadline(b) || Infinity))
      .slice(0, count);
  }

  async getTopCreators(count: number = 5): Promise<any[]> {
    return usersRepository.getTopByXp(count);
  }

  async getCommunities(): Promise<any[]> {
    return contentRepository.queryCollection('communities', 'communities', {
      orderBy: { field: 'createdAt', desc: true },
    });
  }
}

/** Accepts Firestore Timestamps, {seconds}, ISO strings, or epoch ms. Returns 0 when missing. */
function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export const feedService = new FeedService(db);
