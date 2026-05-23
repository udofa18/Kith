import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, UserPlus, UserMinus, Shield, ShieldCheck, Users, Info } from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove, getDoc, onSnapshot, limit, addDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

interface CoHostManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  hostId: string;
}

export default function CoHostManagementModal({ isOpen, onClose, eventId, hostId }: CoHostManagementModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [coHosts, setCoHosts] = useState<any[]>([]);
  const [validIds, setValidIds] = useState<Set<string>>(new Set());

  // Fetch current co-hosts and valid candidates (mutual followers/following)
  useEffect(() => {
    if (!isOpen || !eventId || !hostId) return;

    // Listen to event to get current co-hosts
    const unsubEvent = onSnapshot(doc(db, 'events', eventId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const ids = data.coHostIds || [];
        
        // Fetch co-host profile info
        const profiles = await Promise.all(
          ids.map(async (id: string) => {
            const userSnap = await getDoc(doc(db, 'users', id));
            return { id: userSnap.id, ...userSnap.data() };
          })
        );
        setCoHosts(profiles);
      }
    });

    // Fetch valid candidates (followers/following)
    const fetchValidCandidates = async () => {
      try {
        const followersSnap = await getDocs(collection(db, 'users', hostId, 'followers'));
        const followingSnap = await getDocs(collection(db, 'users', hostId, 'following'));
        
        const ids = new Set<string>();
        followersSnap.docs.forEach(d => ids.add(d.id));
        followingSnap.docs.forEach(d => ids.add(d.id));
        setValidIds(ids);
      } catch (error) {
        console.error("Error fetching candidates:", error);
      }
    };

    fetchValidCandidates();
    return () => unsubEvent();
  }, [isOpen, eventId, hostId]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      // Search users by username (case-sensitive unfortunately in Firestore without complex logic)
      // We'll search for exact username or use name if possible
      const q = query(
        collection(db, 'users'),
        where('username', '>=', searchTerm),
        where('username', '<=', searchTerm + '\uf8ff'),
        limit(20)
      );
      
      const snap = await getDocs(q);
      const allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter by mutual connections
      const filtered = allMatches.filter(u => validIds.has(u.id) && u.id !== hostId);
      setResults(filtered);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const toggleCoHost = async (userId: string, isCurrentlyCoHost: boolean) => {
    try {
      const eventRef = doc(db, 'events', eventId);
      if (isCurrentlyCoHost) {
        await updateDoc(eventRef, {
          coHostIds: arrayRemove(userId)
        });
        toast.success('Co-host removed');
      } else {
        await updateDoc(eventRef, {
          coHostIds: arrayUnion(userId)
        });
        toast.success('Co-host added');
        
        // Notify the user
        await addDoc(collection(db, 'notifications'), {
          recipientId: userId,
          type: 'event_invite',
          category: 'events',
          content: `You have been added as a co-host for an event.`,
          relatedId: eventId,
          senderId: auth.currentUser?.uid,
          read: false,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-md bg-background border border-foreground/10 rounded-[32px] overflow-hidden shadow-2xl"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <ShieldCheck size={24} />
              </div>
              <h2 className="text-xl font-bold text-foreground">Manage Co-hosts</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-foreground/5 rounded-full transition-colors text-foreground">
              <X size={20} />
            </button>
          </div>

          <p className="text-xs text-foreground/40 mb-6">
            Co-hosts can manage participants, start sessions, and end live streams. They must be your followers or people you follow.
          </p>

          {/* Current Co-hosts */}
          <div className="space-y-4 mb-8">
            <h3 className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest px-1">Active Co-hosts</h3>
            <div className="space-y-2">
              {coHosts.length > 0 ? coHosts.map(ch => (
                <div key={ch.id} className="flex items-center justify-between p-3 rounded-2xl bg-foreground/5 border border-foreground/5 group">
                  <div className="flex items-center gap-3">
                    {ch.profileImage ? (
                      <img src={ch.profileImage} className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Users size={20} />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-foreground">{ch.username}</p>
                      <p className="text-[10px] text-foreground/40">Co-host</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => toggleCoHost(ch.id, true)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <UserMinus size={18} />
                  </button>
                </div>
              )) : (
                <div className="text-center py-6 border border-dashed border-foreground/10 rounded-2xl">
                  <p className="text-[10px] text-foreground/20 italic tracking-widest">No co-hosts assigned</p>
                </div>
              )}
            </div>
          </div>

          {/* Search New */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-foreground/30 uppercase tracking-widest px-1">Add New Co-host</h3>
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/30" />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search followers/following..."
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-primary transition-all text-foreground"
              />
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex justify-center py-4">
                   <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : results.length > 0 ? results.map(user => {
                const isCoHost = coHosts.some(ch => ch.id === user.id);
                if (isCoHost) return null;

                return (
                  <div key={user.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-foreground/5 transition-all">
                    <div className="flex items-center gap-3">
                      {user.profileImage ? (
                        <img src={user.profileImage} className="w-8 h-8 rounded-lg object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <Users size={16} />
                        </div>
                      )}
                      <span className="text-sm font-bold text-foreground">{user.username}</span>
                    </div>
                    <button 
                      onClick={() => toggleCoHost(user.id, false)}
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                      <UserPlus size={18} />
                    </button>
                  </div>
                );
              }) : searchTerm && !loading && (
                <p className="text-center py-4 text-xs text-foreground/30">No eligible users found</p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
