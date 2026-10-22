import { useInfiniteQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys, STALE } from '../../../lib/queryClient';
import type { FeedPage, FeedTab, SearchParams, ViewerContext } from '../types';
import { fetchViewerContext } from '../api/viewer';
import { getFollowingIds } from '../../../services/socialService';
import { fetchFollowingPage, fetchForYouPage, fetchSearchPage, fetchTrendingPage } from '../api/feedApi';

const VIEWER_STALE = 1000 * 60 * 5;

function getViewer(client: QueryClient, uid: string | null): Promise<ViewerContext> {
  return client.fetchQuery({
    queryKey: queryKeys.feedViewer(uid),
    queryFn: () => fetchViewerContext(uid),
    staleTime: VIEWER_STALE,
  });
}

export async function fetchFeedPage(
  client: QueryClient,
  tab: FeedTab,
  uid: string | null,
  params: SearchParams,
  cursor: any,
): Promise<FeedPage> {
  let viewer = await getViewer(client, uid);
  switch (tab) {
    case 'foryou': return fetchForYouPage(viewer, cursor);
    case 'following':
      // Re-read follows on the first page so someone you just followed shows up immediately.
      if (!cursor && uid) {
        viewer = { ...viewer, followingIds: new Set(await getFollowingIds(uid)) };
        client.setQueryData(queryKeys.feedViewer(uid), viewer);
      }
      return fetchFollowingPage(viewer, cursor);
    case 'trending': return fetchTrendingPage(viewer);
    case 'search': return fetchSearchPage(viewer, params, cursor);
  }
}

export function feedQueryOptions(client: QueryClient, tab: FeedTab, uid: string | null, params: SearchParams = {}) {
  return {
    queryKey: queryKeys.feed(tab, uid, JSON.stringify(params)),
    queryFn: ({ pageParam }: { pageParam: unknown }) => fetchFeedPage(client, tab, uid, params, pageParam),
    initialPageParam: undefined as unknown,
    getNextPageParam: (last: FeedPage) => last.nextCursor,
    staleTime: STALE.feed,
  };
}

export function useFeed(tab: FeedTab, uid: string | null, params: SearchParams = {}) {
  const client = useQueryClient();
  const query = useInfiniteQuery(feedQueryOptions(client, tab, uid, params));
  const items = query.data?.pages.flatMap(p => p.items) ?? [];
  return { ...query, items };
}
