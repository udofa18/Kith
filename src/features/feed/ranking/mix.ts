import type { FeedItem } from '../types';

/** Highest score first, keeping at most `perCreator` items from any one creator. */
export function rankAndMix(items: FeedItem[], perCreator = 3): FeedItem[] {
  const counts = new Map<string, number>();
  return [...items]
    .filter(item => item.score > -1)
    .sort((a, b) => b.score - a.score)
    .filter(item => {
      const creator = item.data.authorUid || 'unknown';
      const n = counts.get(creator) || 0;
      if (n >= perCreator) return false;
      counts.set(creator, n + 1);
      return true;
    });
}
