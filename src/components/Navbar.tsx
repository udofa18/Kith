import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { LogIn, LogOut, Plus, Search, Settings, User as UserIcon, Zap, Github, Chrome, Bell } from 'lucide-react';
import KithLogo from './KithLogo';
import { canSeeChallenges } from '../lib/features';

export default function Navbar({ user }: { user: any }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.size);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/feed?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-black/10 dark:border-white/10 px-6 py-2">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between">
        <Link to="/" className="text-xl font-black tracking-tighter flex items-center gap-2">
          <KithLogo size={36} className="neon-glow" />
          <span className="text-black dark:text-white uppercase">
            Kith
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-widest text-black/50 dark:text-white/50">
          <Link to="/explore" className="hover:text-black dark:hover:text-white transition-colors">Neural Market</Link>
          <Link to="/feed" className="hover:text-black dark:hover:text-white transition-colors">Pulse Feed</Link>
          {canSeeChallenges(user) && (
            <Link to="/challenges" className="flex items-center gap-1.5 hover:text-black dark:hover:text-white transition-colors relative">
              Bounties
              <span className="text-[8px] bg-primary text-white px-1.5 py-0.5 rounded-md font-black leading-none uppercase">Alpha</span>
            </Link>
          )}
        </div>

        <div className="hidden lg:flex flex-1 max-w-sm mx-8">
          <form onSubmit={handleSearch} className="w-full relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={16} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search protocol..." 
              className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full py-1.5 pl-10 pr-4 text-xs font-medium focus:border-primary outline-none transition-all text-black dark:text-white shadow-inner"
            />
          </form>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="hidden lg:flex items-center gap-2 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 px-3 py-1.5 rounded-full">
                <div className="w-4 h-4 bg-yellow-400/20 rounded-full flex items-center justify-center">
                  <Zap size={10} className="text-yellow-400" />
                </div>
                <span className="text-[10px] font-black text-black/80 dark:text-white/80 uppercase">
                  {user.xp || 0} <span className="text-black/40 dark:text-white/40">XP</span>
                </span>
              </div>
              <Link 
                to="/feed?view=notifications" 
                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors relative"
              >
                <Bell size={20} className="text-black/70 dark:text-white/70" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[22px] h-6 bg-primary text-white text-xs font-black rounded-full flex items-center justify-center px-2 border-2 border-white dark:border-black shadow-lg shadow-primary/20 z-10">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Link>
            </>
          )}
          <Link to="/explore" className="lg:hidden p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors">
            <Search size={20} className="text-black/70 dark:text-white/70" />
          </Link>
          
          {user ? (
            <div className="flex items-center gap-4">
              <div className="group relative">
                <button className="w-10 h-10 rounded-full border border-black/10 dark:border-white/20 overflow-hidden relative">
                  <img 
                    src={(user.profileImage && user.profileImage.trim() !== '') ? user.profileImage : (user.photoURL && user.photoURL.trim() !== '') ? user.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                    alt="Profile"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-[#0A0A0A] border border-black/10 dark:border-white/10 rounded-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-2xl z-[100]">
                  <Link to="/profile" className="flex items-center gap-2 px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold uppercase tracking-tight text-black dark:text-white/70">
                    <UserIcon size={14} /> My Profile
                  </Link>
                  <Link to="/settings" className="flex items-center gap-2 px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold uppercase tracking-tight text-black dark:text-white/70">
                    <Settings size={14} /> Protocol Settings
                  </Link>
                  <div className="h-px bg-black/5 dark:bg-white/5 my-1 mx-2" />
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold uppercase tracking-tight text-red-500"
                  >
                    <LogOut size={14} /> Terminate Protocol
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Link 
              to="/feed"
              className="flex items-center gap-2 bg-primary text-white px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] transition-all"
            >
              <LogIn size={18} />
              <span>Launch Protocol</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
