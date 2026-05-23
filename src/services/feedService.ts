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
  startAfter,
  DocumentSnapshot,
  Firestore
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { calculateFeedScore, RankingSignals, RankingWeights } from './rankingEngine';

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
    try {
      const docRef = doc(this.firestore, 'userInterests', userId);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() as UserInterests : null;
    } catch {
      return null;
    }
  }

  async getUserEngagementProfile(userId: string): Promise<UserEngagementProfile | null> {
    if (!userId || userId === 'anonymous') return null;
    try {
      const docRef = doc(this.firestore, 'userEngagementProfiles', userId);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() as UserEngagementProfile : null;
    } catch {
      return null;
    }
  }

  private async fetchCandidates(): Promise<FeedItem[]> {
    const candidates: FeedItem[] = [];
    
    // In a real app, this would be much more selective or happen in a function
    // Fetch recent items from various collections
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
          const data = d.data() as any;
          candidates.push({
            id: d.id,
            type,
            data: { 
              id: d.id, 
              ...data,
              // Normalize common fields for UI/ranking consistency
              authorUid: data.authorUid || data.creatorUid || data.hostId,
              authorName: data.authorName || data.creatorName || data.company || 'Anonymous',
              authorPhoto: data.authorPhoto || data.creatorPhoto || '',
              content: data.content || data.description || '',
              contentType: type,
            },
            score: 0,
            reason: ''
          });
        });
      } catch (e) {
        console.warn(`Failed to fetch ${type}:`, e);
      }
    });

    await Promise.all(promises);
    return candidates;
  }

  async getPersonalizedFeed(userId: string): Promise<FeedItem[]> {
    const [interests, profile, allCandidates, blockedSnap] = await Promise.all([
      this.getUserInterests(userId),
      this.getUserEngagementProfile(userId),
      this.fetchCandidates(),
      (async () => {
        if (userId === 'anonymous') return null;
        try {
          return await getDocs(collection(this.firestore, 'users', userId, 'blockedUsers'));
        } catch (e) {
          console.warn("Blocked users fetch failed:", e);
          return null;
        }
      })()
    ]);

    const blockedIds = new Set(blockedSnap?.docs.map(d => d.id) || []);

    const rankedFeed = allCandidates
      .filter(item => !blockedIds.has(item.data.authorUid || item.data.creatorUid || item.data.hostId))
      .map(item => {
        const signals = this.extractSignals(item, interests, profile, userId);
        const { score, reason } = calculateFeedScore(signals);
        return { ...item, score, reason };
      });

    // Diversity control: limit consecutive items from the same creator
    const finalFeed: FeedItem[] = [];
    const creatorCounts: Record<string, number> = {};
    
    for (const item of rankedFeed.filter(item => item.score > -1).sort((a, b) => b.score - a.score)) {
      const creatorId = item.data.authorUid || item.data.creatorUid || item.data.hostId || 'unknown';
      if ((creatorCounts[creatorId] || 0) < 3) { // Max 3 items from same creator in one view
        finalFeed.push(item);
        creatorCounts[creatorId] = (creatorCounts[creatorId] || 0) + 1;
      }
      if (finalFeed.length >= 40) break; // Limit first page
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
    
    // Helper to check for matches
    const hasTagMatch = (tags: string[] = []) => {
      if (!interests) return false;
      return tags.some(tag => interests.hashtags.includes(tag) || interests.followedTopics.includes(tag));
    };

    const hasCategoryMatch = (category: string) => {
      if (!interests) return false;
      return interests.categories.includes(category);
    };

    return {
      isFollowing: false, // Would check a 'follows' collection in real app
      mutualConnections: 0,
      sharedCommunities: profile?.joinedCommunities.includes(data.communityId) ? 1 : 0,
      pastInteractionsCount: profile?.interactionHistory.filter(i => i.creatorId === itemCreatorId).length || 0,
      hasDMHistory: false,
      viewedProfileRecently: false,

      matchesInterests: hasCategoryMatch(data.category),
      matchesFollowedHashtags: hasTagMatch(data.hashtags || data.tags),
      matchesTechStack: data.skills?.some((s: string) => interests?.skills.includes(s)) || false,
      topicRelevance: 0.5, // Default

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

  // Other feed modes
  async getTrendingFeed(): Promise<FeedItem[]> {
    const userId = auth.currentUser?.uid;
    // Trending: filter candidates by engagement metrics within last 24h
    const [candidates, blockedSnap] = await Promise.all([
      this.fetchCandidates(),
      (async () => {
        if (!userId) return null;
        try {
          return await getDocs(collection(this.firestore, 'users', userId, 'blockedUsers'));
        } catch (e) {
          console.warn("Blocked users fetch failed in trending:", e);
          return null;
        }
      })()
    ]);

    const blockedIds = new Set(blockedSnap?.docs.map(d => d.id) || []);

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
    const q = query(collection(this.firestore, 'communities'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getTrendingTags(count: number = 5): Promise<any[]> {
    const q = query(collection(this.firestore, 'hashtags'), orderBy('count', 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  }

  async getUpcomingEvents(count: number = 5): Promise<any[]> {
    const q = query(
      collection(this.firestore, 'events'), 
      where('visibility', '==', 'public'), // Corrected: events usually use visibility
      limit(count)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getFeaturedArticles(count: number = 5): Promise<any[]> {
    const q = query(
      collection(this.firestore, 'articles'),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc'),
      limit(count)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getFeaturedChallenges(count: number = 3): Promise<any[]> {
    const q = query(
      collection(this.firestore, 'challenges'),
      where('status', '==', 'active'),
      limit(count)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getTopCreators(count: number = 5): Promise<any[]> {
    const q = query(collection(this.firestore, 'users'), orderBy('xp', 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getCommunities(): Promise<any[]> {
    const q = query(collection(this.firestore, 'communities'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export const feedService = new FeedService(db);
