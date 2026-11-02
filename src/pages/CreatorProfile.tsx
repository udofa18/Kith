import { useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bookmark, Calendar, FileText, Image as ImageIcon, Layers, MessageCircle, Package, Play, UserX, Users } from 'lucide-react';
import { auth } from '../firebase';
import { queryKeys } from '../lib/queryClient';
import { useInView } from '../hooks/useInView';
import { fetchViewerContext } from '../features/feed/api/viewer';
import FeedEmpty from '../features/feed/components/FeedEmpty';
import PageHeader from '../components/ui/PageHeader';
import PostCard from '../components/PostCard';
import ArticleCard from '../components/ArticleCard';
import ProductCard from '../components/ProductCard';
import EventCard from '../components/EventCard';
import CommunityCard from '../components/CommunityCard';
import ProfileHeader from '../features/profile/ProfileHeader';
import {
  displayName, fetchBookmarks, fetchPostCount, fetchProfileMedia, fetchProfilePosts, fetchProfileReplies,
  fetchRelationship, fetchSection, fetchSectionCounts, resolveProfile, type SectionKey,
} from '../features/profile/api';

type Tab = 'posts' | 'replies' | 'media' | SectionKey | 'saved';

const TAB_LABELS: Record<Tab, string> = {
  posts: 'Posts',
  replies: 'Replies',
  media: 'Media',
  articles: 'Articles',
  products: 'Products',
  events: 'Events',
  communities: 'Communities',
  saved: 'Saved',
};

export default function CreatorProfile() {
  const { id: param = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = auth.currentUser?.uid ?? null;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', param],
    queryFn: () => resolveProfile(param),
    staleTime: 30_000,
  });
  const id = profile?.id;
  const isMe = !!id && id === me;

  // Username links resolve to the canonical uid URL.
  useEffect(() => {
    if (profile && profile.id !== param) navigate(`/creators/${profile.id}${window.location.search}`, { replace: true });
  }, [profile, param, navigate]);

  const { data: viewer, isLoading: viewerLoading } = useQuery({
    queryKey: queryKeys.feedViewer(me),
    queryFn: () => fetchViewerContext(me),
    staleTime: 1000 * 60 * 5,
    enabled: !!me,
  });
  const myFollowing = viewer?.followingIds ?? new Set<string>();

  const { data: relationship } = useQuery({
    queryKey: ['relationship', id, me],
    queryFn: () => fetchRelationship(id!, me, [...myFollowing]),
    enabled: !!id && (!me || !viewerLoading),
    staleTime: 30_000,
  });
  const { data: postCount } = useQuery({
    queryKey: ['post-count', id],
    queryFn: () => fetchPostCount(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
  const { data: sectionCounts } = useQuery({
    queryKey: ['profile-sections', id, isMe],
    queryFn: () => fetchSectionCounts(id!, isMe),
    enabled: !!id,
    staleTime: 60_000,
  });

  // Content tabs appear only when there's something in them (always on your own profile).
  const tabs: Tab[] = [
    'posts', 'replies', 'media',
    ...(['articles', 'products', 'events', 'communities'] as SectionKey[]).filter(k => isMe || (sectionCounts?.[k] ?? 0) > 0),
    ...(isMe ? (['saved'] as Tab[]) : []),
  ];
  const requested = searchParams.get('tab') as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : 'posts';
  const selectTab = (next: Tab) => setSearchParams(p => {
    const params = new URLSearchParams(p);
    if (next === 'posts') params.delete('tab'); else params.set('tab', next);
    return params;
  }, { replace: true });

  if (isLoading) return <ProfileSkeleton />;

  if (!profile || !id) {
    return (
      <div className="max-w-[640px] mx-auto min-h-screen text-black dark:text-white border-x border-black/10 dark:border-white/10">
        <PageHeader title="Profile" />
        <FeedEmpty icon={UserX} title="This account doesn't exist" body="The link may be broken, or the account may have been removed." action={
          <Link to="/feed" className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">Back to feed</Link>
        } />
      </div>
    );
  }

  const name = displayName(profile.data);

  return (
    <div className="max-w-[640px] mx-auto min-h-screen text-black dark:text-white pb-24 border-x border-black/10 dark:border-white/10">
      <PageHeader title={name} subtitle={postCount === undefined ? undefined : `${postCount} ${postCount === 1 ? 'post' : 'posts'}`} />
      <ProfileHeader profile={profile} relationship={relationship} me={me} myFollowing={myFollowing} />

      <nav aria-label="Profile sections" className="sticky top-[53px] z-20 mt-4 bg-background/85 backdrop-blur-md border-b border-black/10 dark:border-white/10">
        <div className="flex overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => selectTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`relative shrink-0 flex-1 min-w-fit px-4 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                tab === t ? '' : 'text-black/50 dark:text-white/50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
              }`}
            >
              {TAB_LABELS[t]}
              {t !== 'posts' && t !== 'replies' && t !== 'media' && t !== 'saved' && (sectionCounts?.[t] ?? 0) > 0 && (
                <span className="ml-1 text-black/40 dark:text-white/40 font-normal">{sectionCounts![t]}</span>
              )}
              {tab === t && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'posts' && <PostsTab userId={id} isMe={isMe} name={name} />}
      {tab === 'replies' && <RepliesTab userId={id} name={name} />}
      {tab === 'media' && <MediaTab userId={id} name={name} />}
      {(tab === 'articles' || tab === 'products' || tab === 'events' || tab === 'communities') && (
        <SectionTab section={tab} userId={id} isMe={isMe} />
      )}
      {tab === 'saved' && isMe && <SavedTab userId={id} />}
    </div>
  );
}

// ---------------------------------------------------------------- Tabs

function PostsTab({ userId, isMe, name }: { userId: string; isMe: boolean; name: string }) {
  const query = useInfiniteQuery({
    queryKey: ['profile-posts', userId],
    queryFn: ({ pageParam }) => fetchProfilePosts(userId, pageParam),
    initialPageParam: undefined as Awaited<ReturnType<typeof fetchProfilePosts>>['cursor'],
    getNextPageParam: last => last.cursor,
    staleTime: 30_000,
  });
  const { ref, inView } = useInView({ rootMargin: '600px' });
  useEffect(() => {
    if (inView && query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
  }, [inView, query.hasNextPage, query.isFetchingNextPage]);

  const posts = query.data?.pages.flatMap(p => p.posts) ?? [];
  if (query.isLoading) return <ListSkeleton />;
  if (posts.length === 0) {
    return isMe ? (
      <FeedEmpty icon={FileText} title="You haven't posted yet" body="Share what you're working on, a win, or a question. Your posts show up here." action={
        <Link to="/feed" className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">Write your first post</Link>
      } />
    ) : (
      <FeedEmpty icon={FileText} title="No posts yet" body={`When ${name} posts, it'll show up here.`} />
    );
  }

  return (
    <div>
      {posts.map(post => <PostCard key={post.id} post={post} compact />)}
      <div ref={ref} />
      {query.isFetchingNextPage && <ListSkeleton rows={1} />}
    </div>
  );
}

