export type FeedTab = 'foryou' | 'following' | 'trending' | 'search';

export type ContentType = 'post' | 'article' | 'challenge' | 'event' | 'product' | 'job' | 'liveStream' | 'poll';

export interface FeedItem {
  id: string;
  type: ContentType;
  /** Normalized record passed straight to PostCard. */
  data: any;
  score: number;
  /** Why this item is shown. Empty when there's nothing more specific than "recommended". */
  reason: string;
}

export interface FeedPage<Cursor = unknown> {
  items: FeedItem[];
  /** Undefined when there are no more pages. */
  nextCursor?: Cursor;
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
}

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
}
