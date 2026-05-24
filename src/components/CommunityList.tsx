import { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, collectionGroup, where, limit, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, Search, Filter, ChevronLeft, ChevronRight, Award, DollarSign, Globe, Monitor, Rocket, Briefcase, GraduationCap, Trophy, Coins, Sparkles } from 'lucide-react';
import CommunityCard from './CommunityCard';
import CreateCommunityModal from './CreateCommunityModal';
import CommunityDetailsModal from './CommunityDetailsModal';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { feedService } from '../services/feedService';

export default function CommunityList() {
  const { data: communities = [], isLoading: loading } = useQuery({
    queryKey: ['communities'],
    queryFn: () => feedService.getCommunities(),
  });

  const [joinedCommunityIds, setJoinedCommunityIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [, setSearchParams] = useSearchParams();
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const categories = [
    { id: 'All', name: 'All', icon: Globe },
    { id: 'technology', name: 'Technology', icon: Monitor },
    { id: 'build-projects', name: 'Build & Projects', icon: Rocket },
    { id: 'career', name: 'Career', icon: Briefcase },
    { id: 'education-learning', name: 'Education & Learning', icon: GraduationCap },
    { id: 'challenges-competition', name: 'Challenges & Competition', icon: Trophy },
    { id: 'monetization-sales', name: 'Monetization & Sales', icon: Coins },
    { id: 'brand', name: 'Brand', icon: Sparkles }
  ];

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = 300;
      categoryScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    // Fetch joined community IDs - still use onSnapshot for membership status
    let unsubscribeMembers = () => {};
    if (auth.currentUser) {
      const qMembers = query(
        collectionGroup(db, 'members'),
        where('userId', '==', auth.currentUser.uid)
      );
      unsubscribeMembers = onSnapshot(qMembers, (snapshot) => {
        const ids = new Set(snapshot.docs.map(d => d.ref.parent.parent!.id));
        setJoinedCommunityIds(ids);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'members');
      });
    }

    return () => {
      unsubscribeMembers();
    };
  }, [auth.currentUser]);

  const isAdmin = auth.currentUser?.email === 'danieludofa452@gmail.com';

  const handleCommunityClick = (communityId: string) => {
    if (joinedCommunityIds.has(communityId)) {
      setSearchParams({ view: 'community', id: communityId });
    } else {
      setSelectedCommunityId(communityId);
    }
  };

  const filteredCommunities = communities.filter(c => {
    // Hide private communities from discovery unless the user is already a member or the creator
    const isPrivate = c.isPrivate || (c.membershipControl?.accessType && c.membershipControl?.accessType !== 'public');
    const isVisible = !isPrivate || joinedCommunityIds.has(c.id) || c.creatorId === auth.currentUser?.uid || isAdmin;
    if (!isVisible) return false;

    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || c.category === categoryFilter;
    const matchesPrice = priceFilter === 'all' || (priceFilter === 'free' ? !c.isPaid : c.isPaid);
    return matchesSearch && matchesCategory && matchesPrice;
  });

  const myCreatedCommunities = communities.filter(c => c.creatorId === auth.currentUser?.uid).slice(0, 5);
  const suggestedCommunities = communities.filter(c => 
    !joinedCommunityIds.has(c.id) && 
    c.creatorId !== auth.currentUser?.uid && 
    !c.isPrivate
  ).slice(0, 5);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-background text-foreground">
      {/* Top Banner Area (Hero Section) */}
      <div className="relative bg-gradient-to-r from-emerald-950 via-teal-900 dark:to-[#0B0F19] w-full pt-16 pb-16 overflow-hidden border-b border-foreground/5 mb-8">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop')] object-cover opacity-10 mix-blend-overlay"></div>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">
                Discover <span className="text-teal-400">Communities</span>
              </h1>
              <p className="text-white/80 text-lg max-w-xl leading-relaxed">
                Join spaces that match your interests and tech stack. Collaborate with like-minded creators.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-foreground text-background px-6 py-3 rounded-full font-bold hover:bg-foreground/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <Plus size={20} />
                <span>Create Community</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 pb-20">
      
      {/* Category Filter Bar */}
      <div className="mb-10 w-full border-b border-foreground/5 relative group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => scrollCategories('left')}
            className="w-8 h-8 rounded-full bg-background/60 backdrop-blur-md border border-foreground/10 flex items-center justify-center text-foreground hover:bg-primary transition-all"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <div 
          ref={categoryScrollRef}
          className="overflow-x-auto no-scrollbar pb-4 -mb-4 scroll-smooth"
        >
          <div className="flex justify-start gap-4 min-w-max px-10 py-4">
            {categories.map((cat) => {
              const IconComp = cat.icon;
              const isActive = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl transition-all relative ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 scale-105'
                      : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground/70'
                  }`}
                >
                  <IconComp size={18} className={isActive ? 'text-white' : ''} />
                  <span className={`text-sm font-bold whitespace-nowrap ${
                    isActive ? 'text-white' : ''
                  }`}>
                    {cat.name}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeCatPill"
                      className="absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 -z-10"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => scrollCategories('right')}
            className="w-8 h-8 rounded-full bg-background/60 backdrop-blur-md border border-foreground/10 flex items-center justify-center text-foreground hover:bg-primary transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        {/* Left Column: Search, Filters, List */}
        <div className="flex-1 min-w-0">
          {/* Filters & Search */}
          <div className="flex flex-col md:flex-row gap-4 mb-8 relative">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" size={20} />
              <input 
                type="text"
                placeholder="Search communities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-primary transition-all text-sm mb-0"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-2xl border transition-all text-sm font-bold ${
                    showFilters ? 'bg-foreground text-background border-foreground' : 'bg-foreground/5 text-foreground/60 border-foreground/10 hover:bg-foreground/10'
                  }`}
                >
                  <Filter size={18} />
                  Filters
                  {(priceFilter !== 'all') && (
                    <span className="w-2 h-2 bg-primary rounded-full" />
                  )}
                </button>

                <AnimatePresence>
                  {showFilters && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowFilters(false)} 
                      />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-64 bg-background border border-foreground/10 rounded-3xl shadow-2xl z-50 p-6 space-y-6"
                      >
                        {/* Price Filter */}
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-foreground/30 uppercase tracking-widest">Fee</label>
                          <div className="flex bg-foreground/5 rounded-xl p-1 border border-foreground/5">
                            {(['all', 'free', 'paid'] as const).map((p) => (
                              <button
                                key={p}
                                onClick={() => setPriceFilter(p)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                                  priceFilter === p ? 'bg-foreground text-white' : 'text-foreground/40 hover:text-foreground/60'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button 
                          onClick={() => {
                            setPriceFilter('all');
                            setCategoryFilter('All');
                          }}
                          className="w-full py-2 text-xs font-bold text-primary hover:underline"
                        >
                          Reset All Filters
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Communities Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-64 glass rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filteredCommunities.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredCommunities.map((community) => (
                  <motion.div
                    key={community.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <CommunityCard 
                      community={community} 
                      isMember={joinedCommunityIds.has(community.id)}
                      onClick={() => handleCommunityClick(community.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-20 glass rounded-3xl">
              <div className="w-16 h-16 bg-foreground/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users size={32} className="text-foreground/20" />
              </div>
              <h3 className="text-xl font-bold mb-2">No communities found</h3>
              <p className="text-foreground/40">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>

        {/* Right Sidebar: Suggested, Created */}
        <div className="w-full xl:w-80 space-y-8">
          {/* Created Communities */}
          <div className="glass rounded-[32px] p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">My Communities</h3>
              <Link to="/dashboard" className="text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">Manage</Link>
            </div>
            <div className="space-y-4">
              {myCreatedCommunities.length > 0 ? myCreatedCommunities.map(community => (
                <button key={community.id} onClick={() => handleCommunityClick(community.id)} className="flex items-center gap-4 group w-full text-left">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-foreground/10">
                    <img src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/100/100`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" alt="" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors text-foreground">{community.name}</h4>
                    <p className="text-[10px] text-foreground/40">{community.memberCount || 0} members</p>
                  </div>
                </button>
              )) : (
                <p className="text-xs text-foreground/30 italic">No communities created yet.</p>
              )}
            </div>
          </div>

          {/* Suggested Communities */}
          <div className="glass rounded-[32px] p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Suggested</h3>
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Award size={16} />
              </div>
            </div>
            <div className="space-y-4">
              {suggestedCommunities.map(community => (
                <button key={community.id} onClick={() => handleCommunityClick(community.id)} className="flex items-center gap-4 group w-full text-left">
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-foreground/10">
                    <img src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/100/100`} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" alt="" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate group-hover:text-primary transition-colors text-foreground">{community.name}</h4>
                    <div className="flex items-center gap-2">
                      <Users size={10} className="text-primary/60" />
                      <span className="text-[10px] text-foreground/40 font-bold">{community.memberCount || 0} members</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <CreateCommunityModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)} 
      />

      <CommunityDetailsModal 
        isOpen={!!selectedCommunityId} 
        onClose={() => setSelectedCommunityId(null)} 
        communityId={selectedCommunityId || ''}
        onJoinSuccess={() => {
          if (selectedCommunityId) {
            setSearchParams({ view: 'community', id: selectedCommunityId });
            setSelectedCommunityId(null);
          }
        }}
      />
      </div>
    </div>
  );
}
