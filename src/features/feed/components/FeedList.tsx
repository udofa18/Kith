import { useEffect, type ReactNode } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import PostCard from '../../../components/PostCard';
import { useInView } from '../../../hooks/useInView';
import type { FeedItem } from '../types';

interface FeedListProps {
  items: FeedItem[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
  empty: ReactNode;
}

export default function FeedList({
  items, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, empty,
}: FeedListProps) {
  const { ref: sentinel, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) return <FeedSkeleton />;

  if (isError && items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-semibold mb-1">Couldn't load the feed</p>
        <p className="text-sm text-black/50 dark:text-white/50 mb-5">Check your connection and try again.</p>
        <button
          onClick={refetch}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/5 dark:bg-white/10 text-sm font-semibold hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) return <>{empty}</>;

  return (
    <div>
      {items.map(item => (
        <div key={`${item.type}-${item.id}`}>
          {item.reason && (
            <p className="px-6 pt-4 -mb-2 flex items-center gap-1.5 text-xs text-black/40 dark:text-white/40">
              <Sparkles size={11} className="text-primary/70" /> {item.reason}
            </p>
          )}
          <PostCard post={item.data} isDetailView={false} />
        </div>
      ))}

      <div ref={sentinel} className="h-px" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-8">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      )}

      {!hasNextPage && (
        <p className="py-10 text-center text-sm text-black/40 dark:text-white/40 border-t border-black/10 dark:border-white/10">
          You're all caught up
        </p>
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="px-6 py-5 border-b border-black/10 dark:border-white/10 animate-pulse">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10" />
            <div className="space-y-2">
              <div className="h-3 w-32 rounded bg-black/10 dark:bg-white/10" />
              <div className="h-2.5 w-20 rounded bg-black/5 dark:bg-white/5" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-black/5 dark:bg-white/5" />
            <div className="h-3 w-4/5 rounded bg-black/5 dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
