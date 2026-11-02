import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Clock, 
  TrendingUp, 
  Award, 
  Users, 
  Bell, 
  MessageSquare, 
  Calendar, 
  FileText,
  Search,
  Settings,
  LogOut,
  User as UserIcon,
  Zap,
  Home,
  Compass,
  Wallet,
  Store,
  Plus,
  Globe,
  PanelLeft,
  ChevronRight,
  ChevronLeft,
  Layout,
  HelpCircle,
  BarChart3,
  UserCircle,
  Moon,
  Sun,
  Shield
} from 'lucide-react';
import { collection, onSnapshot, query, where, doc, getDoc, collectionGroup, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signOut } from 'firebase/auth';
import KithLogo from './KithLogo';
import { motion, AnimatePresence } from 'motion/react';
import VerifiedBadge from './VerifiedBadge';

export default function AppSidebar({ user }: { user: any }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [totalUnreadDMs, setTotalUnreadDMs] = useState(0);
  const [joinedCommunities, setJoinedCommunities] = useState<any[]>([]);
  const [communityUnreads, setCommunityUnreads] = useState<Record<string, number>>({});
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
    document.documentElement.style.colorScheme = newTheme;
    
    if (user?.uid) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          theme: newTheme,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Error updating theme:", error);
      }
    }
  };

  useEffect(() => {
    // Keep internal theme state in sync with DOM
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch communities the user is a member of
    const qMembers = query(
      collectionGroup(db, 'members'),
      where('userId', '==', user.uid)
    );

    const unsubscribeMembers = onSnapshot(qMembers, async (snapshot) => {
      const communityIds = snapshot.docs.map(d => d.ref.parent.parent!.id);
      
      const communitiesData = await Promise.all(
        communityIds.map(async (id) => {
          const d = await getDoc(doc(db, 'communities', id));
          return d.exists() ? { id: d.id, ...d.data() } : null;
        })
      );
      
      setJoinedCommunities(communitiesData.filter(c => c !== null));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'members');
    });

    // Notifications
    const qNotifs = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid),
      where('read', '==', false)
    );
    const unsubscribeNotifs = onSnapshot(qNotifs, (notifSnap) => {
      setUnreadNotifications(notifSnap.size);
      
      const unreads: Record<string, number> = {};
      notifSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === 'message' && data.relatedId) {
          unreads[data.relatedId] = (unreads[data.relatedId] || 0) + 1;
        }
      });
      setCommunityUnreads(unreads);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    // DMs
    const qConvs = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );
    const unsubscribeConvs = onSnapshot(qConvs, (snapshot) => {
      let dmCount = 0;
      let requestCount = 0;
      snapshot.docs.forEach(d => {
        const data = d.data();
        const incomingRequest = data.status === 'pending' && data.requestedBy !== user.uid;
        const hidden = data.status === 'declined' && data.requestedBy !== user.uid;
        if (incomingRequest) requestCount += 1;
        else if (!hidden && !data.mutedBy?.includes(user.uid)) dmCount += data.unreadCount?.[user.uid] || 0;
      });
      setTotalUnreadDMs(dmCount + requestCount);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations');
    });

    return () => {
      unsubscribeMembers();
      unsubscribeNotifs();
      unsubscribeConvs();
    };
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;
  const isDashboardActive = location.pathname === '/dashboard';

  const getNavGradient = (to: string, active: boolean) => {
    let gradient = '';
    let glowColor = '';
    
    if (to === '/feed' || to.startsWith('/feed?')) {
      if (to.includes('view=communities')) {
        gradient = 'from-emerald-400 to-teal-500 dark:from-emerald-500 dark:to-teal-600';
        glowColor = 'rgba(16,185,129,0.35)';
      } else if (to.includes('view=notifications')) {
        gradient = 'from-pink-500 to-rose-600 dark:from-pink-600 dark:to-rose-700';
        glowColor = 'rgba(236,72,153,0.35)';
      } else if (to.includes('view=messages')) {
        gradient = 'from-cyan-400 to-blue-500 dark:from-cyan-500 dark:to-blue-600';
        glowColor = 'rgba(34,211,238,0.35)';
      } else {
        // Standard Neural Feed
        gradient = 'from-blue-500 to-indigo-600 dark:from-blue-600 dark:to-indigo-700';
        glowColor = 'rgba(59,130,246,0.35)';
      }
    } else if (to.includes('/marketplace')) {
      gradient = 'from-teal-400 to-indigo-600 dark:from-teal-500 dark:to-indigo-700';
      glowColor = 'rgba(20,184,166,0.35)';
    } else if (to.includes('/challenges')) {
      gradient = 'from-indigo-600 to-purple-600 dark:from-indigo-500 dark:to-purple-700';
      glowColor = 'rgba(79,70,229,0.35)';
    } else if (to.includes('/articles')) {
      gradient = 'from-violet-500 to-fuchsia-600 dark:from-violet-600 dark:to-fuchsia-700';
      glowColor = 'rgba(139,92,246,0.35)';
    } else if (to.includes('/events')) {
      gradient = 'from-rose-500 to-orange-500 dark:from-rose-600 dark:to-orange-600';
      glowColor = 'rgba(244,63,94,0.35)';
    } else if (to.includes('/admin')) {
      gradient = 'from-red-600 to-rose-900 dark:from-red-500 dark:to-rose-800';
      glowColor = 'rgba(220,38,38,0.4)';
    } else {
      gradient = 'from-[#7C3AED]/80 to-[#7C3AED] dark:from-[#7C3AED]/90 dark:to-[#7C3AED]';
      glowColor = 'rgba(124,58,237,0.35)';
    }

    return { gradient, glowColor };
  };

  const NavItem = ({ to, icon: Icon, label, active, badge }: { to: string, icon: any, label: string, active: boolean, badge?: number }) => {
    const { gradient, glowColor } = getNavGradient(to, active);
    
    return (
      <Link 
        to={to}
        className={`relative flex items-center gap-3 p-1.5 rounded-2xl transition-all group ${
          active 
            ? 'bg-black/[0.04] dark:bg-white/[0.04] border border-black/5 dark:border-white/10 text-black dark:text-white font-black' 
            : 'hover:bg-black/5 dark:hover:bg-white/5 text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white font-bold'
        }`}
      >
        <div 
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${gradient} text-white transition-all duration-300 ${
            active ? 'scale-105 shadow-md' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'
          }`}
          style={active ? { boxShadow: `0 4px 14px ${glowColor}` } : {}}
        >
          <Icon size={18} className="!text-white" />
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="text-sm whitespace-nowrap"
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
        {badge !== undefined && badge > 0 && !active && (
          <span className={`absolute ${isExpanded ? 'right-4' : 'top-0 right-0'} flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-black text-white border-2 border-white dark:border-[#050505] shadow-lg shadow-primary/40 z-10 p-1`}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
        {!isExpanded && (
          <div className="absolute left-full ml-4 px-3 py-1.5 bg-white dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[9999] shadow-2xl text-black dark:text-white">
            {label}
          </div>
        )}
      </Link>
    );
  };

  const xpPercent = Math.min((user?.xp || 0) % 100, 100);

  const PopupLink = ({ to, icon: Icon, label, onClick }: { to: string, icon: any, label: string, onClick: () => void }) => (
    <Link 
      to={to} 
      onClick={onClick}
      className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white transition-all group"
    >
      <Icon size={18} className="group-hover:text-primary transition-colors" />
      <span className="text-sm font-bold">{label}</span>
    </Link>
  );

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isExpanded ? 240 : 80 }}
      className="h-screen bg-white dark:bg-[#050505] border-r border-black/5 dark:border-white/5 flex flex-col z-50 transition-all duration-300 ease-in-out shrink-0 overflow-hidden"
    >
      {/* Header / Logo */}
      <div className="p-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <KithLogo size={32} className="shrink-0" />
          <AnimatePresence>
            {isExpanded && (
              <motion.span 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xl font-black italic tracking-tighter bg-gradient-to-br from-black to-black/60 dark:from-white dark:to-white/60 bg-clip-text text-transparent"
              >
                KITH
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-colors"
        >
          {isExpanded ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      {/* User Profile / XP */}
      <div className="px-4 py-6 relative">
        {user ? (
          <>
            <div 
              className={`relative flex items-center gap-4 p-2 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 ${isExpanded ? 'justify-start' : 'justify-center'} cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-all z-[101]`} 
              onClick={() => setShowProfilePopup(!showProfilePopup)}
            >
              <div className="relative shrink-0">
                 <svg className="w-10 h-10 -rotate-90">
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="transparent"
                      className="text-black/10 dark:text-white/10"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      strokeWidth="3"
                      strokeDasharray={113}
                      strokeDashoffset={113 - (113 * xpPercent) / 100}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      className="text-teal-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img 
                      src={(user?.profileImage && user.profileImage.trim() !== '') ? user.profileImage : (user?.photoURL && user.photoURL.trim() !== '' ? user.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`)} 
                      alt="P"
                      className="w-7 h-7 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
              </div>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="text-xs font-black truncate text-black dark:text-white flex items-center gap-1">
                      <span>{user?.displayName || 'Creator'}</span>
                      <VerifiedBadge verified={user?.verified} />
                    </div>
                    <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-bold tracking-tighter">{user?.xp || 0} XP</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile Popup */}
            <AnimatePresence>
              {showProfilePopup && (
                <>
                  <div 
                    className="fixed inset-0 z-[110] cursor-default bg-black/5 dark:bg-black/20 backdrop-blur-[2px]" 
                    onClick={() => setShowProfilePopup(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    className="fixed z-[120] w-[280px] sm:w-[320px] bg-white dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-[32px] shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    style={{ 
                      left: window.innerWidth < 640 ? '50%' : (isExpanded ? '240px' : '90px'),
                      top: window.innerWidth < 640 ? '50%' : '20px',
                      transform: window.innerWidth < 640 ? 'translate(-50%, -50%)' : 'none'
                    }}
                  >
                    <div className="p-6 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-3xl rounded-full" />
                      <div className="flex items-center gap-4 relative z-10">
                        <div className="relative">
                          <img 
                            src={(user?.profileImage && user.profileImage.trim() !== '') ? user.profileImage : (user?.photoURL && user.photoURL.trim() !== '' ? user.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`)} 
                            alt="" 
                            className="w-14 h-14 rounded-2xl border-2 border-white dark:border-[#0A0A0A] shadow-xl object-cover"
                          />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-teal-500 rounded-full border-2 border-white dark:border-[#0A0A0A] flex items-center justify-center">
                            <Zap size={10} className="text-white fill-white" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-black truncate text-[#111] dark:text-white uppercase tracking-tighter leading-tight flex items-center gap-1.5 flex-wrap">
                            <span>{user?.displayName || 'Creator'}</span>
                            <VerifiedBadge verified={user?.verified} />
                          </div>
                          <div className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-widest truncate">{user?.email}</div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <div className="h-1 flex-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-teal-500" style={{ width: `${xpPercent}%` }} />
                            </div>
                            <span className="text-[10px] font-black text-teal-600 dark:text-teal-400">{user?.xp || 0} XP</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Link 
                          to="/dashboard" 
                          onClick={() => setShowProfilePopup(false)}
                          className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-teal-500 hover:text-white transition-all text-black dark:text-white"
                        >
                          <Layout size={24} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Dash</span>
                        </Link>
                        <Link 
                          to="/dashboard?tab=overview" 
                          onClick={() => setShowProfilePopup(false)}
                          className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-teal-500 hover:text-white transition-all text-black dark:text-white"
                        >
                          <BarChart3 size={24} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Stats</span>
                        </Link>
                      </div>
                      
                      <div className="space-y-1">
                        <PopupLink to={`/creators/${user.uid}`} icon={UserCircle} label="Creator Portfolio" onClick={() => setShowProfilePopup(false)} />
                        <PopupLink to="/settings" icon={Settings} label="Account Settings" onClick={() => setShowProfilePopup(false)} />
                        
                        <button 
                          onClick={toggleTheme}
                          className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white transition-all group"
                        >
                          {theme === 'dark' ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-400" />}
                          <span className="text-sm font-bold">{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</span>
                        </button>

                        <PopupLink to="/help" icon={HelpCircle} label="Help & Support" onClick={() => setShowProfilePopup(false)} />
                      </div>
                    </div>

                    <div className="p-3 pt-0">
                      <button 
                        onClick={handleLogout}
                        className="flex items-center justify-between w-full p-4 rounded-2xl bg-red-500/5 hover:bg-red-500 text-red-600 hover:text-white transition-all group"
                      >
                        <span className="text-xs font-black uppercase tracking-widest">Terminate Session</span>
                        <LogOut size={18} />
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        ) : (
          <Link 
            to="/login"
            className={`flex items-center gap-4 p-3 rounded-2xl bg-primary text-black neon-glow transition-all ${isExpanded ? 'w-full' : 'w-fit mx-auto'}`}
          >
            <LogOut size={22} className="shrink-0 rotate-180 text-black" />
            <AnimatePresence>
              {isExpanded && (
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="font-bold text-xs whitespace-nowrap uppercase tracking-widest text-black"
                >
                  Log In
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        )}
      </div>

      {/* Nav Section */}
      <div className="flex-grow flex flex-col gap-1 px-3.5 py-2 overflow-y-auto no-scrollbar overflow-x-hidden">
        <NavItem to="/feed" icon={Home} label="Neural Feed" active={location.pathname === '/feed' && !searchParams.has('view')} />
        <NavItem to="/feed?view=communities" icon={Globe} label="Communities" active={location.pathname === '/feed' && searchParams.get('view') === 'communities'} />
        <NavItem to="/marketplace" icon={Store} label="Marketplace" active={isActive('/marketplace')} />
        <NavItem to="/challenges" icon={Award} label="Bounties" active={isActive('/challenges')} />
        <NavItem to="/articles" icon={FileText} label="Articles" active={isActive('/articles')} />
        <NavItem to="/events" icon={Calendar} label="Global Events" active={isActive('/events')} />
        
        {user && (
          <>
            <div className="h-px bg-black/5 dark:bg-white/5 my-2" />

            <NavItem 
              to="/feed?view=notifications" 
              icon={Bell} 
              label="Notifications" 
              active={location.pathname === '/feed' && searchParams.get('view') === 'notifications'} 
              badge={unreadNotifications}
            />
            <NavItem 
              to="/feed?view=messages" 
              icon={MessageSquare} 
              label="Messages" 
              active={location.pathname === '/feed' && searchParams.get('view') === 'messages'} 
              badge={totalUnreadDMs}
            />
            
            {(user.role === 'admin' || user.email === 'danieludofa452@gmail.com') && (
              <NavItem 
                to="/admin" 
                icon={Shield} 
                label="Admin Panel" 
                active={location.pathname === '/admin'} 
              />
            )}
            
            <div className="h-px bg-black/5 dark:bg-white/5 my-2" />

            {/* Communities List */}
            <div className="flex flex-col gap-0 py-0.5">
              {joinedCommunities.map(community => (
                <Link
                  key={community.id}
                  to={`/feed?view=community&id=${community.id}`}
                  className={`relative flex items-center gap-3 p-1 rounded-2xl transition-all group ${searchParams.get('id') === community.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all ${searchParams.get('id') === community.id ? 'border-primary shadow-[0_0_15px_rgba(124,58,237,0.3)]' : 'border-black/10 dark:border-white/10 group-hover:border-black/30 dark:group-hover:border-white/30'}`}>
                      <img 
                        src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/100/100`} 
                        alt={community.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {communityUnreads[community.id] > 0 && (
                      <div className="absolute -top-2 -right-2 min-w-[22px] h-6 bg-primary text-white text-xs font-black rounded-full flex items-center justify-center px-2 border-2 border-white dark:border-[#050505] shadow-lg shadow-primary/40 neon-glow z-10">
                        {communityUnreads[community.id] > 99 ? '99+' : communityUnreads[community.id]}
                      </div>
                    )}
                  </div>
                  
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="text-xs font-bold truncate text-black dark:text-white">{community.name}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isExpanded && (
                    <div className="absolute left-full ml-4 px-3 py-1.5 bg-white dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[9999] shadow-2xl text-black dark:text-white">
                      {community.name}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 mt-auto">
        {!isExpanded && (
          <button 
            onClick={toggleTheme}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5 text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-all mx-auto"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        )}
      </div>
    </motion.aside>
  );
}
