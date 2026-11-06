import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Flame, Inbox, MessageSquare, Search as SearchIcon, Users } from 'lucide-react';
import PostEditor, { type PostKind } from '../../../components/PostEditor';
import { SearchBox } from '../../../components/SocialLeftSidebar';
import SearchExtras from '../../search/SearchExtras';
import StatusTray from '../../status/StatusTray';
import GettingStartedCard from '../../../components/GettingStartedCard';
import { useCurrentUser } from '../../../contexts/CurrentUserContext';
import { queryKeys } from '../../../lib/queryClient';
import { fetchViewerContext } from '../api/viewer';
import { useFeed } from '../hooks/useFeed';
import { useNewPosts } from '../hooks/useNewPosts';
import type { FeedTab, SearchParams } from '../types';
import FeedTabs from './FeedTabs';
import FeedList from './FeedList';
import FeedEmpty from './FeedEmpty';
import PageHeader from '../../../components/ui/PageHeader';
import LiveNowRow from './LiveNowRow';
import AwayDigest from './AwayDigest';
import CreateInstantSessionModal from '../../../components/CreateInstantSessionModal';

export function tabFromParams(params: URLSearchParams, fallback: FeedTab = 'foryou'): FeedTab {
  const view = params.get('view');
  if (view === 'following' || view === 'trending' || view === 'foryou') return view;
  if (params.get('search') || params.get('hashtag')) return 'search';
  return fallback;
}

