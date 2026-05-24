import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { TrendingUp, Award, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { queryKeys, STALE } from '../lib/queryClient';
import SidebarCreatorItem from './SidebarCreatorItem';

export default function SocialLeftSidebar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarTop, setSidebarTop] = useState(24);

  const { data: trendingCommunities = [] } = useQuery({
    queryKey: queryKeys.trendingCommunities(),
    queryFn: () => feedService.getTrendingCommunities(5),
    staleTime: STALE.sidebar,
  });

  const { data: trendingTags = [] } = useQuery({
    queryKey: queryKeys.trendingTags(),
    queryFn: () => feedService.getTrendingTags(5),
    staleTime: STALE.sidebar,
  });

  const { data: topCreators = [] } = useQuery({
    queryKey: queryKeys.topCreators(),
    queryFn: () => feedService.getTopCreators(5),
    staleTime: STALE.sidebar,
  });

  useEffect(() => {
    const updateTop = () => {
      const vh = window.innerHeight;
      if (sidebarRef.current) {
        const h = sidebarRef.current.offsetHeight;
        setSidebarTop(h > vh - 48 ? vh - h - 24 : 24);
      }
    };

    const ob = new ResizeObserver(updateTop);
    if (sidebarRef.current) ob.observe(sidebarRef.current);
    window.addEventListener('resize', updateTop);
    updateTop();

    return () => {
      ob.disconnect();
      window.removeEventListener('resize', updateTop);
    };
  }, [trendingTags, trendingCommunities, topCreators]);

  const handleTagClick = (tagName: string) => {
    const cleanTag = tagName.startsWith('#') ? tagName : `#${tagName}`;
    navigate(`/feed?hashtag=${encodeURIComponent(cleanTag)}`);
  };

  const handleCommunityClick = (communityId: string) => {
    navigate(`/feed?view=community&id=${communityId}`);
  };

  return (
    <aside 
      ref={sidebarRef}
      style={{ top: `${sidebarTop}px` }}
      className="hidden lg:block w-72 xl:w-80 space-y-0 pt-6 sticky h-fit order-1 shrink-0 border-r border-black/10 dark:border-white/10 no-scrollbar"
    >
      {/* Trending Topics */}
      <div className="bg-transparent p-4 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-black flex items-center gap-2 text-black/40 dark:text-white/40 uppercase tracking-widest">
            <TrendingUp size={16} className="text-primary" /> Trending Topics
          </h3>
          <button 
            onClick={() => navigate('/feed?view=trending')}
            className="text-[10px] text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full font-black uppercase tracking-widest transition-colors"
          >
            Explore
          </button>
        </div>
        <div className="space-y-1">
          {trendingTags.map(tag => (
            <button
              key={tag.id} 
              onClick={() => handleTagClick(tag.name)}
              className="group flex flex-col items-start hover:bg-black/5 dark:hover:bg-white/5 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white px-3 py-2 transition-all w-full"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[15px] font-bold truncate">
                  {tag.name.startsWith('#') ? tag.name : `#${tag.name}`}
                </span>
                <span className="text-[13px] text-black/40 dark:text-white/40 group-hover:text-primary/70 bg-black/5 dark:bg-black/40 px-2 py-0.5 whitespace-nowrap rounded-full">
                  {tag.count || 0}
                </span>
              </div>
            </button>
          ))}
          {trendingTags.length === 0 && (
            <p className="text-xs text-black/40 dark:text-white/40 text-center py-2 w-full">No trending tags yet</p>
          )}
        </div>
      </div>

      {/* Popular Communities */}
      <div className="bg-transparent p-4 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-black flex items-center gap-2 text-black/40 dark:text-white/40 uppercase tracking-widest">
            <Users size={16} className="text-blue-400" /> Communities
          </h3>
          <Link to="/feed?view=communities" className="text-[10px] text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full font-black uppercase tracking-widest transition-colors">Explore</Link>
        </div>
        <div className="space-y-1">
          {trendingCommunities.map(community => (
            <button 
              key={community.id} 
              onClick={() => handleCommunityClick(community.id)} 
              className="block w-full text-left group hover:bg-black/5 dark:hover:bg-white/5 p-2 transition-all border-l-2 border-transparent hover:border-primary"
            >
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-8 h-8 bg-black/5 dark:bg-white/5 overflow-hidden shrink-0 border border-black/10 dark:border-white/10 rounded-full">
                  <img src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/100/100`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold truncate group-hover:text-primary transition-colors text-black dark:text-white">{community.name}</p>
                  <p className="text-[13px] text-black/50 dark:text-white/50">{community.memberCount || 0} members</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Top Creators */}
      <div className="bg-transparent p-4 border-b border-black/10 dark:border-white/10">
        <h3 className="text-[15px] font-black mb-4 flex items-center gap-2 text-black/40 dark:text-white/40 uppercase tracking-widest">
          <Award size={16} className="text-yellow-400" /> Top Creators
        </h3>
        <div className="space-y-1">
          {topCreators.map(creator => (
            <SidebarCreatorItem key={creator.id} creator={creator} />
          ))}
          {topCreators.length === 0 && (
            <p className="text-xs text-black/40 dark:text-white/40 text-center py-2">No creators found</p>
          )}
        </div>
      </div>
    </aside>
  );
}
