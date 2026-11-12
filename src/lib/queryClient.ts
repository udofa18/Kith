import { QueryClient, keepPreviousData } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { feedQueryOptions } from '../features/feed/hooks/useFeed';

export const STALE = {
  feed: 1000 * 60 * 2,
  sidebar: 1000 * 60 * 10,
  communities: 1000 * 60 * 10,
  community: 1000 * 60 * 5,
  channels: 1000 * 60 * 5,
} as const;

export const queryKeys = {
  feed: (feedType: string, userId?: string | null, params?: string) =>
    ['feed', feedType, userId ?? 'anonymous', params ?? '{}'] as const,
  feedViewer: (userId?: string | null) => ['feed-viewer', userId ?? 'anonymous'] as const,
  user: (uid: string) => ['user', uid] as const,
  communities: () => ['communities'] as const,
  community: (id: string) => ['community', id] as const,
  communityChannels: (id: string) => ['community-channels', id] as const,
  trendingCommunities: () => ['trending-communities'] as const,
  trendingTags: () => ['trending-tags'] as const,
  topCreators: () => ['top-creators'] as const,
  upcomingEvents: () => ['upcoming-events'] as const,
  liveNowEvents: () => ['live-now-events'] as const,
  liveSessionInfo: (eventId: string) => ['live-session-info', eventId] as const,
  featuredArticles: () => ['featured-articles'] as const,
  featuredChallenges: () => ['featured-challenges'] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE.community,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export async function prefetchFeedExperienceData(userId?: string | null) {
  await Promise.allSettled([
    queryClient.prefetchInfiniteQuery(feedQueryOptions(queryClient, 'foryou', userId ?? null)),
    queryClient.prefetchQuery({
      queryKey: queryKeys.communities(),
      queryFn: () => feedService.getCommunities(),
      staleTime: STALE.communities,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.trendingCommunities(),
      queryFn: () => feedService.getTrendingCommunities(5),
      staleTime: STALE.sidebar,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.trendingTags(),
      queryFn: () => feedService.getTrendingTags(5),
      staleTime: STALE.sidebar,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.topCreators(),
      queryFn: () => feedService.getTopCreators(5),
      staleTime: STALE.sidebar,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.upcomingEvents(),
      queryFn: () => feedService.getUpcomingEvents(5),
      staleTime: STALE.sidebar,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.featuredArticles(),
      queryFn: () => feedService.getFeaturedArticles(5),
      staleTime: STALE.sidebar,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.featuredChallenges(),
      queryFn: () => feedService.getFeaturedChallenges(3),
      staleTime: STALE.sidebar,
    }),
  ]);
}

export { keepPreviousData };
