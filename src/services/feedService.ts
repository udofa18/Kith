import { collection, query, getDocs, orderBy, limit, Firestore } from 'firebase/firestore';
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

  async getTrendingCommunities(count: number = 5): Promise<any[]> {
    return contentRepository.queryCollection('communities', 'communities', { limit: count });
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
        return (data || []).map(row => ({ id: row.id, tag: row.tag, count: row.count }));
      },
      'hashtags'
    );
  }

  async getUpcomingEvents(count: number = 5): Promise<any[]> {
    return contentRepository.queryCollection('events', 'events', {
      filters: [{ field: 'visibility', op: 'eq', value: 'public' }],
      limit: count,
    });
  }

  async getFeaturedArticles(count: number = 5): Promise<any[]> {
    return contentRepository.queryCollection('articles', 'articles', {
      filters: [{ field: 'status', op: 'eq', value: 'published' }],
      orderBy: { field: 'createdAt', desc: true },
      limit: count,
    });
  }

  async getFeaturedChallenges(count: number = 3): Promise<any[]> {
    return contentRepository.queryCollection('challenges', 'challenges', {
      filters: [{ field: 'status', op: 'eq', value: 'active' }],
      limit: count,
    });
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

export const feedService = new FeedService(db);
