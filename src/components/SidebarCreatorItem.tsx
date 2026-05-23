import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Zap, UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import VerifiedBadge from './VerifiedBadge';

interface SidebarCreatorItemProps {
  creator: any;
}

export default function SidebarCreatorItem({ creator }: SidebarCreatorItemProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.currentUser && creator.id && auth.currentUser.uid !== creator.id) {
      const followRef = doc(db, 'users', auth.currentUser.uid, 'following', creator.id);
      getDoc(followRef).then(docSnap => setIsFollowing(docSnap.exists()));
    }
  }, [creator.id, auth.currentUser]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!auth.currentUser) {
      toast.error('Please sign in to follow creators');
      return;
    }

    if (auth.currentUser.uid === creator.id) return;

    setLoading(true);
    const myFollowRef = doc(db, 'users', auth.currentUser.uid, 'following', creator.id);
    const theirFollowerRef = doc(db, 'users', creator.id, 'followers', auth.currentUser.uid);

    try {
      if (isFollowing) {
        await deleteDoc(myFollowRef);
        await deleteDoc(theirFollowerRef);
        toast.success(`Unfollowed ${creator.displayName || creator.username}`);
      } else {
        await setDoc(myFollowRef, { 
          createdAt: serverTimestamp(),
          displayName: creator.displayName || creator.username,
          photoURL: creator.profileImage || creator.photoURL || ''
        });
        await setDoc(theirFollowerRef, { 
          createdAt: serverTimestamp(),
          displayName: auth.currentUser.displayName || 'Anonymous',
          photoURL: auth.currentUser.photoURL || ''
        });
        toast.success(`Following ${creator.displayName || creator.username}`);
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Follow error:', error);
      toast.error('Failed to update follow status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 p-2 transition-colors group rounded-xl">
      <Link to={`/creators/${creator.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 bg-black/10 dark:bg-white/10 overflow-hidden border border-black/10 dark:border-white/10 rounded-full shrink-0">
          <img 
            src={(creator.profileImage && creator.profileImage.trim() !== '') ? creator.profileImage : (creator.photoURL && creator.photoURL.trim() !== '' ? creator.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${creator.id}`)} 
            alt={creator.displayName} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold truncate text-black dark:text-white group-hover:text-primary transition-colors flex items-center gap-1">
            <span>{creator.displayName || 'Creator'}</span>
            <VerifiedBadge verified={creator.verified} />
          </p>
          <p className="text-[13px] text-black/50 dark:text-white/50 flex items-center gap-1 font-medium">
            <Zap size={10} className="text-yellow-400" />
            <span className="text-yellow-400 font-bold">{creator.xp || 0} XP</span>
          </p>
        </div>
      </Link>
      
      {auth.currentUser && auth.currentUser.uid !== creator.id && (
        <button
          onClick={handleFollow}
          disabled={loading}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm cursor-pointer hover:scale-110 active:scale-95 ${
            isFollowing 
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/10' 
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-500/15 hover:from-purple-500 hover:to-indigo-500'
          }`}
          title={isFollowing ? "Unfollow" : "Follow"}
        >
          {isFollowing ? <UserMinus size={14} className="text-white" /> : <UserPlus size={14} className="text-white" />}
        </button>
      )}
    </div>
  );
}