const createdAtMs = (item: { data?: Record<string, any> }) => {
  const value = item.data?.createdAt;
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const uid: string | null = user?.uid ?? null;
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mountedAt = useRef(Date.now());
  const [showInstantSession, setShowInstantSession] = useState(false);

  const defaultTab: FeedTab = user?.settings?.feed?.defaultTab === 'following' ? 'following' : 'foryou';
  const tab = tabFromParams(searchParams, defaultTab);
  const search = searchParams.get('search') || undefined;
  const hashtag = searchParams.get('hashtag') || undefined;
  const params = useMemo<SearchParams>(() => (tab === 'search' ? { search, hashtag } : {}), [tab, search, hashtag]);

  const feed = useFeed(tab, uid, params);
  const feedSettings = user?.settings?.feed;

  // Format filters and "pause personalisation" are applied to the merged pages so
  // they also affect cached results that were fetched before the setting changed.
  const items = useMemo(() => {
    if (!feedSettings) return feed.items;
    let next = feed.items.filter((item) => {
      if (!feedSettings.showArticles && item.type === 'article') return false;
      if (!feedSettings.showProductsEvents && (item.type === 'event' || item.type === 'product')) return false;
      if (!feedSettings.showPolls && (item.type === 'poll' || item.data?.poll)) return false;
      if (
        !feedSettings.showReposts &&
        (item.data?.originalPostId || item.data?.type === 'repost' || item.data?.type === 'quote')
      ) {
        return false;
      }
      return true;
    });
    if (feedSettings.pausePersonalization) {
      next = [...next].sort((a, b) => createdAtMs(b) - createdAtMs(a));
    }
    return next;
  }, [feed.items, feedSettings]);
  const { data: viewer } = useQuery({
    queryKey: queryKeys.feedViewer(uid),
    queryFn: () => fetchViewerContext(uid),
    staleTime: 1000 * 60 * 5,
  });

  // Anything newer than the newest item fetched for the first page counts as a new post.
  const since = feed.data?.pages[0]?.newestAt ?? mountedAt.current;
  const excludeAuthors = useMemo(
    () => new Set([...(viewer?.blockedIds ?? []), ...(viewer?.preferences.mutedCreatorIds ?? [])]),
    [viewer],
  );
  const excludeIds = useMemo(() => new Set(viewer?.preferences.hiddenItemIds ?? []), [viewer]);
  const hasNewPosts = useNewPosts({
    enabled: !!feed.data && (tab === 'foryou' || (tab === 'following' && !!viewer)),
    since,
    uid,
    onlyFrom: tab === 'following' ? viewer?.followingIds : undefined,
    excludeAuthors,
    excludeIds,
  });

  const showNewPosts = () => {
    rootRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
    queryClient.resetQueries({ queryKey: queryKeys.feed(tab, uid, JSON.stringify(params)) });
  };

  const setTab = (next: FeedTab) => setSearchParams({ view: next });

  // `?compose=shiplog|feedback` (e.g. from the streak card) opens the composer in that mode.
  const composeParam = searchParams.get('compose');
  const composeKind: PostKind | undefined = composeParam === 'shiplog' || composeParam === 'feedback' ? composeParam : undefined;
  useEffect(() => {
    if (!composeKind || !uid) return;
    const t = setTimeout(focusComposer, 50);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.delete('compose');
      return p;
    }, { replace: true });
    return () => clearTimeout(t);
  }, [composeKind, uid]);
  const clearQuote = () => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    p.delete('quote');
    return p;
  });

  const onPostCreated = () => {
    clearQuote();
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  const focusComposer = () => {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    editorRef.current?.querySelector<HTMLElement>('textarea, [contenteditable="true"]')?.focus();
  };

  const signInPrompt = (
    <div className="p-10 border-b border-black/10 dark:border-white/10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
        <MessageSquare size={22} />
      </div>
      <p className="font-semibold mb-1">Join the conversation</p>
      <p className="text-sm text-black/50 dark:text-white/50 max-w-sm mx-auto mb-5">
        Sign in to share with the community and follow people you like.
      </p>
      <Link
        to="/login"
        state={{ from: { pathname: '/feed' } }}
        className="inline-block px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Sign in
      </Link>
    </div>
  );

  return (
    <div ref={rootRef}>
      {tab === 'search' ? (
        <>
          <PageHeader
            title={hashtag ? `#${hashtag.replace(/^#/, '')}` : `“${search}”`}
            subtitle={hashtag ? 'Posts with this tag' : 'Search results'}
          />
          <div className="lg:hidden px-4 pt-3 pb-1"><SearchBox /></div>
          {search && !hashtag && <SearchExtras term={search} />}
        </>
      ) : (
        <>
          <div className="lg:hidden px-4 pt-3 pb-1"><SearchBox /></div>
          <FeedTabs active={tab} onChange={setTab} />
          {hasNewPosts && (
            <div className="sticky top-[52px] z-20 h-0 flex justify-center">
              <button
                onClick={showNewPosts}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
              >
                <ArrowUp size={14} /> New posts
              </button>
            </div>
          )}
          {(tab === 'foryou' || tab === 'following') && (
            <>
              {uid && <StatusTray />}
              <LiveNowRow onGoLive={uid ? () => setShowInstantSession(true) : undefined} />
            </>
          )}
          {uid ? (
            <div ref={editorRef}>
              {tab === 'foryou' && <AwayDigest uid={uid} />}
              <GettingStartedCard uid={uid} onWritePost={focusComposer} />
              <PostEditor
                quotedPostId={searchParams.get('quote')}
                onCancelQuote={clearQuote}
                onPostCreated={onPostCreated}
                initialKind={composeKind}
              />
            </div>
          ) : signInPrompt}
        </>
      )}

      {tab === 'following' && !uid ? null : (
        <FeedList
          tab={tab}
          uid={uid}
          items={items}
          isLoading={feed.isLoading}
          isError={feed.isError}
          hasNextPage={feed.hasNextPage}
          isFetchingNextPage={feed.isFetchingNextPage}
          fetchNextPage={feed.fetchNextPage}
          refetch={feed.refetch}
          empty={<EmptyState tab={tab} followsAnyone={(viewer?.followingIds.size ?? 0) > 0} query={hashtag ? `#${hashtag.replace(/^#/, "")}` : search} onGoTrending={() => setTab('trending')} />}
        />
      )}

      <CreateInstantSessionModal
        isOpen={showInstantSession}
        onClose={() => setShowInstantSession(false)}
      />
    </div>
  );
}

function EmptyState({ tab, followsAnyone, query, onGoTrending }: {
  tab: FeedTab;
  followsAnyone: boolean;
  query?: string;
  onGoTrending: () => void;
}) {
  switch (tab) {
    case 'following':
      return followsAnyone ? (
        <FeedEmpty icon={Users} title="No posts yet" body="People you follow haven't posted anything yet." />
      ) : (
        <FeedEmpty
          icon={Users}
          title="You're not following anyone yet"
          body="Follow creators to see their posts here."
          action={
            <button onClick={onGoTrending} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
              Find people in Trending
            </button>
          }
        />
      );
    case 'trending':
      return <FeedEmpty icon={Flame} title="Nothing trending yet" body="Posts with likes and comments this week will show up here." />;
    case 'search':
      return <FeedEmpty icon={SearchIcon} title="No posts found" body={`Nothing matches “${query}” yet. Try a shorter word or a different spelling.`} />;
    default:
      return <FeedEmpty icon={Inbox} title="Nothing here yet" body="Be the first to share something." />;
  }
}
