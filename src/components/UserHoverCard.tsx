import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, onSnapshot, query, setDoc, deleteDoc, addDoc, getDocs, serverTimestamp, increment, updateDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { followUser, unfollowUser } from '../services/socialService';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, UserMinus, MessageSquare, Zap, MapPin, X, Send, Flag } from 'lucide-react';
import ReportModal from './ReportModal';
import VerifiedBadge from './VerifiedBadge';

interface UserHoverCardProps {
  userId: string;
  children: React.ReactNode;
  communityId?: string;
}

export default function UserHoverCard({ userId, children, communityId }: UserHoverCardProps) {
  const navigate = useNavigate();
  const [showCard, setShowCard] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [mutualCount, setMutualCount] = useState(0);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0, bottom: 0 });
  const [verticalPos, setVerticalPos] = useState<'top' | 'bottom'>('bottom');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showCard || !userId) return;

    // Fetch user data
    const unsubscribeUser = onSnapshot(doc(db, 'users', userId), (doc) => {
      if (doc.exists()) {
        setUserData(doc.data());
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    });

    // Fetch followers count
    const unsubscribeFollowers = onSnapshot(collection(db, 'users', userId, 'followers'), (snapshot) => {
      setFollowersCount(snapshot.size);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${userId}/followers`);
    });

    // Check if current user is following
    if (auth.currentUser && auth.currentUser.uid !== userId) {
      const followRef = doc(db, 'users', auth.currentUser.uid, 'following', userId);
      getDoc(followRef).then(doc => setIsFollowing(doc.exists()));

      // Mutual followers: People I follow who also follow this user
      const fetchMutuals = async () => {
        try {
          // Get my following list
          const myFollowingSnap = await getDocs(collection(db, 'users', auth.currentUser!.uid, 'following'));
          const myFollowingIds = myFollowingSnap.docs.map(d => d.id);
          
          if (myFollowingIds.length > 0) {
            // Get target user's followers
            const theirFollowersSnap = await getDocs(collection(db, 'users', userId, 'followers'));
            const theirFollowerIds = theirFollowersSnap.docs.map(d => d.id);
            
            // Intersection
            const mutuals = myFollowingIds.filter(id => theirFollowerIds.includes(id));
            setMutualCount(mutuals.length);
          }
        } catch (e) {
          console.error("Error fetching mutuals:", e);
        }
      };
      fetchMutuals();
    }

    return () => {
      unsubscribeUser();
      unsubscribeFollowers();
    };
  }, [showCard, userId]);

  const handleMouseEnter = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    const timeout = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords({ 
          top: rect.top, 
          left: rect.left, 
          width: rect.width, 
          height: rect.height,
          bottom: rect.bottom
        });

        // Determine if there's more space above or below
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const estimatedHeight = 350; // User card is roughly 350px tall

        if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
          setVerticalPos('top');
        } else {
          setVerticalPos('bottom');
        }
      }
      setShowCard(true);
    }, 400); // Slightly faster hover response
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    const timeout = setTimeout(() => setShowCard(false), 300);
    setHoverTimeout(timeout);
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!auth.currentUser || auth.currentUser.uid === userId) return;
    try {
      await (isFollowing ? unfollowUser : followUser)(auth.currentUser.uid, userId);
      setIsFollowing(!isFollowing);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/following`);
    }
  };

  const handleMessageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/feed?view=messages&userId=${userId}`);
  };

  return (
    <>
      <div 
        ref={triggerRef}
        className="inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      
      {createPortal(
        <AnimatePresence>
          {showCard && (
            <motion.div
              initial={{ opacity: 0, y: verticalPos === 'bottom' ? -10 : 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: verticalPos === 'bottom' ? -10 : 10, scale: 0.95 }}
              style={{
                position: 'fixed',
                ...(verticalPos === 'bottom' 
                  ? { top: coords.top + coords.height + 10 }
                  : { bottom: window.innerHeight - coords.top + 10 }
                ),
                left: Math.max(10, Math.min(window.innerWidth - 300, coords.left + (coords.width / 2) - 144)),
                zIndex: 999999,
              }}
              className="w-72 bg-white dark:bg-[#121212] rounded-3xl p-6 shadow-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl"
              onMouseEnter={() => { if (hoverTimeout) clearTimeout(hoverTimeout); }}
              onMouseLeave={handleMouseLeave}
            >
              {userData ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-black/10 dark:border-white/10 neon-glow">
                      <img 
                        src={(userData.profileImage && userData.profileImage.trim() !== '') ? userData.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} 
                        alt={userData.username} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="bg-yellow-400/10 border border-yellow-400/20 px-3 py-1 rounded-xl flex items-center gap-1">
                      <Zap size={14} className="text-yellow-400" />
                      <span className="text-xs font-bold text-yellow-400">{userData.xp || 0}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-black text-lg text-black dark:text-white uppercase tracking-tighter flex items-center gap-1.5 flex-wrap">
                      <span>{userData.username}</span>
                      <VerifiedBadge verified={userData.verified} />
                    </h4>
                    <p className="text-[10px] text-black/40 dark:text-white/40 flex items-center gap-1 font-bold uppercase tracking-widest">
                      <MapPin size={12} /> {userData.location || 'Member since 2024'}
                    </p>
                  </div>

                  <p className="text-xs text-black/70 dark:text-white/70 line-clamp-2 font-medium">
                    {userData.bio || "No bio yet."}
                  </p>

                  <div className="flex gap-6 pt-2 border-t border-black/5 dark:border-white/5">
                    <div>
                      <div className="text-sm font-black text-black dark:text-white">{followersCount}</div>
                      <div className="text-[8px] text-black/30 dark:text-white/30 font-black uppercase tracking-widest">Followers</div>
                    </div>
                    {auth.currentUser && auth.currentUser.uid !== userId && mutualCount > 0 && (
                      <div>
                        <div className="text-sm font-black text-primary">{mutualCount}</div>
                        <div className="text-[8px] text-black/30 dark:text-white/30 font-black uppercase tracking-widest">Mutual</div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-black text-black dark:text-white">{userData.totalSales || 0}</div>
                      <div className="text-[8px] text-black/30 dark:text-white/30 font-black uppercase tracking-widest">Sales</div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {auth.currentUser?.uid !== userId && (
                      <>
                        <button 
                          onClick={handleFollow}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                            isFollowing ? 'bg-white/10 text-white/50' : 'bg-primary text-white neon-glow'
                          }`}
                        >
                          {isFollowing ? <UserMinus size={14} /> : <UserPlus size={14} />}
                          {isFollowing ? 'Unfollow' : 'Follow'}
                        </button>
                        <button 
                          onClick={handleMessageClick}
                          className="p-2 glass rounded-xl hover:bg-white/10 transition-all text-primary"
                        >
                          <MessageSquare size={18} />
                        </button>
                        {communityId && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsReportModalOpen(true);
                            }}
                            className="p-2 glass rounded-xl hover:bg-red-500/10 transition-all text-red-500"
                            title="Report User"
                          >
                            <Flag size={18} />
                          </button>
                        )}
                      </>
                    )}
                    <Link 
                      to={`/creators/${userId}`}
                      className="flex-1 py-2 glass rounded-xl text-xs font-bold hover:bg-white/10 transition-all text-center"
                    >
                      View Profile
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {communityId && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          communityId={communityId}
          targetId={userId}
          targetType="user"
          contentSnippet={userData?.username || userId}
        />
      )}
    </>
  );
}
