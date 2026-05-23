import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Award, Calendar, ChevronRight, Code, Trophy, Zap, DollarSign, Users, Filter, Clock, Pickaxe, PenTool, Layout, Swords, CheckCircle2, MessageSquare, Briefcase } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Challenge, ChallengeType } from '../types/challenges';
import { toast } from 'react-hot-toast';

// Submissions count is now read directly from the challenge doc's participantCount field
// to avoid permission errors on the submissions subcollection for standard users.

export default function Challenges() {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'for-you' | 'all' | 'build' | 'design' | 'content' | 'problem-solving'>('for-you');
  const [creatorTab, setCreatorTab] = useState<'all' | 'individual' | 'brand'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filterBy, setFilterBy] = useState<'open' | 'in-review' | 'completed'>('open');
  const [sortBy, setSortBy] = useState<'deadline-soon' | 'deadline-far' | 'prize-high' | 'prize-low' | 'subs-high' | 'subs-low'>('deadline-soon');
  const navigate = useNavigate();

  useEffect(() => {
    // In a real app this would query the new challenges schema.
    // We fall back if db is empty for design showcase.
    const q = query(collection(db, 'challenges'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetched: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Injecting dummy data if empty to showcase the new design structure
      if (fetched.length === 0) {
        fetched = [
          {
            id: '1',
            title: 'SaaS Dashboard Redesign',
            creatorName: 'Acme Corp',
            isVerified: true,
            type: 'design',
            status: 'active',
            rewardPool: { cashAmount: 500, currency: 'USDT' },
            deadlines: { submissionEnd: Date.now() + 2 * 864000000 },
            participantCount: 142,
            difficulty: 'Hard'
          },
          {
            id: '2',
            title: 'Build an AI Chatbot Applet',
            creatorName: 'Perena',
            isVerified: true,
            type: 'build',
            status: 'active',
            rewardPool: { cashAmount: 160, currency: 'USDC' },
            deadlines: { submissionEnd: Date.now() + 2 * 864000000 },
            participantCount: 12,
            difficulty: 'Medium'
          },
          {
            id: '3',
            title: 'Optimize Database Query Planner',
            creatorName: 'Superteam Nigeria',
            isVerified: true,
            type: 'problem-solving',
            status: 'judging',
            rewardPool: { cashAmount: 1500, currency: 'USDG' },
            deadlines: { submissionEnd: Date.now() + 3 * 864000000 },
            participantCount: 29,
            difficulty: 'Nightmare'
          },
          {
            id: '4',
            title: 'Xpend X Solana Writers Bounty',
            creatorName: 'Superteam Nigeria',
            isVerified: true,
            type: 'content',
            status: 'active',
            rewardPool: { cashAmount: 1500, currency: 'USDG' },
            deadlines: { submissionEnd: Date.now() + 3 * 864000000 },
            participantCount: 29,
            difficulty: 'Medium'
          },
          {
            id: '5',
            title: 'SurfCash Video Bounty',
            creatorName: 'Superteam Nigeria',
            isVerified: true,
            type: 'content',
            status: 'active',
            rewardPool: { cashAmount: 1500, currency: 'USDG' },
            deadlines: { submissionEnd: Date.now() + 3 * 864000000 },
            participantCount: 4,
            difficulty: 'Medium'
          }
        ];
      }
      setChallenges(fetched);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getTypeColorClasses = (type: string) => {
    switch(type) {
      case 'build': return 'bg-blue-600 text-white';
      case 'design': return 'bg-pink-600 text-white';
      case 'content': return 'bg-purple-600 text-white';
      case 'problem-solving': return 'bg-emerald-600 text-white';
      default: return 'bg-gray-800 text-white';
    }
  };

  const getLightTypeColorClasses = (type: string) => {
    switch(type) {
      case 'build': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'design': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      case 'content': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'problem-solving': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const totalListed = challenges.length;
  const totalValue = challenges.reduce((sum, challenge) => {
    const amount = challenge.rewardPool?.cashAmount;
    if (typeof amount === 'number') return sum + amount;
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount.replace(/[^0-9.-]+/g, ""));
      return sum + (isNaN(parsed) ? 0 : parsed);
    }
    return sum;
  }, 0);

  const filteredChallenges = (activeTab === 'all' || activeTab === 'for-you')
    ? challenges 
    : challenges.filter(c => c.type === activeTab);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Banner Area */}
      <div className="relative bg-gradient-to-r from-indigo-950 via-purple-900 to-[#0B0F19] w-full pt-20 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?q=80&w=2070&auto=format&fit=crop')] object-cover opacity-10 mix-blend-overlay"></div>
        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">
              Level Up Your Proof of Work
            </h1>
            <p className="text-xl text-white/80 leading-relaxed mb-8 max-w-xl">
              Solve real-world problems from top brands and verified individuals. Submit your best work, climb the leaderboards, and get rewarded.
            </p>
            <button 
              onClick={() => {
                if (!auth.currentUser) {
                  toast.error('Sign in to host your own challenges');
                  return;
                }
                navigate('/create-challenge');
              }}
              className="inline-flex items-center justify-center bg-foreground text-background font-semibold px-6 py-3 rounded-xl hover:bg-foreground/90 transition-colors"
            >
              Host a Challenge
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-12">
        <div className="flex flex-col lg:flex-row justify-center gap-12 xl:gap-20">
          
          {/* Main Content Area: Left Column */}
          <div className="flex-1 max-w-[800px] xl:pr-10">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between border-b border-foreground/10 pb-4 mb-6 relative">
              <div className="flex items-center gap-6">
                <h2 className="text-xl font-bold">Browse Challenges</h2>
                <div className="hidden sm:flex items-center gap-6 text-sm font-medium">
                  <button onClick={() => setCreatorTab('all')} className={`pb-4 -mb-4 px-1 transition-colors ${creatorTab === 'all' ? 'text-foreground border-b-2 border-foreground' : 'text-foreground/40 hover:text-foreground'}`}>All</button>
                  <button onClick={() => setCreatorTab('individual')} className={`pb-4 -mb-4 px-1 transition-colors ${creatorTab === 'individual' ? 'text-foreground border-b-2 border-foreground' : 'text-foreground/40 hover:text-foreground'}`}>Individuals</button>
                  <button onClick={() => setCreatorTab('brand')} className={`pb-4 -mb-4 px-1 transition-colors ${creatorTab === 'brand' ? 'text-foreground border-b-2 border-foreground' : 'text-foreground/40 hover:text-foreground'}`}>Brand/Company</button>
                </div>
              </div>
              <div className="relative">
                <button 
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)} 
                  className={`flex items-center gap-2 text-sm transition-colors ${showFilterDropdown ? 'text-primary' : 'text-foreground/60 hover:text-foreground'}`}
                >
                  Filter <Filter size={16} />
                </button>
                
                {/* Filter Dropdown UI */}
                <AnimatePresence>
                  {showFilterDropdown && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-64 bg-background border border-foreground/10 rounded-xl shadow-2xl overflow-hidden z-20"
                    >
                      <div className="p-4">
                        <div className="text-foreground/50 font-medium text-sm mb-3 text-left">Filter By</div>
                        <div className="space-y-2">
                          <button onClick={() => setFilterBy('open')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${filterBy === 'open' ? 'bg-foreground/5' : 'hover:bg-foreground/5'}`}>
                            <div className={`w-4 h-4 rounded-full border-[3px] flex items-center justify-center ${filterBy === 'open' ? 'border-[#34d399]' : 'border-foreground/20'}`}>
                              {filterBy === 'open' && <div className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />}
                            </div>
                            <span className="text-foreground">Open</span>
                          </button>
                          <button onClick={() => setFilterBy('in-review')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${filterBy === 'in-review' ? 'bg-foreground/5' : 'hover:bg-foreground/5'}`}>
                            <div className={`w-4 h-4 rounded-full border-[3px] flex items-center justify-center ${filterBy === 'in-review' ? 'border-[#fbbf24]' : 'border-foreground/20'}`}>
                              {filterBy === 'in-review' && <div className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />}
                            </div>
                            <span className="text-foreground">In Review</span>
                          </button>
                          <button onClick={() => setFilterBy('completed')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${filterBy === 'completed' ? 'bg-foreground/5' : 'hover:bg-foreground/5'}`}>
                            <div className={`w-4 h-4 rounded-full border-[3px] flex items-center justify-center ${filterBy === 'completed' ? 'border-[#64748b]' : 'border-foreground/20'}`}>
                              {filterBy === 'completed' && <div className="w-1.5 h-1.5 rounded-full bg-[#64748b]" />}
                            </div>
                            <span className="text-foreground">Completed</span>
                          </button>
                        </div>
                        
                        <div className="h-px bg-foreground/10 my-4 -mx-4" />
                        
                        <div className="text-foreground/50 font-medium text-sm mb-3 text-left">Sort By</div>
                        <div className="space-y-1">
                          <button onClick={() => setSortBy('deadline-soon')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${sortBy === 'deadline-soon' ? 'bg-foreground/5 text-primary font-medium' : 'text-foreground/70 hover:bg-foreground/5'}`}>
                            <Clock size={16} className={sortBy === 'deadline-soon' ? 'text-primary' : 'text-foreground/40'} /> Deadline: Soonest First
                          </button>
                          <button onClick={() => setSortBy('deadline-far')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${sortBy === 'deadline-far' ? 'bg-foreground/5 text-primary font-medium' : 'text-foreground/70 hover:bg-foreground/5'}`}>
                            <Clock size={16} className={sortBy === 'deadline-far' ? 'text-primary' : 'text-foreground/40'} /> Deadline: Furthest First
                          </button>
                          <button onClick={() => setSortBy('prize-high')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${sortBy === 'prize-high' ? 'bg-foreground/5 text-primary font-medium' : 'text-foreground/70 hover:bg-foreground/5'}`}>
                            <DollarSign size={16} className={sortBy === 'prize-high' ? 'text-primary' : 'text-foreground/40'} /> Prize: High to Low
                          </button>
                          <button onClick={() => setSortBy('prize-low')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${sortBy === 'prize-low' ? 'bg-foreground/5 text-primary font-medium' : 'text-foreground/70 hover:bg-foreground/5'}`}>
                            <DollarSign size={16} className={sortBy === 'prize-low' ? 'text-primary' : 'text-foreground/40'} /> Prize: Low to High
                          </button>
                          <button onClick={() => setSortBy('subs-high')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${sortBy === 'subs-high' ? 'bg-foreground/5 text-primary font-medium' : 'text-foreground/70 hover:bg-foreground/5'}`}>
                            <Briefcase size={16} className={sortBy === 'subs-high' ? 'text-primary' : 'text-foreground/40'} /> Submissions: High to Low
                          </button>
                          <button onClick={() => setSortBy('subs-low')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${sortBy === 'subs-low' ? 'bg-foreground/5 text-primary font-medium' : 'text-foreground/70 hover:bg-foreground/5'}`}>
                            <Briefcase size={16} className={sortBy === 'subs-low' ? 'text-primary' : 'text-foreground/40'} /> Submissions: Low to High
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Pill Filters */}
            <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4">
               <button onClick={() => setActiveTab('for-you')} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${activeTab === 'for-you' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-foreground/60 border-foreground/10 hover:border-black/30 dark:hover:border-white/30'}`}>For You</button>
               <button onClick={() => setActiveTab('all')} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${activeTab === 'all' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-foreground/60 border-foreground/10 hover:border-black/30 dark:hover:border-white/30'}`}>All</button>
               <button onClick={() => setActiveTab('content')} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${activeTab === 'content' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-foreground/60 border-foreground/10 hover:border-black/30 dark:hover:border-white/30'}`}>Content</button>
               <button onClick={() => setActiveTab('design')} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${activeTab === 'design' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-foreground/60 border-foreground/10 hover:border-black/30 dark:hover:border-white/30'}`}>Design</button>
               <button onClick={() => setActiveTab('build')} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${activeTab === 'build' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-foreground/60 border-foreground/10 hover:border-black/30 dark:hover:border-white/30'}`}>Development</button>
               <button onClick={() => setActiveTab('problem-solving')} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${activeTab === 'problem-solving' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-transparent text-foreground/60 border-foreground/10 hover:border-black/30 dark:hover:border-white/30'}`}>Other</button>
            </div>

            {/* List View Container */}
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col">
                <AnimatePresence>
                  {filteredChallenges.map((challenge, i) => {
                    const daysLeft = Math.max(0, Math.ceil((challenge.deadlines?.submissionEnd - Date.now()) / (1000 * 60 * 60 * 24)));
                    
                    return (
                        <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2, delay: i * 0.05 }}
                        key={challenge.id}
                        onClick={() => navigate(`/challenges/${challenge.id}`)}
                        className="group flex flex-col sm:flex-row items-stretch sm:items-center justify-between py-5 border-b border-foreground/5 hover:bg-black/5 dark:hover:bg-white/[0.02] transition-colors cursor-pointer rounded-xl px-2 -mx-2"
                      >
                        <div className="flex items-start gap-4">
                          {/* Square Logo Box */}
                          <div className={`w-14 h-14 rounded-xl flex shrink-0 items-center justify-center ${getTypeColorClasses(challenge.type)}`}>
                            {challenge.type === 'design' ? <PenTool size={24} /> :
                             challenge.type === 'build' ? <Code size={24} /> :
                             challenge.type === 'problem-solving' ? <Pickaxe size={24} /> :
                             <Layout size={24} />}
                          </div>

                          {/* Content */}
                          <div className="flex flex-col gap-0.5">
                            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                              {challenge.title}
                            </h3>
                            <div className="flex items-center gap-1.5 text-base text-foreground/50">
                              {challenge.creatorName || 'Anonymous Partner'}
                              {challenge.isVerified && <CheckCircle2 size={16} className="text-blue-400" />}
                            </div>

                            {/* Meta Row */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-foreground/40 mt-1 uppercase tracking-wider">
                              <span className="flex items-center gap-1">
                                {challenge.type === 'build' ? <Briefcase size={12}/> : <Zap size={12} className="text-yellow-500 dark:text-yellow-400/70" />}
                                Bounty
                              </span>
                              <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
                              <span>Due in {daysLeft}d</span>
                              <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
                              <span className="flex items-center gap-1">
                                <MessageSquare size={12}/> {challenge.participantCount || challenge.submissionCount || 0} submissions
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Reward Right Side */}
                        <div className="mt-4 sm:mt-0 flex items-center justify-end sm:flex-col sm:items-end gap-1 shrink-0 pl-18 sm:pl-0 sm:min-w-[120px]">
                           <div className="flex items-center gap-2">
                             <div className="bg-green-500/10 dark:bg-green-500/20 text-green-500 dark:text-green-400 rounded-full w-5 h-5 flex items-center justify-center">
                               <DollarSign size={12} strokeWidth={3} />
                             </div>
                             <span className="text-lg font-bold text-foreground">
                              {challenge.rewardPool?.cashAmount ? challenge.rewardPool.cashAmount.toLocaleString() : '1,500'}
                             </span>
                             <span className="text-xs font-medium text-foreground/40 mt-0.5">
                              {challenge.rewardPool?.currency || 'USDC'}
                             </span>
                           </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                
                {filteredChallenges.length === 0 && (
                  <div className="text-center py-20">
                    <p className="text-white/40">No opportunities found for this category.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-[350px] shrink-0 space-y-8">
            {/* Top Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-transparent rounded-2xl border border-foreground/10 p-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-foreground/60">
                  <DollarSign size={16} /> <span className="text-[10px] font-bold uppercase tracking-wider">Total Value</span>
                </div>
                <div className="text-[10px] font-bold flex items-baseline gap-1 text-primary">
                  {totalValue.toLocaleString()} <span className="text-[10px] text-foreground/40 font-normal uppercase text-primary">USD</span>
                </div>
              </div>
              <div className="bg-transparent rounded-2xl border border-foreground/10 p-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-foreground/60">
                  <Briefcase size={16} /> <span className="text-[10px] font-bold uppercase tracking-wider">Listed</span>
                </div>
                <div className="text-[10px] font-bold text-primary">
                  {totalListed.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Promo Card CTA */}
            <div className="bg-transparent dark:bg-[#1a2035] rounded-2xl border border-foreground/10 overflow-hidden relative group">
              <div className="h-40 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center relative">
                 <div className="absolute inset-0 bg-gradient-to-t from-background dark:from-[#1a2035] via-transparent to-transparent"></div>  
                 <div className="absolute inset-0 flex items-center justify-center">
                    <h3 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 italic tracking-tighter drop-shadow-2xl">FRONTIER</h3>
                 </div>
              </div>
              <div className="p-6">
                <h4 className="text-lg font-bold mb-2 text-foreground">Are you a dev? We have prizes worth $360,000+ for you</h4>
                <p className="text-sm text-foreground/50 mb-6 leading-relaxed">
                  Submit to any of the Frontier side tracks on Earn and stand to win from $360,000+. Deadline for submissions is May 12.
                </p>
                <button className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-3 rounded-xl transition-colors">
                  View Tracks
                </button>
              </div>
            </div>

            {/* How it works */}
            <div className="pt-2">
              <h4 className="text-sm font-bold text-foreground/40 uppercase tracking-widest mb-6">How it works</h4>
              <div className="relative pl-3 space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-black/10 dark:before:bg-white/10">
                 
                 <div className="relative flex items-start gap-4">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5 relative z-10 shadow-[0_0_10px_rgba(139,92,246,0.5)]">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                    </div>
                    <div>
                      <h5 className="text-base font-semibold mb-1">Create your Profile</h5>
                      <p className="text-sm text-foreground/40 text-balance">by telling us about yourself</p>
                    </div>
                 </div>

                 <div className="relative flex items-start gap-4">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5 relative z-10 shadow-[0_0_10px_rgba(139,92,246,0.5)]">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                    </div>
                    <div>
                      <h5 className="text-base font-semibold mb-1">Participate in Bounties</h5>
                      <p className="text-sm text-foreground/40 text-balance">to build proof of work</p>
                    </div>
                 </div>

                 <div className="relative flex items-start gap-4">
                    <div className="w-5 h-5 rounded-full bg-transparent border border-foreground/20 flex items-center justify-center shrink-0 mt-0.5 relative z-10">
                      
                    </div>
                    <div>
                      <h5 className="text-base font-semibold mb-1 text-primary">Get Paid for Your Work</h5>
                      <p className="text-sm text-foreground/40 text-balance">in global standards</p>
                    </div>
                 </div>

              </div>
            </div>

            {/* Leaderboard snippet */}
             <div className="pt-4 border-t border-foreground/10">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-sm font-bold text-foreground/40 uppercase tracking-widest">Recent Earners</h4>
                <button className="text-sm text-foreground/60 hover:text-foreground flex items-center gap-1 transition-colors">Leaderboard <ChevronRight size={14}/></button>
              </div>
              
              <div className="space-y-4">
                {[
                  { name: 'Oghenerukevwe', team: 'Adrena x Autonom', amount: 1000 },
                  { name: 'OUTIS', team: 'Adrena x Autonom', amount: 2500 },
                  { name: 'Younes Ghazanfar', team: 'Video Explaining', amount: 400 },
                  { name: 'Lilyth Lilyth', team: 'Short-form Explainer', amount: 250 }
                ].map((earner, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                     <div className="flex items-center gap-3">
                       <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt={earner.name} className="w-8 h-8 rounded-full border border-foreground/10" />
                       <div className="flex flex-col">
                         <span className="text-base font-semibold leading-none mb-1">{earner.name}</span>
                         <span className="text-xs text-foreground/40 truncate w-32">{earner.team}</span>
                       </div>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <div className="bg-green-500/10 dark:bg-green-500/20 text-green-500 dark:text-green-400 rounded-full w-5 h-5 flex items-center justify-center">
                         <DollarSign size={12} strokeWidth={3} />
                       </div>
                       <span className="text-sm font-bold">{earner.amount >= 1000 ? `${(earner.amount/1000).toFixed(1)}k` : earner.amount} <span className="font-normal text-foreground/40">USDC</span></span>
                     </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
