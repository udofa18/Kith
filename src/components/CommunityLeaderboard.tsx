import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';
import { Trophy, Medal, Award, Flame, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';
import VerifiedBadge from './VerifiedBadge';

interface LeaderboardProps {
  communityId: string;
}

export default function CommunityLeaderboard({ communityId }: LeaderboardProps) {
  const [topUsers, setTopUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!communityId) return;
    const fetchLeaderboard = async () => {
      try {
        const membersRef = collection(db, 'communities', communityId, 'members');
        const q = query(membersRef, orderBy('xp', 'desc'), limit(50));
        const snap = await getDocs(q);
        
        const userData = await Promise.all(snap.docs.map(async (d) => {
          const userDoc = await getDoc(doc(db, 'users', d.id));
          return {
            id: d.id,
            xp: d.data().xp || 0,
            role: d.data().role,
            user: userDoc.exists() ? userDoc.data() : null
          };
        }));
        
        setTopUsers(userData);
      } catch (error) {
        console.error("Leaderboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [communityId]);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="text-yellow-500" /> Community Hall of Fame
          </h2>
          <p className="text-foreground/40 text-sm">Top contributors and most active members.</p>
        </div>
      </div>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-3 gap-4 items-end pt-8 pb-4">
        {/* 2nd Place */}
        {topUsers[1] && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center group"
          >
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-slate-300 overflow-hidden bg-foreground/10">
                <img src={(topUsers[1].user?.profileImage && topUsers[1].user.profileImage.trim() !== '') ? topUsers[1].user.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${topUsers[1].id}`} alt="" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-slate-300 text-slate-800 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-background">2</div>
            </div>
            <p className="font-bold text-sm truncate w-full text-center flex items-center justify-center gap-1">
              <span>{topUsers[1].user?.displayName || 'Anonymous'}</span>
              <VerifiedBadge verified={topUsers[1].user?.verified} />
            </p>
            <p className="text-xs text-primary font-bold">{topUsers[1].xp.toLocaleString()} XP</p>
            <div className="w-full h-24 bg-slate-300/10 border-t-2 border-slate-300 rounded-t-2xl mt-4 group-hover:bg-slate-300/20 transition-all" />
          </motion.div>
        )}

        {/* 1st Place */}
        {topUsers[0] && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="flex flex-col items-center group -mx-2 z-10"
          >
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-yellow-500 overflow-hidden bg-foreground/10 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                <img src={(topUsers[0].user?.profileImage && topUsers[0].user.profileImage.trim() !== '') ? topUsers[0].user.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${topUsers[0].id}`} alt="" />
              </div>
              <div className="absolute -bottom-3 -right-3 w-10 h-10 bg-yellow-500 text-yellow-950 rounded-full flex items-center justify-center font-black text-sm ring-4 ring-background">1</div>
              <Flame className="absolute -top-4 left-1/2 -translate-x-1/2 text-orange-500 animate-pulse" size={24} />
            </div>
            <p className="font-black text-base truncate w-full text-center flex items-center justify-center gap-1">
              <span>{topUsers[0].user?.displayName || 'Anonymous'}</span>
              <VerifiedBadge verified={topUsers[0].user?.verified} />
            </p>
            <p className="text-sm text-primary font-bold">{topUsers[0].xp.toLocaleString()} XP</p>
            <div className="w-full h-40 bg-yellow-500/10 border-t-4 border-yellow-500 rounded-t-3xl mt-4 group-hover:bg-yellow-500/20 transition-all" />
          </motion.div>
        )}

        {/* 3rd Place */}
        {topUsers[2] && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center group"
          >
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full border-4 border-amber-600 overflow-hidden bg-foreground/10">
                <img src={(topUsers[2].user?.profileImage && topUsers[2].user.profileImage.trim() !== '') ? topUsers[2].user.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${topUsers[2].id}`} alt="" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-amber-600 text-white rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-background">3</div>
            </div>
            <p className="font-bold text-sm truncate w-full text-center flex items-center justify-center gap-1">
              <span>{topUsers[2].user?.displayName || 'Anonymous'}</span>
              <VerifiedBadge verified={topUsers[2].user?.verified} />
            </p>
            <p className="text-xs text-primary font-bold">{topUsers[2].xp.toLocaleString()} XP</p>
            <div className="w-full h-20 bg-amber-600/10 border-t-2 border-amber-600 rounded-t-2xl mt-4 group-hover:bg-amber-600/20 transition-all" />
          </motion.div>
        )}
      </div>

      {/* Remainder of Leaderboard */}
      <div className="glass rounded-3xl overflow-hidden border border-foreground/5 shadow-2xl">
        <table className="w-full">
          <thead>
            <tr className="bg-foreground/5 text-xs font-bold text-foreground/30 uppercase tracking-widest text-left">
              <th className="px-6 py-4">Rank</th>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4 text-right">XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5">
            {topUsers.slice(3).map((user, index) => (
              <tr key={user.id} className="hover:bg-foreground/[0.02] transition-colors group">
                <td className="px-6 py-4 text-sm font-bold text-foreground/40 group-hover:text-foreground">#{index + 4}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 overflow-hidden">
                      <img src={(user.user?.profileImage && user.user.profileImage.trim() !== '') ? user.user.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`} alt="" />
                    </div>
                    <div>
                      <p className="text-sm font-bold flex items-center gap-1">
                        <span>{user.user?.displayName || 'Anonymous'}</span>
                        <VerifiedBadge verified={user.user?.verified} />
                      </p>
                      <p className="text-[10px] text-foreground/40">{user.role}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-mono text-primary font-bold">{user.xp.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
