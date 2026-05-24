import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, TrendingUp, Award, Users, Bell, MessageSquare, Calendar, FileText } from 'lucide-react';
import { collection, onSnapshot, query, where, collectionGroup, getDoc, doc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';

interface SidebarProps {
  activeType?: string;
}

export default function Sidebar({ activeType }: SidebarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [totalUnreadMessages, setTotalUnreadMessages] = useState(0);
  const [totalUnreadNotifications, setTotalUnreadNotifications] = useState(0);
  const [totalUnreadDMs, setTotalUnreadDMs] = useState(0);
  const [joinedCommunities, setJoinedCommunities] = useState<any[]>([]);
  const [communityUnreads, setCommunityUnreads] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch communities the user is a member of
    const qMembers = query(
      collectionGroup(db, 'members'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribeMembers = onSnapshot(qMembers, async (snapshot) => {
      const communityIds = snapshot.docs.map(d => d.ref.parent.parent!.id);
      
      // Fetch full community data for these IDs
      const communitiesData = await Promise.all(
        communityIds.map(async (id) => {
          const d = await getDoc(doc(db, 'communities', id));
          return d.exists() ? { id: d.id, ...d.data() } : null;
        })
      );
      
      setJoinedCommunities(communitiesData.filter(c => c !== null));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'members');
    });

    // Listen to all unread notifications for the user
    const qNotifs = query(
      collection(db, 'notifications'),
      where('recipientId', '==', auth.currentUser?.uid),
      where('read', '==', false)
    );

    const unsubscribeNotifs = onSnapshot(qNotifs, (notifSnap) => {
      let msgCount = 0;
      let otherCount = 0;
      const unreads: Record<string, number> = {};

      notifSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === 'message') {
          msgCount++;
          if (data.relatedId) {
            unreads[data.relatedId] = (unreads[data.relatedId] || 0) + 1;
          }
        } else {
          otherCount++;
        }
      });

      setTotalUnreadMessages(msgCount);
      setTotalUnreadNotifications(otherCount);
      setCommunityUnreads(unreads);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    });

    // Listen to conversations for DM unread counts
    const qConvs = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', auth.currentUser.uid)
    );

    const unsubscribeConvs = onSnapshot(qConvs, (snapshot) => {
      let dmCount = 0;
      snapshot.docs.forEach(d => {
        const data = d.data();
        const count = data.unreadCount?.[auth.currentUser!.uid] || 0;
        dmCount += count;
      });
      setTotalUnreadDMs(dmCount);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'conversations');
    });

    return () => {
      unsubscribeMembers();
      unsubscribeNotifs();
      unsubscribeConvs();
    };
  }, []);

  const isActive = (type: string) => activeType === type;

  const NavLink = ({ to, icon: Icon, label, active, badgeCount }: { to: string, icon: any, label: string, active: boolean, badgeCount?: number }) => (
    <Link 
      to={to}
      className={`relative group w-full flex items-center justify-center p-3 rounded-xl transition-all ${active ? 'bg-primary text-white neon-glow' : 'hover:bg-white/5 text-white/50'}`}
    >
      <Icon size={20} className="shrink-0 !text-white" /> 
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-primary text-white text-[8px] font-bold border-2 border-[#121212] neon-glow">
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
      {/* Tooltip */}
      <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#121212] border border-white/10 rounded-xl text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[9999] shadow-2xl">
        {label}
      </div>
    </Link>
  );

  return (
    <aside className="hidden lg:block w-16 shrink-0 pt-6 sticky top-6 h-fit">
      <div className="glass rounded-3xl p-2 flex flex-col">
        <nav className="space-y-2">
          <NavLink to="/feed" icon={Clock} label="Latest" active={isActive('new')} />
          <NavLink to="/articles" icon={FileText} label="Articles" active={isActive('articles')} />
          <NavLink to="/challenges" icon={Award} label="Challenges" active={isActive('challenges')} />
          <NavLink to="/events" icon={Calendar} label="Events" active={isActive('events')} />
          <NavLink to="/feed?view=communities" icon={Users} label="Communities" active={activeType === 'communities' || activeType === 'community'} badgeCount={totalUnreadMessages} />
          <NavLink to="/feed?view=notifications" icon={Bell} label="Notifications" active={isActive('notifications')} badgeCount={totalUnreadNotifications} />
          <NavLink to="/feed?view=messages" icon={MessageSquare} label="Direct Messages" active={isActive('messages')} badgeCount={totalUnreadDMs} />

          <div className="pt-4 mt-4 border-t border-white/10 space-y-3">
            {joinedCommunities.map(community => (
              <Link
                key={community.id}
                to={`/feed?view=community&id=${community.id}`}
                className={`relative group flex justify-center transition-all ${searchParams.get('id') === community.id ? 'scale-110' : 'hover:scale-105'}`}
              >
                <div className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all ${searchParams.get('id') === community.id ? 'border-primary shadow-[0_0_15px_rgba(0,242,255,0.3)]' : 'border-white/10 group-hover:border-white/30'}`}>
                  <img 
                    src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/100/100`} 
                    alt={community.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                {communityUnreads[community.id] > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#121212] neon-glow">
                    {communityUnreads[community.id]}
                  </div>
                )}
                
                {/* Tooltip */}
                <div className="absolute left-full ml-4 px-3 py-1.5 bg-[#121212] border border-white/10 rounded-xl text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[9999] shadow-2xl">
                  {community.name}
                </div>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}
