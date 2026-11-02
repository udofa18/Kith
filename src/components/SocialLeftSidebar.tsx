import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { feedService } from '../services/feedService';
import { followUser } from '../services/socialService';
import { queryKeys, STALE } from '../lib/queryClient';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { fetchViewerContext } from '../features/feed/api/viewer';
import RailSection, { RailEmpty, RailRow } from './ui/RailSection';
import Avatar from './ui/Avatar';
import VerifiedBadge from './VerifiedBadge';
import SearchBox from '../features/search/SearchBox';
import { CommunityIcon } from './CommunityCard';

export { SearchBox };

/** Discovery rail: search, popular topics, people to follow, communities. */
export default function SocialLeftSidebar() {
  return (
    <aside className="hidden lg:flex flex-col gap-4 w-72 xl:w-80 shrink-0 order-1 sticky top-0 self-start max-h-screen overflow-y-auto no-scrollbar py-4">
      <SearchBox />
      <PopularTopics />
      <WhoToFollow />
      <Communities />
    </aside>
  );
}

function PopularTopics() {
  const navigate = useNavigate();
  const { data: tags = [], isLoading } = useQuery({
    queryKey: queryKeys.trendingTags(),
    queryFn: () => feedService.getTrendingTags(6),
    staleTime: STALE.sidebar,
  });

  return (
    <RailSection title="Popular topics" action={{ label: 'Trending', to: '/feed?view=trending' }}>
      {isLoading ? <RailSkeleton rows={4} /> : tags.length === 0 ? <RailEmpty>No topics yet.</RailEmpty> : tags.map((tag: any) => {
        const name = String(tag.name ?? tag.id).replace(/^#/, '');
        return (
          <RailRow key={tag.id} onClick={() => navigate(`/feed?hashtag=${encodeURIComponent(`#${name}`)}`)}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">#{name}</p>
              <p className="text-xs text-black/50 dark:text-white/50">{plural(tag.count || 0, 'post')}</p>
            </div>
          </RailRow>
        );
      })}
    </RailSection>
  );
}

/**
 * Top creators the viewer doesn't follow yet, preferring ones whose skills match the viewer's interests.
 */
function WhoToFollow() {
  const user = useCurrentUser();
  const uid: string | null = user?.uid ?? null;
  const queryClient = useQueryClient();
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  const { data: viewer } = useQuery({
    queryKey: queryKeys.feedViewer(uid),
    queryFn: () => fetchViewerContext(uid),
    staleTime: 1000 * 60 * 5,
    enabled: !!uid,
  });
  const { data: creators = [], isLoading } = useQuery({
    queryKey: queryKeys.topCreators(),
    queryFn: () => feedService.getTopCreators(20),
    staleTime: STALE.sidebar,
  });

  const interests = new Set(viewer?.interests?.skills ?? []);
  const suggestions = creators
    .filter((c: any) => c.id !== uid && !viewer?.followingIds.has(c.id))
    .map((c: any) => ({ ...c, overlap: ((c.skills as string[]) || []).filter(s => interests.has(s)).length }))
    .sort((a: any, b: any) => b.overlap - a.overlap || (b.xp || 0) - (a.xp || 0))
    .slice(0, 4);

  const follow = async (id: string) => {
    if (!uid) return toast.error('Sign in to follow creators');
    setFollowed(prev => new Set(prev).add(id));
    try {
      await followUser(uid, id);
      queryClient.invalidateQueries({ queryKey: queryKeys.feedViewer(uid) });
    } catch (err) {
      console.error(err);
      setFollowed(prev => { const next = new Set(prev); next.delete(id); return next; });
      toast.error("Couldn't follow. Try again.");
    }
  };

  return (
    <RailSection title="Who to follow">
      {isLoading ? <RailSkeleton rows={3} avatar /> : suggestions.length === 0 ? <RailEmpty>You're following everyone we'd suggest.</RailEmpty> : suggestions.map((c: any) => (
        <RailRow key={c.id}>
          <Link to={`/creators/${c.id}`} className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar src={c.profileImage || c.photoURL} seed={c.id} size={36} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate flex items-center gap-1">
                <span className="truncate">{c.displayName || c.username}</span>
                <VerifiedBadge verified={c.verified} />
              </p>
              <p className="text-xs text-black/50 dark:text-white/50 truncate">@{c.username}</p>
            </div>
          </Link>
          {followed.has(c.id) ? (
            <span className="text-xs font-semibold text-black/40 dark:text-white/40 px-3">Following</span>
          ) : (
            <button
              onClick={() => follow(c.id)}
              className="px-3.5 py-1.5 rounded-full bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Follow
            </button>
          )}
        </RailRow>
      ))}
    </RailSection>
  );
}

function Communities() {
  const { data: communities = [], isLoading } = useQuery({
    queryKey: queryKeys.trendingCommunities(),
    queryFn: () => feedService.getTrendingCommunities(4),
    staleTime: STALE.sidebar,
  });

  return (
    <RailSection title="Communities" action={{ label: 'Browse', to: '/feed?view=communities' }}>
      {isLoading ? <RailSkeleton rows={3} avatar /> : communities.length === 0 ? <RailEmpty>No communities yet.</RailEmpty> : communities.map((c: any) => (
        <RailRow key={c.id} to={`/feed?view=community&id=${c.id}`}>
          <CommunityIcon community={c} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{c.name}</p>
            <p className="text-xs text-black/50 dark:text-white/50">{plural(c.memberCount ?? c.member_count ?? 0, 'member')}</p>
          </div>
        </RailRow>
      ))}
    </RailSection>
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

export function RailSkeleton({ rows, avatar = false }: { rows: number; avatar?: boolean }) {
  return (
    <div aria-hidden className="animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          {avatar && <div className="w-9 h-9 rounded-full bg-black/10 dark:bg-white/10" />}
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-3/4 rounded bg-black/10 dark:bg-white/10" />
            <div className="h-2.5 w-1/2 rounded bg-black/5 dark:bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