function RepliesTab({ userId, name }: { userId: string; name: string }) {
  const navigate = useNavigate();
  const { data: replies, isLoading } = useQuery({
    queryKey: ['profile-replies', userId],
    queryFn: () => fetchProfileReplies(userId),
    staleTime: 60_000,
  });
  if (isLoading) return <ListSkeleton />;
  if (!replies?.length) return <FeedEmpty icon={MessageCircle} title="No replies yet" body={`Comments ${name} leaves on posts will show up here.`} />;

  return (
    <div>
      {replies.map(r => (
        <button
          key={r.id}
          onClick={() => navigate(`/post/${r.postId}`)}
          className="w-full text-left px-4 sm:px-5 py-4 border-b border-black/10 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
        >
          <p className="text-xs text-black/50 dark:text-white/50">
            {r.post ? <>Replying to <span className="text-primary">@{r.post.authorUsername || r.post.authorName}</span></> : 'Replying to a post'}
            {r.createdAt && <> · {formatDistanceToNowStrict(r.createdAt, { addSuffix: true })}</>}
          </p>
          <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line break-words line-clamp-4">{r.content}</p>
          {r.post ? (
            <p className="mt-2 px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 text-sm text-black/60 dark:text-white/60 line-clamp-2">
              <span className="font-medium text-black/80 dark:text-white/80">{r.post.authorName}</span> {r.post.content}
            </p>
          ) : (
            <p className="mt-2 text-xs italic text-black/40 dark:text-white/40">The original post was removed.</p>
          )}
        </button>
      ))}
    </div>
  );
}

