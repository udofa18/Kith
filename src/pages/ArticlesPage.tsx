import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Search, TrendingUp, Clock, ThumbsUp, MessageSquare, Bookmark, Flame, PenTool, Hash, ChevronDown, Filter, Zap, Terminal, Palette, Briefcase, PieChart, Users, Target, Video, LineChart, Coffee, Globe, Compass, Star, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import { ARTICLE_CATEGORIES, ArticleCategory, ArticleDifficulty } from '../types/articles';
import ArticleCard from '../components/ArticleCard';

const CATEGORY_ICONS: Record<string, any> = {
  Terminal, Palette, Briefcase, PieChart, Users, Target, Zap, Video, LineChart, Coffee, Globe
};

export default function ArticlesPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<ArticleDifficulty | null>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'popular' | 'recommended' | 'following'>('latest');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  
  const [popularTags, setPopularTags] = useState<string[]>([]);
  const [featuredCollections, setFeaturedCollections] = useState<any[]>([
    { id: '1', name: 'Web3 Future', description: 'Everything about decentralization', image: 'https://picsum.photos/seed/web3/400/200' },
    { id: '2', name: 'Design Systems', description: 'Scale your products with ease', image: 'https://picsum.photos/seed/design/400/200' },
    { id: '3', name: 'Startups 101', description: 'From idea to exit', image: 'https://picsum.photos/seed/startup/400/200' }
  ]);
  const [trendingArticles, setTrendingArticles] = useState<any[]>([]);
  const [suggestedAuthors, setSuggestedAuthors] = useState<any[]>([]);

  useEffect(() => {
    fetchInitialArticles();
    fetchTrendingAndAuthors();
  }, [sortBy, activeTag, activeCategory, activeSubcategory, difficultyFilter]);

  useEffect(() => {
    fetchDynamicTags();
  }, []);

  const fetchDynamicTags = async () => {
    try {
      const q = query(
        collection(db, 'articles'),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      const tagCounts: Record<string, number> = {};
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.tags && Array.isArray(data.tags)) {
          data.tags.forEach((tag: string) => {
            const normalized = tag.trim();
            if (normalized) {
              tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
            }
          });
        }
      });

      const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);
      
      if (sortedTags.length > 0) {
        setPopularTags(sortedTags);
      } else {
        // Fallback if no tags found in any articles
        setPopularTags(['React', 'Firebase', 'TypeScript', 'Design']);
      }
    } catch (error) {
      console.error("Error fetching dynamic tags:", error);
    }
  };

  const fetchInitialArticles = async () => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'articles'),
        where('status', '==', 'published')
      );

      if (activeCategory) {
        q = query(q, where('primaryCategoryId', '==', activeCategory));
      }
      
      if (activeSubcategory) {
        q = query(q, where('subcategory', '==', activeSubcategory));
      }

      if (difficultyFilter) {
        q = query(q, where('difficulty', '==', difficultyFilter));
      }

      q = query(q, orderBy('createdAt', 'desc'), limit(15));
      
      const snap = await getDocs(q);
      let fetched: any[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Handle Following or Recommendation logic
      if (auth.currentUser && (sortBy === 'recommended' || sortBy === 'following')) {
        const followingSnap = await getDocs(collection(db, 'users', auth.currentUser.uid, 'following'));
        const followingIds = followingSnap.docs.map(d => d.id);
        
        if (sortBy === 'following') {
          fetched = fetched.filter(a => followingIds.includes(a.authorUid));
        } else if (sortBy === 'recommended') {
          fetched = fetched.sort((a, b) => {
            const aFollowed = followingIds.includes(a.authorUid);
            const bFollowed = followingIds.includes(b.authorUid);
            if (aFollowed && !bFollowed) return -1;
            if (!aFollowed && bFollowed) return 1;
            return (b.viewsCount || 0) - (a.viewsCount || 0);
          });
        }
      }

      setArticles(fetched);
      setLastVisible(snap.docs[snap.docs.length - 1] || null);
      setHasMore(snap.docs.length === 15);
    } catch (error) {
      console.error("Error fetching articles:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingAndAuthors = async () => {
    try {
      const q = query(
        collection(db, 'articles'),
        where('status', '==', 'published'),
        limit(5)
      );
      const snap = await getDocs(q);
      const fetched: any[] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Just mock sorting for 'trending'
      setTrendingArticles([...fetched].sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0)).slice(0, 3));
      
      // Get unique authors from recent
      const authorsMap = new Map();
      fetched.forEach(a => {
        if (!authorsMap.has(a.authorUid)) {
          authorsMap.set(a.authorUid, { id: a.authorUid, name: a.authorName, username: a.authorName.replace(/\s+/g, '').toLowerCase() });
        }
      });
      setSuggestedAuthors(Array.from(authorsMap.values()).slice(0, 3));
    } catch (error) {
      console.error(error);
    }
  };

  const loadMore = async () => {
    if (!hasMore || !lastVisible || loading) return;
    
    // In a production app with infinite scroll, you would attach this to an IntersectionObserver
    // Here we provide a manual trigger or it acts as the basis for intersection hook.
  };

  const filteredArticles = articles.filter(a => 
    (a.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.subtitle?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!activeTag || (a.tags && a.tags.includes(activeTag)))
  );

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-white dark:bg-[#0a0a0a] text-black dark:text-white">
      {/* Top Banner Area */}
      <div className="relative bg-gradient-to-r from-violet-950 via-purple-900 to-slate-950 w-full pt-20 pb-20 overflow-hidden border-b border-white/5 mb-12">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=2073&auto=format&fit=crop')] object-cover opacity-10 mix-blend-overlay"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-3xl space-y-4 animate-in fade-in slide-in-from-left-8 duration-700">
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white leading-tight">
                Discovery <span className="text-primary drop-shadow-[0_0_20px_rgba(0,183,255,0.4)]">Articles</span>
              </h1>
              <p className="text-white/70 text-lg md:text-xl max-w-xl font-medium leading-relaxed">
                Unlock insights, master new skills, and explore deep-dives from the global creator elite.
              </p>
            </div>
            
            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-8 duration-700">
              <button 
                onClick={() => {
                  if (!auth.currentUser) {
                    toast.error('Sign in to write articles');
                    return;
                  }
                  navigate('/write');
                }}
                className="flex items-center gap-2 bg-foreground text-background px-6 py-3 rounded-full font-bold hover:bg-foreground/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] group"
              >
                <PenTool size={20} className="group-hover:rotate-12 transition-transform" />
                <span>Create Article</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pb-20">
        
        {/* Category Navigation */}
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-6 mb-4">
          <button 
            onClick={() => {
              setActiveCategory(null);
              setActiveSubcategory(null);
            }}
            className={`flex flex-col items-center gap-2 min-w-[80px] group transition-all ${!activeCategory ? 'text-primary' : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${!activeCategory ? 'bg-primary/10 border-primary ring-4 ring-primary/10' : 'bg-black/5 dark:bg-white/5 border-transparent group-hover:bg-black/10 dark:group-hover:bg-white/10'}`}>
              <Compass size={24} />
            </div>
            <span className="text-[10px] font-black tracking-widest uppercase">Explore</span>
          </button>
          
          {ARTICLE_CATEGORIES.map(cat => {
            const Icon = CATEGORY_ICONS[cat.icon] || Globe;
            return (
              <button 
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setActiveSubcategory(null);
                }}
                className={`flex flex-col items-center gap-2 min-w-[80px] group transition-all ${activeCategory === cat.id ? 'text-primary' : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}
              >
                <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center border transition-all duration-500 shadow-2xl ${
                  activeCategory === cat.id 
                    ? 'bg-primary/10 border-primary ring-8 ring-primary/5 scale-110 shadow-primary/20' 
                    : 'bg-white/5 border-white/10 group-hover:border-white/20 group-hover:bg-white/10'
                }`}>
                  <Icon size={28} />
                </div>
                <span className={`text-[10px] font-black tracking-[0.2em] uppercase truncate max-w-[100px] transition-colors ${activeCategory === cat.id ? 'text-primary' : 'text-white/40'}`}>
                  {cat.name}
                </span>
              </button>
            )
          })}
        </div>

        {/* Subcategories bar (if category selected) */}
        {activeCategory && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-6 mb-4 animate-in fade-in slide-in-from-left-4 duration-300">
            <button 
              onClick={() => setActiveSubcategory(null)}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${!activeSubcategory ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
            >
              All {ARTICLE_CATEGORIES.find(c => c.id === activeCategory)?.name}
            </button>
            {ARTICLE_CATEGORIES.find(c => c.id === activeCategory)?.subcategories.map(sub => (
              <button 
                key={sub}
                onClick={() => setActiveSubcategory(sub)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${activeSubcategory === sub ? 'bg-primary text-black border-primary' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'}`}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* Featured Collections Section */}
        {!activeCategory && !searchQuery && (
          <div className="mb-12 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                <Star className="text-yellow-400 fill-yellow-400" size={20} /> Featured Collections
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredCollections.map(collection => (
                <div key={collection.id} className="group relative h-48 rounded-[32px] overflow-hidden border border-white/5 cursor-pointer">
                  <img src={collection.image} alt={collection.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-6 flex flex-col justify-end">
                    <h3 className="text-xl font-black text-white uppercase tracking-tight leading-none mb-1">{collection.name}</h3>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-widest">{collection.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
          
          {/* LEFT: Feed Column */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Filtering Control Bar */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 justify-between bg-black/40 p-2 pr-4 pl-2 rounded-2xl border border-white/5 shadow-xl glass sticky top-0 z-30">
                <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors" size={20} />
                  <input
                    type="text"
                    placeholder="Search titles, authors, tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none py-3 pl-12 pr-4 text-white placeholder:text-white/20 focus:ring-0 font-black uppercase text-xs tracking-widest"
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-2 pl-2 sm:pl-0 sm:border-l border-white/10 sm:ml-2 relative">
                  <div className="relative">
                    <button 
                      onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                      onBlur={() => setTimeout(() => setIsSortDropdownOpen(false), 200)}
                      className="flex items-center justify-between gap-4 bg-white/5 text-[10px] font-black tracking-widest uppercase border border-white/10 rounded-xl px-5 py-3 outline-none hover:border-primary transition-all cursor-pointer min-w-[160px] text-white/60"
                    >
                      <div className="flex items-center gap-2">
                        <Filter size={14} className="text-primary" />
                        <span>{sortBy === 'latest' ? 'Latest' : sortBy === 'popular' ? 'Popular' : sortBy === 'following' ? 'Following' : 'For You'}</span>
                      </div>
                      <ChevronDown size={14} className={`text-white/20 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isSortDropdownOpen && (
                      <div className="absolute right-0 top-full mt-2 w-full min-w-[180px] bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-1 glass animate-in fade-in zoom-in-95 duration-200">
                        {['latest', 'popular', 'recommended', 'following'].map((s) => (
                          <button 
                            key={s}
                            onClick={() => { setSortBy(s as any); setIsSortDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-colors hover:bg-white/5 ${sortBy === s ? 'text-primary bg-primary/5' : 'text-white'}`}
                          >
                            {s === 'recommended' ? 'For You' : s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tags Filter Bar */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                <button 
                  onClick={() => setActiveTag(null)}
                  className={`px-5 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all border uppercase tracking-[0.2em] ${!activeTag ? 'bg-primary border-primary text-black shadow-[0_0_20px_rgba(0,242,255,0.3)] scale-105' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}
                >
                  All Topics
                </button>
                {popularTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    className={`px-5 py-2 rounded-full text-[10px] font-black whitespace-nowrap transition-all border uppercase tracking-[0.2em] ${activeTag === tag ? 'bg-primary border-primary text-black shadow-[0_0_20px_rgba(0,242,255,0.3)] scale-105' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Articles Feed */}
            <div className="space-y-6 pt-2">
              {loading ? (
                // Loading Skeltons
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-black/5 dark:bg-[#121212] rounded-3xl border border-black/5 dark:border-white/5 p-6 animate-pulse flex flex-col sm:flex-row gap-6">
                    <div className="w-full sm:w-[240px] h-[160px] bg-black/10 dark:bg-white/5 rounded-2xl shrink-0"></div>
                    <div className="flex-1 space-y-4">
                      <div className="flex gap-2"><div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/5" /><div className="w-24 h-4 mt-2 bg-black/10 dark:bg-white/5 rounded" /></div>
                      <div className="w-3/4 h-6 bg-black/10 dark:bg-white/5 rounded"></div>
                      <div className="w-full h-4 bg-black/10 dark:bg-white/5 rounded"></div>
                      <div className="w-1/2 h-4 bg-black/10 dark:bg-white/5 rounded"></div>
                    </div>
                  </div>
                ))
              ) : filteredArticles.length > 0 ? (
                filteredArticles.map(article => (
                  <ArticleCard key={article.id} article={article} />
                ))
              ) : (
                <div className="text-center py-20 bg-black/5 dark:bg-[#121212] rounded-3xl border border-black/5 dark:border-white/5">
                  <div className="w-16 h-16 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-black/20 dark:text-white/20">
                    <Filter size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-black dark:text-white">No articles found</h3>
                  <p className="text-black/50 dark:text-white/50 max-w-sm mx-auto">Try adjusting your filters or search terms to find what you're looking for.</p>
                </div>
              )}
            </div>

          </div>

          {/* RIGHT: Sidebar Column */}
          <div className="lg:col-span-4 space-y-8">
            
            {/* Trending Block */}
            <div className="bg-black/5 dark:bg-[#121212] rounded-3xl border border-black/5 dark:border-white/5 p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
              <div className="flex items-center gap-2 mb-6">
                <Flame className="text-orange-500" size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight text-black dark:text-white">Trending Now</h3>
              </div>
              
              <div className="space-y-4">
                {trendingArticles.length > 0 ? trendingArticles.map((article, i) => (
                  <Link to={`/article/${article.id}`} key={article.id} className="group flex gap-4 items-start">
                    <span className="text-2xl font-black text-black/10 dark:text-white/10 group-hover:text-primary transition-colors">0{i + 1}</span>
                    <div>
                      <h4 className="font-bold text-black/90 dark:text-white/90 group-hover:text-primary transition-colors line-clamp-2 leading-snug uppercase tracking-tight">{article.title}</h4>
                      <p className="text-[10px] text-black/40 dark:text-white/40 mt-1 font-black uppercase tracking-widest">
                        {article.authorName} · {(() => {
                          if (!article.createdAt) return 'Recently';
                          try {
                            const d = article.createdAt.toDate ? article.createdAt.toDate() : new Date(article.createdAt);
                            if (!(d instanceof Date) || isNaN(d.getTime())) return 'Recently';
                            return formatDistanceToNow(d, { addSuffix: true });
                          } catch (e) {
                            return 'Recently';
                          }
                        })()}
                      </p>
                    </div>
                  </Link>
                )) : (
                  <p className="text-sm text-black/40 dark:text-white/40 font-medium">Not enough data to show trending.</p>
                )}
              </div>
            </div>

            {/* Tags Cloud */}
            <div className="bg-black/40 rounded-3xl border border-white/5 p-8 shadow-2xl glass">
              <div className="flex items-center gap-3 mb-8">
                <Hash className="text-primary" size={24} />
                <h3 className="text-xl font-black uppercase tracking-widest text-white italic">Discovery tags</h3>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {popularTags.map(tag => (
                  <button 
                    key={tag}
                    onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${activeTag === tag 
                      ? 'bg-primary border-primary text-black shadow-[0_0_15px_rgba(0,242,255,0.2)]' 
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:border-white/30 hover:bg-white/10'}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Suggested Authors */}
            <div className="bg-black/5 dark:bg-[#121212] rounded-3xl border border-black/5 dark:border-white/5 p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="text-green-400" size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight text-black dark:text-white">Creators to Follow</h3>
              </div>
              <div className="space-y-5">
                {suggestedAuthors.map(author => (
                  <Link to={`/creators/${author.id}`} key={author.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-black font-black text-xs shrink-0">
                        {author.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black group-hover:text-primary transition-colors text-black dark:text-white uppercase tracking-tight">{author.name}</p>
                        <p className="text-[10px] text-black/40 dark:text-white/40 font-black tracking-widest uppercase">@{author.username}</p>
                      </div>
                    </div>
                    <button className="text-[10px] font-black bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors group-hover:bg-primary/10 group-hover:text-primary uppercase tracking-widest text-black/60 dark:text-white/60">
                      View
                    </button>
                  </Link>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

