import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Zap, DollarSign, Layers, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { formatDate } from '../lib/utils';

export default function SocialRightSidebar() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarTop, setSidebarTop] = useState(24);

  const { data: upcomingEvents = [] } = useQuery({
    queryKey: ['upcoming-events'],
    queryFn: () => feedService.getUpcomingEvents(5),
  });

  const { data: featuredArticles = [] } = useQuery({
    queryKey: ['featured-articles'],
    queryFn: () => feedService.getFeaturedArticles(5),
  });

  const { data: featuredChallenges = [] } = useQuery({
    queryKey: ['featured-challenges'],
    queryFn: () => feedService.getFeaturedChallenges(3),
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
  }, [upcomingEvents, featuredArticles, featuredChallenges]);

  return (
    <aside 
      ref={sidebarRef}
      style={{ top: `${sidebarTop}px` }}
      className="hidden xl:block w-80 space-y-0 pt-6 sticky h-fit order-3 shrink-0 border-l border-black/10 dark:border-white/10 no-scrollbar"
    >
      {/* Upcoming Events */}
      <div className="bg-transparent p-4 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-black flex items-center gap-2 text-black/40 dark:text-white/40 uppercase tracking-widest">
            <Calendar size={16} className="text-purple-400" /> Events
          </h3>
          <Link to="/events" className="text-[10px] text-primary hover:underline font-black uppercase tracking-widest">View All</Link>
        </div>
        <div className="space-y-4">
          {upcomingEvents.map(event => {
            const isLive = new Date(event.startDate).getTime() < Date.now() && new Date(event.endDate).getTime() > Date.now();
            
            return (
              <Link key={event.id} to={`/events/${event.id}`} className="block group hover:bg-black/5 dark:hover:bg-white/5 p-2 transition-all">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-black/5 dark:bg-white/5 overflow-hidden shrink-0 border border-black/10 dark:border-white/10 relative rounded-full">
                    <img src={(event.banner && event.banner.trim() !== '') ? event.banner : `https://picsum.photos/seed/${event.id}/100/100`} alt="" className="w-full h-full object-cover" />
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold line-clamp-2 leading-tight group-hover:text-primary transition-colors text-black dark:text-white mb-1">{event.title}</p>
                    
                    <div className="space-y-0.5">
                      <p className="text-[13px] text-black/50 dark:text-white/50 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                        <Clock size={10} className="text-purple-400/50" />
                        {formatDate(event.startDate, 'MMM d, HH:mm')}
                      </p>
                      {isLive && (
                        <span className="text-[11px] font-black text-red-500 flex items-center gap-1 uppercase tracking-widest mt-1">
                          <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse"></span> LIVE NOW
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {upcomingEvents.length === 0 && <p className="text-xs text-black/40 dark:text-white/40 text-center py-2">No upcoming events</p>}
        </div>
      </div>
      
      {/* Featured Challenges */}
      <div className="bg-transparent border-b border-black/10 dark:border-white/10">
        <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-[15px] font-black flex items-center gap-2 text-black/40 dark:text-white/40 uppercase tracking-widest">
            <Zap size={16} className="text-yellow-400" /> Challenges
          </h3>
          <Link to="/challenges" className="text-[10px] text-primary hover:underline font-black uppercase tracking-widest">View All</Link>
        </div>
        <div className="space-y-1 p-2">
          {featuredChallenges.map(challenge => {
            const difference = challenge.deadlines?.submissionEnd ? challenge.deadlines.submissionEnd - Date.now() : 0;
            let dueText = 'Ended';
            if (difference > 0) {
              const days = Math.floor(difference / (1000 * 60 * 60 * 24));
              const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
              if (days > 0) dueText = `${days}d left`;
              else if (hours > 0) dueText = `${hours}h left`;
              else dueText = 'Due soon';
            }
            
            return (
              <Link key={challenge.id} to={`/challenges/${challenge.id}`} className="flex items-center gap-3 group hover:bg-black/5 dark:hover:bg-white/5 p-2 transition-all">
                <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center overflow-hidden border border-black/10 dark:border-white/10 bg-gradient-to-br from-blue-500 to-primary rounded-full">
                  {challenge.image ? (
                    <img src={challenge.image} alt={challenge.title} className="w-full h-full object-cover" />
                  ) : (
                    <Layers className="text-white shadow-sm" size={16} />
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <h4 className="font-bold text-[15px] leading-tight text-black dark:text-white/90 group-hover:text-primary transition-colors truncate">
                    {challenge.title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[13px] font-black uppercase tracking-wider mt-1 text-black/40 dark:text-white/40">
                    <span className="text-[#00ff88] flex items-center gap-0.5">
                      <DollarSign size={8}/> {challenge.rewardPool?.cashAmount || 0}
                    </span>
                    <span>|</span>
                    <span>{dueText}</span>
                  </div>
                </div>
              </Link>
            )})}
          {featuredChallenges.length === 0 && <p className="text-xs text-black/40 dark:text-white/40 text-center py-2">No active challenges</p>}
        </div>
      </div>

      {/* Featured Articles */}
      <div className="bg-transparent border-b border-black/10 dark:border-white/10 pb-4">
        <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h3 className="text-[15px] font-black flex items-center gap-2 text-black/40 dark:text-white/40 uppercase tracking-widest">
            <FileText size={16} className="text-blue-400" /> Articles
          </h3>
          <Link to="/articles" className="text-[10px] text-primary hover:underline font-black uppercase tracking-widest">View All</Link>
        </div>
        <div className="p-4 space-y-4">
          {featuredArticles.map(article => (
            <Link key={article.id} to={`/article/${article.id}`} className="block group">
              <div className="w-full h-32 bg-black/5 dark:bg-white/5 overflow-hidden border border-black/10 dark:border-white/5 mb-2 rounded-2xl">
                {article.coverImage ? (
                  <img src={article.coverImage} alt={article.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText size={24} className="text-black/10 dark:text-white/10" />
                  </div>
                )}
              </div>
              <h4 className="font-bold text-[15px] leading-tight text-black dark:text-white group-hover:text-primary transition-colors line-clamp-2">{article.title}</h4>
            </Link>
          ))}
          {featuredArticles.length === 0 && <p className="text-xs text-black/40 dark:text-white/40 text-center py-2">No articles found</p>}
        </div>
      </div>
    </aside>
  );
}
