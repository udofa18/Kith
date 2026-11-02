/**
 * One paged fetcher per feed tab. Each returns a FeedPage whose `nextCursor`
 * is fed back in to load the next page (see hooks/useFeed).
 */
import type { FeedItem, FeedPage, SearchParams, ViewerContext } from '../types';
import { engagementOf, reasonLabel, scoreItem, toDate } from '../ranking/score';
import { rankAndMix } from '../ranking/mix';
import { fetchPostsByAuthors, fetchPostsSince, fetchRecent, searchPosts, type SearchCursor, type SourceCursor, type SourceType } from './sources';

const PAGE_SIZE = 15;

const newestOf = (items: FeedItem[]) =>
  items.length ? Math.max(...items.map(i => toDate(i.data.createdAt).getTime())) : undefined;

/** Drops blocked or muted creators and items the viewer hid. Applies to every tab. */
const allowed = (viewer: ViewerContext) => {
  const hidden = new Set(viewer.preferences.hiddenItemIds);
  const muted = new Set(viewer.preferences.mutedCreatorIds);
  return (item: FeedItem) =>
    !hidden.has(item.id) && !viewer.blockedIds.has(item.data.authorUid) && !muted.has(item.data.authorUid);
};

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

  const fetched = results.flatMap(r => r.items);
  const scored = fetched
    .filter(allowed(viewer))
    .map(item => {
      const { score, reasons } = scoreItem(item, viewer);
      return { ...item, score, reasons, reason: reasonLabel(reasons) };
    });

  const hasMore = Object.values(next).some(c => c !== null);
  return { items: rankAndMix(scored), nextCursor: hasMore ? next : undefined, newestAt: newestOf(fetched) };
}

// ---------------------------------------------------------------- Following

export async function fetchFollowingPage(viewer: ViewerContext, before?: string): Promise<FeedPage<string>> {
  if (!viewer.uid || viewer.followingIds.size === 0) return { items: [] };

  // Include your own posts so the tab reflects what you just shared.
  const authors = [...viewer.followingIds, viewer.uid];
  const fetched = await fetchPostsByAuthors(authors, PAGE_SIZE, before);
  const last = fetched[fetched.length - 1];
  return {
    items: fetched.filter(allowed(viewer)),
    // Paginate on what was fetched, not what survived filtering, so hidden posts can't stall paging.
    nextCursor: fetched.length === PAGE_SIZE && last ? toDate(last.data.createdAt).toISOString() : undefined,
    newestAt: newestOf(fetched),
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
  const ageHours = (now - toDate(item.data.createdAt).getTime()) / 3_600_000;
  return engagementOf(item.data) / Math.pow(ageHours + 2, 1.5);
}

export async function fetchTrendingPage(viewer: ViewerContext): Promise<FeedPage> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000);
  const now = Date.now();
  const items = (await fetchPostsSince(since, TRENDING_POOL))
    .filter(allowed(viewer))
    .map(item => ({ ...item, score: trendingScore(item, now) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TRENDING_SIZE);
  return { items };
}

// ---------------------------------------------------------------- Search

export async function fetchSearchPage(viewer: ViewerContext, params: SearchParams, cursor?: SearchCursor): Promise<FeedPage<SearchCursor>> {
  // A round can come back empty while older posts remain, so keep going a few rounds before
  // handing back a page (an empty first page would read as "no results").
  const items: FeedItem[] = [];
  let next: SearchCursor | null | undefined = cursor;
  for (let round = 0; round < 4; round++) {
    const result = await searchPosts(params, PAGE_SIZE, next ?? undefined);
    items.push(...result.items.filter(allowed(viewer)));
    next = result.cursor;
    if (!next || items.length >= PAGE_SIZE) break;
  }
  return { items, nextCursor: next ?? undefined };
}
