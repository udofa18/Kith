export type FeedTab = 'foryou' | 'following' | 'trending' | 'search';

export type ContentType = 'post' | 'article' | 'challenge' | 'event' | 'product' | 'job' | 'liveStream' | 'poll';

export interface FeedItem {
  id: string;
  type: ContentType;
  /** Normalized record passed straight to PostCard. */
  data: any;
  score: number;
  /** Everything that boosted this item; drives "Why am I seeing this?". */
  reasons: Reason[];
  /** Short label for the card. Empty when there's nothing worth calling out. */
  reason: string;
}

export type Reason =
  | { kind: 'following' }
  | { kind: 'creator' }
  | { kind: 'interest'; topic: string }
  | { kind: 'popular' }
  | { kind: 'new' }
  | { kind: 'discovery' };

export interface FeedPage<Cursor = unknown> {
  items: FeedItem[];
  /** Undefined when there are no more pages. */
  nextCursor?: Cursor;
  /** Newest createdAt (ms) among everything fetched, including items filtered out. */
  newestAt?: number;
}

export interface SearchParams {
  search?: string;
  hashtag?: string;
}

/** Everything about the viewer that ranking needs; fetched once and cached per session. */
export interface ViewerContext {
  uid: string | null;
  followingIds: Set<string>;
  blockedIds: Set<string>;
  interests: UserInterests | null;
  profile: UserEngagementProfile | null;
  preferences: FeedPreferences;
}

/** Explicit choices the viewer made from the feed menu. */
export interface FeedPreferences {
  hiddenItemIds: string[];
  mutedCreatorIds: string[];
  lessTopics: string[];
}

export const EMPTY_PREFERENCES: FeedPreferences = { hiddenItemIds: [], mutedCreatorIds: [], lessTopics: [] };

export interface UserInterests {
  categories: string[];
  skills: string[];
  hashtags: string[];
  followedTopics: string[];
}

export interface UserEngagementProfile {
  likedTags: Record<string, number>;
  bookmarkedTags: Record<string, number>;
  purchasedCategories: string[];
  joinedCommunities: string[];
  interactionHistory: Array<{ creatorId: string; type: string; timestamp: any }>;
  /** Most recent items the viewer has seen, newest first (capped). */
  seenItemIds: string[];
}
