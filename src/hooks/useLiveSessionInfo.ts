import { useQuery } from '@tanstack/react-query';
import { fetchLiveSessionInfo, type LiveSessionInfo } from '../lib/liveSessionInfo';
import { queryKeys } from '../lib/queryClient';

/**
 * Live lobby/peek data, refreshed while it is on screen so the participant
 * count and "ended" state stay honest without rejoining the room.
 */
export function useLiveSessionInfo(eventId: string | null | undefined, enabled = true) {
  return useQuery<LiveSessionInfo>({
    queryKey: queryKeys.liveSessionInfo(eventId ?? ''),
    queryFn: () => fetchLiveSessionInfo(eventId as string),
    enabled: !!eventId && enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 20_000 : false,
    retry: 1,
  });
}
