import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  doc, 
  getDoc,
  Timestamp,
  Firestore
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getSupabase } from '../supabase';
import { calculateFeedScore, RankingSignals } from './rankingEngine';
import { contentRepository } from './db/postsRepository';
import { usersRepository } from './db/usersRepository';
import { dualRead } from './db/utils';
import { supabasePostToApp } from '../lib/db-mappers';
import { shouldReadCollectionFromSupabase } from '../lib/database-config';

export type ContentType = 'post' | 'article' | 'challenge' | 'event' | 'product' | 'job' | 'liveStream' | 'poll';

export interface FeedItem {
  id: string;
  type: ContentType;
  data: any;
  score: number;
  reason: string;
}

export interface UserEngagementProfile {
  likedTags: Record<string, number>;
  bookmarkedTags: Record<string, number>;
  purchasedCategories: string[];
  joinedCommunities: string[];
  interactionHistory: Array<{ creatorId: string; type: string; timestamp: any }>;
}

export interface UserInterests {
  categories: string[];
  skills: string[];
  hashtags: string[];
  followedTopics: string[];
}

export class FeedService {
  constructor(private firestore: Firestore) {}

  async getUserInterests(userId: string): Promise<UserInterests | null> {
    if (!userId || userId === 'anonymous') return null;

    return dualRead(
      async () => {
        const snap = await getDoc(doc(this.firestore, 'userInterests', userId));
        return snap.exists() ? snap.data() as UserInterests : null;
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('user_interests')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
          categories: data.categories || [],
          skills: data.skills || [],
          hashtags: data.hashtags || [],
          followedTopics: data.followed_topics || [],
        };
      },
      'user_interests'
    );
  }

  async getUserEngagementProfile(userId: string): Promise<UserEngagementProfile | null> {
    if (!userId || userId === 'anonymous') return null;

    return dualRead(
      async () => {
        const snap = await getDoc(doc(this.firestore, 'userEngagementProfiles', userId));
        return snap.exists() ? snap.data() as UserEngagementProfile : null;
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('user_engagement_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
          likedTags: (data.liked_tags as Record<string, number>) || {},
          bookmarkedTags: (data.bookmarked_tags as Record<string, number>) || {},
          purchasedCategories: data.purchased_categories || [],
          joinedCommunities: data.joined_communities || [],
          interactionHistory: (data.interaction_history as UserEngagementProfile['interactionHistory']) || [],
        };
      },
      'user_engagement_profiles'
    );
  }

  private normalizeCandidate(id: string, type: ContentType, data: any): FeedItem {
    return {
      id,
      type,
      data: {
        id,
        ...data,
        authorUid: data.authorUid || data.author_uid || data.creatorUid || data.creator_uid || data.hostId || data.host_id,
        authorName: data.authorName || data.author_name || data.creatorName || data.company || 'Anonymous',
        authorPhoto: data.authorPhoto || data.author_photo || data.creatorPhoto || '',
        content: data.content || data.description || '',
        contentType: type,
        likesCount: data.likesCount ?? data.likes_count ?? 0,
        commentsCount: data.commentsCount ?? data.comments_count ?? 0,
        createdAt: data.createdAt || data.created_at,
      },
      score: 0,
      reason: '',
    };
  }

  private async fetchFromSupabaseTable(
    table: string,
    type: ContentType,
    filters?: { column: string; value: unknown }[],
    limitCount = 20
  ): Promise<FeedItem[]> {
    let q = getSupabase().from(table).select('*');
    for (const f of filters || []) {
      q = q.eq(f.column, f.value as string);
    }
    const orderCol = table === 'articles' ? 'created_at' : 'created_at';
    q = q.order(orderCol, { ascending: false }).limit(limitCount);
    const { data, error } = await q;
    if (error) throw error;

    return (data || []).map((row) => {
      const appData = table === 'posts' ? supabasePostToApp(row as Record<string, unknown>) : row;
      return this.normalizeCandidate((row as { id: string }).id, type, appData);
    });
  }

  private async fetchCandidates(): Promise<FeedItem[]> {
    const useSupabase = shouldReadCollectionFromSupabase('posts') || shouldReadCollectionFromSupabase('articles');

    if (useSupabase) {
      const [posts, articles, challenges, events, products, jobs] = await Promise.all([
        this.fetchFromSupabaseTable('posts', 'post', [{ column: 'visibility', value: 'public' }]).catch(() => []),
        this.fetchFromSupabaseTable('articles', 'article', [{ column: 'status', value: 'published' }]).catch(() => []),
        this.fetchFromSupabaseTable('challenges', 'challenge').catch(() => []),
        this.fetchFromSupabaseTable('events', 'event', [{ column: 'visibility', value: 'public' }]).catch(() => []),
        this.fetchFromSupabaseTable('products', 'product').catch(() => []),
        this.fetchFromSupabaseTable('jobs', 'job').catch(() => []),
      ]);
      return [...posts, ...articles, ...challenges, ...events, ...products, ...jobs];
    }

    const candidates: FeedItem[] = [];
    const collections: { path: string; type: ContentType }[] = [
      { path: 'posts', type: 'post' },
      { path: 'articles', type: 'article' },
      { path: 'challenges', type: 'challenge' },
      { path: 'events', type: 'event' },
      { path: 'products', type: 'product' },
      { path: 'jobs', type: 'job' },
    ];

    const promises = collections.map(async ({ path, type }) => {
      try {
        let q;
        if (type === 'post') {
          q = query(collection(this.firestore, path), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(20));
        } else if (type === 'article') {
          q = query(collection(this.firestore, path), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(20));
        } else if (type === 'event') {
          q = query(collection(this.firestore, path), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(20));
        } else {
          q = query(collection(this.firestore, path), orderBy('createdAt', 'desc'), limit(20));
        }
        
        const snap = await getDocs(q);
        snap.forEach(d => {
          candidates.push(this.normalizeCandidate(d.id, type, d.data()));
        });
      } catch (e) {
        console.warn(`Failed to fetch ${type}:`, e);
      }
    });

    await Promise.all(promises);
    return candidates;
  }

  private async getBlockedUserIds(userId: string): Promise<Set<string>> {
    if (userId === 'anonymous') return new Set();

    const ids = await dualRead(
      async () => {
        const snap = await getDocs(collection(this.firestore, 'users', userId, 'blockedUsers'));
        return snap.docs.map(d => d.id);
      },
      async () => {
        const { data, error } = await getSupabase()
          .from('user_blocked_users')
          .select('blocked_user_id')
          .eq('user_id', userId);
        if (error) throw error;
        return (data || []).map(r => r.blocked_user_id);
      },
      'user_blocked_users'
    );

    return new Set(ids);
  }

  async getPersonalizedFeed(userId: string): Promise<FeedItem[]> {
    const [interests, profile, allCandidates, blockedIds] = await Promise.all([
      this.getUserInterests(userId),
      this.getUserEngagementProfile(userId),
      this.fetchCandidates(),
      this.getBlockedUserIds(userId),
    ]);

    const rankedFeed = allCandidates
      .filter(item => !blockedIds.has(item.data.authorUid || item.data.creatorUid || item.data.hostId))
      .map(item => {
        const signals = this.extractSignals(item, interests, profile, userId);
        const { score, reason } = calculateFeedScore(signals);
        return { ...item, score, reason };
      });

    const finalFeed: FeedItem[] = [];
    const creatorCounts: Record<string, number> = {};
    
    for (const item of rankedFeed.filter(item => item.score > -1).sort((a, b) => b.score - a.score)) {
      const creatorId = item.data.authorUid || item.data.creatorUid || item.data.hostId || 'unknown';
      if ((creatorCounts[creatorId] || 0) < 3) {
        finalFeed.push(item);
        creatorCounts[creatorId] = (creatorCounts[creatorId] || 0) + 1;
      }
      if (finalFeed.length >= 40) break;
    }

    return finalFeed;
  }

  private extractSignals(
    item: FeedItem, 
    interests: UserInterests | null, 
    profile: UserEngagementProfile | null,
    userId: string
  ): RankingSignals {
    const data = item.data;
    const itemCreatorId = data.authorUid || data.creatorUid || data.hostId;
    
    const hasTagMatch = (tags: string[] = []) => {
      if (!interests) return false;
      return tags.some(tag => interests.hashtags.includes(tag) || interests.followedTopics.includes(tag));
    };

    const hasCategoryMatch = (category: string) => {
      if (!interests) return false;
      return interests.categories.includes(category);
    };

    return {
      isFollowing: false,
      mutualConnections: 0,
      sharedCommunities: profile?.joinedCommunities.includes(data.communityId) ? 1 : 0,
      pastInteractionsCount: profile?.interactionHistory.filter(i => i.creatorId === itemCreatorId).length || 0,
      hasDMHistory: false,
      viewedProfileRecently: false,
      matchesInterests: hasCategoryMatch(data.category),
      matchesFollowedHashtags: hasTagMatch(data.hashtags || data.tags),
      matchesTechStack: data.skills?.some((s: string) => interests?.skills.includes(s)) || false,
      topicRelevance: 0.5,
      likesCount: (data.likesCount || data.likes || 0) / 1000,
      commentsCount: (data.commentsCount || 0) / 500,
      repostsCount: 0,
      bookmarksCount: (data.bookmarksCount || 0) / 100,
      avgDwellTime: 0.5,
      completionRate: 1,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt || new Date()),
      engagementVelocity: 0,
      creatorReputation: 0.7,
      isVerified: false,
      reportRate: 0,
      matchesPastLikes: false,
      matchesPurchases: profile?.purchasedCategories.includes(data.category) || false,
      matchesAttendedEvents: false,
      isPromoted: data.isPromoted || false,
      relevanceToPurchases: 0,
      isMuted: false,
      isHidden: false,
      isReported: false,
      alreadyViewedCount: 0
    };
  }

  async getTrendingFeed(): Promise<FeedItem[]> {
    const userId = auth.currentUser?.uid || 'anonymous';
    const [candidates, blockedIds] = await Promise.all([
      this.fetchCandidates(),
      this.getBlockedUserIds(userId),
    ]);

    return candidates
      .filter(item => !blockedIds.has(item.data.authorUid || item.data.creatorUid || item.data.hostId))
      .map(item => ({
        ...item,
        score: (item.data.likesCount || 0) + (item.data.commentsCount || 0) * 2,
        reason: "Trending now"
      }))
      .sort((a, b) => b.score - a.score);
  }

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
