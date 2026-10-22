/**
 * One paged fetcher per feed tab. Each returns a FeedPage whose `nextCursor`
 * is fed back in to load the next page (see hooks/useFeed).
 */
import type { FeedItem, FeedPage, SearchParams, ViewerContext } from '../types';
import { calculateFeedScore, extractSignals, toDate } from '../ranking/score';
import { rankAndMix } from '../ranking/mix';
import { fetchPostsByAuthors, fetchPostsSince, fetchRecent, searchPosts, type SourceCursor, type SourceType } from './sources';

const PAGE_SIZE = 15;

const notBlocked = (viewer: ViewerContext) => (item: FeedItem) => !viewer.blockedIds.has(item.data.authorUid);

// ---------------------------------------------------------------- For You

/**
 * How many of each type to pull per page. This doubles as a rough mix:
 * mostly posts, with a few articles and occasional events, products, and jobs.
 */
const FOR_YOU_MIX: Record<SourceType, number> = { post: 12, article: 3, challenge: 1, event: 1, product: 1, job: 1 };

/** Per-source position. A missing key means "start from the newest"; null means exhausted. */
export type ForYouCursor = Partial<Record<SourceType, SourceCursor | null>>;

export async function fetchForYouPage(viewer: ViewerContext, cursor: ForYouCursor = {}): Promise<FeedPage<ForYouCursor>> {
  const types = (Object.keys(FOR_YOU_MIX) as SourceType[]).filter(t => cursor[t] !== null);

  const results = await Promise.all(types.map(async type => {
    try {
      return { type, ...(await fetchRecent(type, FOR_YOU_MIX[type], cursor[type] ?? undefined)) };
    } catch (err) {
      // A missing collection or index shouldn't take down the whole feed.
      console.warn(`[feed] ${type} unavailable:`, err);
      return { type, items: [] as FeedItem[], cursor: null };
    }
  }));

  const next: ForYouCursor = { ...cursor };
  for (const r of results) next[r.type] = r.cursor;

  const scored = results
    .flatMap(r => r.items)
    .filter(notBlocked(viewer))
    .map(item => ({ ...item, ...calculateFeedScore(extractSignals(item, viewer)) }));

  const hasMore = Object.values(next).some(c => c !== null);
  return { items: rankAndMix(scored), nextCursor: hasMore ? next : undefined };
}

// ---------------------------------------------------------------- Following

export async function fetchFollowingPage(viewer: ViewerContext, before?: string): Promise<FeedPage<string>> {
  if (!viewer.uid || viewer.followingIds.size === 0) return { items: [] };

  // Include your own posts so the tab reflects what you just shared.
  const authors = [...viewer.followingIds, viewer.uid];
  const items = (await fetchPostsByAuthors(authors, PAGE_SIZE, before)).filter(notBlocked(viewer));
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: items.length === PAGE_SIZE && last ? toDate(last.data.createdAt).toISOString() : undefined,
  };
}

// ---------------------------------------------------------------- Trending

const TRENDING_WINDOW_DAYS = 7;
const TRENDING_POOL = 100;
const TRENDING_SIZE = 30;

/**
 * Engagement decayed by age (Hacker News-style gravity), so a post with
 * steady interaction today beats a bigger one from last week.
 */
function trendingScore(item: FeedItem, now: number) {
  const d = item.data;
  const engagement = (d.likesCount || 0) + 2 * (d.commentsCount || 0) + 3 * (d.repostsCount || 0);
  const ageHours = (now - toDate(d.createdAt).getTime()) / 3_600_000;
  return engagement / Math.pow(ageHours + 2, 1.5);
}

export async function fetchTrendingPage(viewer: ViewerContext): Promise<FeedPage> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000);
  const now = Date.now();
  const items = (await fetchPostsSince(since, TRENDING_POOL))
    .filter(notBlocked(viewer))
    .map(item => ({ ...item, score: trendingScore(item, now) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TRENDING_SIZE);
  return { items };
}

// ---------------------------------------------------------------- Search

export async function fetchSearchPage(viewer: ViewerContext, params: SearchParams, cursor?: SourceCursor): Promise<FeedPage<SourceCursor>> {
  const { items, cursor: next } = await searchPosts(params, PAGE_SIZE, cursor);
  return { items: items.filter(notBlocked(viewer)), nextCursor: next ?? undefined };
}
