import { useState, useEffect, useMemo } from 'react';
import { Users, Globe, Lock, ArrowRight, Info, DollarSign, MessageSquare, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import CommunityDetailsModal from './CommunityDetailsModal';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import VerifiedBadge from './VerifiedBadge';

export default function CommunityCard({ community, isMember, onClick }: { community: any, isMember?: boolean, onClick: () => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);

  useEffect(() => {
    if (!community.creatorId) return;
    const fetchCreator = async () => {
      try {
        const creatorDoc = await getDoc(doc(db, 'users', community.creatorId));
        if (creatorDoc.exists()) {
          setCreatorProfile(creatorDoc.data());
        }
      } catch (err) {
        console.error("Error fetching community creator:", err);
      }
    };
    fetchCreator();
  }, [community.creatorId]);

  useEffect(() => {
    if (!auth.currentUser || !community.id) return;

    // Listen to unread notifications for this community
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', auth.currentUser.uid),
      where('relatedId', '==', community.id),
      where('type', '==', 'message'),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubscribe();
  }, [community.id]);

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-[32px] overflow-hidden border border-foreground/5 hover:border-primary/30 transition-all group cursor-pointer"
        onClick={onClick}
      >
        <div className="h-24 relative">
          <img 
            src={(community.backdrop && community.backdrop.trim() !== '') ? community.backdrop : `https://picsum.photos/seed/${community.id}_bg/800/200`} 
            alt="Backdrop" 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute top-3 right-3 flex gap-1.5">
            {isMember && (
              <div className="bg-gradient-to-r from-teal-500 to-cyan-500 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-lg shadow-teal-500/30 flex items-center gap-1">
                <ShieldCheck size={12} className="text-white" />
                <span className="text-xs font-black text-white">MEMBER</span>
              </div>
            )}
            {community.isPaid ? (
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-lg shadow-amber-500/30 flex items-center gap-1">
                <DollarSign size={12} className="text-white" />
                <span className="text-xs font-bold text-white">${community.price}</span>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-emerald-500 to-green-500 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-lg shadow-emerald-500/30 flex items-center gap-1">
                <span className="text-xs font-bold text-white">FREE</span>
              </div>
            )}
            {community.isPrivate ? (
              <div className="bg-gradient-to-r from-slate-600 to-gray-600 backdrop-blur-md p-1.5 rounded-lg shadow-lg shadow-slate-600/30">
                <Lock size={14} className="text-white" />
              </div>
            ) : (
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 backdrop-blur-md p-1.5 rounded-lg shadow-lg shadow-blue-500/30">
                <Globe size={14} className="text-white" />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 -mt-8 relative z-10">
          <div className="flex items-end justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-background border-2 border-foreground/10 overflow-hidden shadow-xl">
              <img 
                src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/200/200`} 
                alt={community.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            {unreadCount > 0 && (
              <div className="bg-primary text-primary-foreground px-2.5 py-1 rounded-lg text-xs font-bold neon-glow flex items-center gap-1.5 mb-1">
                <MessageSquare size={14} />
                {unreadCount}
              </div>
            )}
          </div>
          
          <h3 className="text-xl font-bold mb-0.5 group-hover:text-primary transition-colors truncate">{community.name}</h3>
          {creatorProfile && (
            <p className="text-sm text-foreground/40 mb-2 truncate flex items-center gap-1.5 flex-wrap">
              <span>by</span>
              <span className="text-foreground/70 font-bold">{creatorProfile.displayName || creatorProfile.username}</span>
              <VerifiedBadge verified={creatorProfile.verified} />
              <span className="opacity-50">@{creatorProfile.username}</span>
            </p>
          )}
          <p className="text-sm text-foreground/50 line-clamp-2 mb-4 h-10 leading-relaxed">
            {community.description || "A community for developers to share and learn."}
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-foreground/5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-foreground/40 font-medium">
                <Users size={16} />
                <span>{community.memberCount || 0} members</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowDetails(true); }}
                className="p-1.5 bg-foreground/5 hover:bg-foreground/10 rounded-lg transition-all text-foreground/50"
                title="View Details"
              >
                <Info size={16} />
              </button>
              <div className="p-1.5 bg-primary/10 text-primary rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                <ArrowRight size={16} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <CommunityDetailsModal 
        isOpen={showDetails} 
        onClose={() => setShowDetails(false)} 
        communityId={community.id}
      />
    </>
  );
}