function MediaTab({ userId, name }: { userId: string; name: string }) {
  const { data: tiles, isLoading } = useQuery({
    queryKey: ['profile-media', userId],
    queryFn: () => fetchProfileMedia(userId),
    staleTime: 60_000,
  });
  if (isLoading) {
    return <div className="grid grid-cols-3 gap-0.5 p-0.5">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-square bg-black/5 dark:bg-white/5 animate-pulse" />)}</div>;
  }
  if (!tiles?.length) return <FeedEmpty icon={ImageIcon} title="No photos or videos yet" body={`Photos and videos ${name} posts will show up here.`} />;

  return (
    <div className="grid grid-cols-3 gap-0.5 p-0.5">
      {tiles.map(t => (
        <Link key={t.postId} to={`/post/${t.postId}`} className="relative aspect-square overflow-hidden bg-black/5 dark:bg-white/5 group">
          {t.type === 'video' ? (
            <video src={`${t.url}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={t.url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
          )}
          {(t.type === 'video' || t.more > 0) && (
            <span className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/50 backdrop-blur-sm" style={{ color: '#fff' }}>
              {t.type === 'video' ? <Play size={13} fill="currentColor" /> : <Layers size={13} />}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

const SECTION_EMPTY: Record<SectionKey, { icon: typeof FileText; title: string; body: string }> = {
  articles: { icon: FileText, title: 'No articles yet', body: 'Long-form writing shows up here.' },
  products: { icon: Package, title: 'No products yet', body: 'Things for sale show up here.' },
  events: { icon: Calendar, title: 'No events yet', body: 'Hosted events show up here.' },
  communities: { icon: Users, title: 'No communities yet', body: 'Communities joined show up here.' },
};

function SectionTab({ section, userId, isMe }: { section: SectionKey; userId: string; isMe: boolean }) {
  const navigate = useNavigate();
  const { data: items, isLoading } = useQuery({
    queryKey: ['profile-section', section, userId, isMe],
    queryFn: () => fetchSection(section, userId, isMe),
    staleTime: 60_000,
  });
  if (isLoading) return <ListSkeleton />;
  if (!items?.length) {
    const e = SECTION_EMPTY[section];
    return <FeedEmpty icon={e.icon} title={e.title} body={e.body} />;
  }

  switch (section) {
    case 'articles':
      return <div className="p-4 space-y-4">{items.map(a => <ArticleCard key={a.id} article={a} isOwner={isMe} />)}</div>;
    case 'products':
      return <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">{items.map(p => <ProductCard key={p.id} product={p} />)}</div>;
    case 'events':
      return <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">{items.map(e => <EventCard key={e.id} event={e} compact />)}</div>;
    case 'communities':
      return (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map(c => <CommunityCard key={c.id} community={c} isMember onClick={() => navigate(`/feed?view=communities&id=${c.id}`)} />)}
        </div>
      );
  }
}

function SavedTab({ userId }: { userId: string }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['profile-saved', userId],
    queryFn: () => fetchBookmarks(userId),
    staleTime: 30_000,
  });
  if (isLoading) return <ListSkeleton />;
  if (!items?.length) return <FeedEmpty icon={Bookmark} title="Nothing saved yet" body="Tap the bookmark on a post to keep it here. Only you can see this." />;

  return (
    <div>
      <p className="px-5 py-2.5 text-xs text-black/50 dark:text-white/50 border-b border-black/10 dark:border-white/10">Only you can see what you've saved.</p>
      {items.map(item => item.bookmarkType === 'post'
        ? <PostCard key={item.id} post={item} compact />
        : <div key={item.id} className="p-4 border-b border-black/10 dark:border-white/10">{item.bookmarkType === 'article' ? <ArticleCard article={item} /> : <ProductCard product={item} />}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------- Skeletons

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-5 py-4 border-b border-black/10 dark:border-white/10 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="h-3 w-1/3 rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-full rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-2/3 rounded bg-black/10 dark:bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-[640px] mx-auto min-h-screen text-black dark:text-white border-x border-black/10 dark:border-white/10">
      <PageHeader title="Profile" />
      <div className="animate-pulse">
        <div className="aspect-[3/1] max-h-[240px] bg-black/5 dark:bg-white/5" />
        <div className="px-5">
          <div className="-mt-12 w-[96px] h-[96px] sm:w-[126px] sm:h-[126px] rounded-full bg-black/10 dark:bg-white/10 ring-4 ring-background" />
          <div className="mt-4 h-5 w-40 rounded bg-black/10 dark:bg-white/10" />
          <div className="mt-2 h-4 w-24 rounded bg-black/10 dark:bg-white/10" />
          <div className="mt-4 h-4 w-full rounded bg-black/10 dark:bg-white/10" />
          <div className="mt-2 h-4 w-3/4 rounded bg-black/10 dark:bg-white/10" />
        </div>
      </div>
      <div className="mt-6"><ListSkeleton /></div>
    </div>
  );
}
