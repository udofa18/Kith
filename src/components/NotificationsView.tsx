import { useState, useEffect, useMemo } from 'react';
import { auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { notificationsRepository } from '../services/db/notificationsRepository';
import { usersRepository } from '../services/db/usersRepository';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Heart, MessageSquare, AtSign, Zap, Trophy, Trash2, 
  CheckCircle, ExternalLink, Filter, Settings, ShoppingBag, 
  Calendar, CreditCard, Info, Star, ArrowUpRight, Clock, Users,
  Check
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface Actor {
  id: string;
  name: string;
  photo: string;
}

interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  type: 'like' | 'comment' | 'mention' | 'message' | 'xp_gift' | 'challenge' | 'channel_mention' | 'purchase' | 'payout' | 'event_invite' | 'event_reminder' | 'system' | 'wallet' | 'community';
  category: 'social' | 'community' | 'marketplace' | 'events' | 'earnings' | 'system';
  priority: 'low' | 'normal' | 'high';
  content: string;
  relatedId: string;
  channelId?: string;
  read: boolean;
  createdAt: any;
  actors?: Actor[];
  mergedCount?: number;
}

type TabCategory = 'All' | 'Social' | 'Community' | 'Marketplace' | 'Events' | 'Earnings' | 'System';

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabCategory>('All');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [communityImages, setCommunityImages] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch user profile for summary card
    usersRepository.getById(auth.currentUser.uid).then((profile) => {
      if (profile) setUserProfile(profile);
    });

    const unsubscribe = notificationsRepository.subscribe(
      auth.currentUser.uid,
      (data) => {
        setNotifications(data as Notification[]);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchImages = async () => {
      const communityIds = Array.from(new Set(
        notifications
          .filter(n => isCommunityNotif(n))
          .map(n => n.relatedId)
          .filter(id => id && !communityImages[id])
      ));

      if (communityIds.length === 0) return;

      const newImages: Record<string, string> = { ...communityImages };
      let updated = false;

      await Promise.all(communityIds.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, 'communities', id));
          if (snap.exists()) {
            const data = snap.data();
            if (data.image) {
              newImages[id] = data.image;
              updated = true;
            }
          }
        } catch (err) {
          console.error("Error fetching community image:", err);
        }
      }));

      if (updated) {
        setCommunityImages(newImages);
      }
    };

    fetchImages();
  }, [notifications, communityImages]);

  // Merging Logic
  const mergedNotifications = useMemo(() => {
    const merged: Notification[] = [];
    const groups: Record<string, Notification[]> = {};

    notifications.forEach(notif => {
      // Keys to merge: same type, same relatedId, same day
      const dateKey = notif.createdAt ? 
        (notif.createdAt.toDate ? notif.createdAt.toDate().toDateString() : new Date(notif.createdAt).toDateString()) 
        : 'unknown';
      
      // We merge likes, comments, and xp gifts by context
      // We merge messages by sender + channel + day
      let mergeKey = notif.id;
      const canMergeContext = ['like', 'comment', 'xp_gift', 'purchase'].includes(notif.type);
      const isMessage = notif.type === 'message' || notif.type === 'channel_mention';

      if (canMergeContext) {
        mergeKey = `${notif.type}-${notif.relatedId}-${dateKey}`;
      } else if (isMessage) {
        mergeKey = `msg-${notif.senderId}-${notif.relatedId}-${dateKey}`;
      }

      if (!groups[mergeKey]) groups[mergeKey] = [];
      groups[mergeKey].push(notif);
    });

    Object.values(groups).forEach(group => {
      if (group.length > 1) {
        const first = group[0];
        const actors = group.map(n => ({ id: n.senderId, name: n.senderName, photo: n.senderPhoto || '' }));
        // Remove duplicates from actors
        const uniqueActors = Array.from(new Set(actors.map(a => a.id)))
          .map(id => actors.find(a => a.id === id)!);

        // Construct dynamic merged text
        let finalContent = first.content;
        
        if (['like', 'comment', 'xp_gift', 'purchase'].includes(first.type)) {
          const mainActors = uniqueActors.slice(0, 2).map(a => a.name);
          const othersCount = uniqueActors.length > 2 ? (uniqueActors.length - 2) : 0;
          
          let actorText = mainActors.join(', ');
          if (othersCount > 0) actorText += ` and ${othersCount} others`;
          
          // Remove the original sender name from the content if it's at the start
          const contentWithoutName = first.content.startsWith(first.senderName) 
            ? first.content.substring(first.senderName.length).trim() 
            : first.content;
            
          finalContent = `${actorText} ${contentWithoutName}`;
        } else if (first.type === 'message' || first.type === 'channel_mention') {
          const msgWord = group.length === 1 ? 'message' : 'messages';
          const isMention = group.some(n => n.type === 'channel_mention');
          
          if (first.content.includes('in #')) {
            // Community message
            const channelParts = first.content.split('in');
            const contextText = channelParts.length > 1 ? channelParts[1].trim() : 'a channel';
            
            if (group.length > 1) {
              finalContent = `${isMention ? 'mentioned you and ' : ''}sent ${group.length} ${msgWord} in ${contextText}`;
            } else {
              // Preserve original content for single notifications but maybe capitalize
              finalContent = first.content;
            }
          } else {
            // Direct Message
            if (group.length > 1) {
              finalContent = `sent you ${group.length} ${msgWord} in DMs`;
            } else {
              finalContent = `sent you a direct message`;
            }
          }
        }

        merged.push({
          ...first,
          content: finalContent,
          actors: uniqueActors,
          mergedCount: group.length,
          id: group.map(n => n.id).join(','), // Combined ID for easy reference/marking read
          read: group.every(n => n.read)
        });
      } else {
        merged.push(group[0]);
      }
    });

    // Re-sort by creation date
    return merged.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [notifications]);

  // Color themes based on category or type
  const getCategoryTheme = (category: string) => {
    const themes: { [key: string]: { color: string; bg: string; border: string; icon: string; glow: string } } = {
      social: { 
        color: 'text-rose-400', 
        bg: 'bg-rose-500/10', 
        border: 'border-rose-500/20', 
        icon: 'bg-rose-500',
        glow: 'shadow-[0_0_15px_rgba(244,63,94,0.3)]'
      },
      community: { 
        color: 'text-sky-400', 
        bg: 'bg-sky-500/10', 
        border: 'border-sky-500/20', 
        icon: 'bg-sky-500',
        glow: 'shadow-[0_0_15px_rgba(14,165,233,0.3)]'
      },
      marketplace: { 
        color: 'text-orange-400', 
        bg: 'bg-orange-500/10', 
        border: 'border-orange-500/20', 
        icon: 'bg-orange-500',
        glow: 'shadow-[0_0_15px_rgba(249,115,22,0.3)]'
      },
      earnings: { 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-500/10', 
        border: 'border-emerald-500/20', 
        icon: 'bg-emerald-500',
        glow: 'shadow-[0_0_15px_rgba(16,185,129,0.3)]'
      },
      events: { 
        color: 'text-violet-400', 
        bg: 'bg-violet-500/10', 
        border: 'border-violet-500/20', 
        icon: 'bg-violet-500',
        glow: 'shadow-[0_0_15px_rgba(139,92,246,0.3)]'
      },
      system: { 
        color: 'text-zinc-400', 
        bg: 'bg-zinc-500/10', 
        border: 'border-zinc-500/20', 
        icon: 'bg-zinc-500',
        glow: 'shadow-[0_0_15px_rgba(113,113,122,0.3)]'
      },
    };
    return themes[category.toLowerCase()] || themes.system;
  };

  // Helper to determine if it's a community-type notification
  const isCommunityNotif = (notif: Notification) => {
    // If it has a channelId, it's definitely community
    if (notif.channelId) return true;
    // If it's a mention in a channel
    if (notif.type === 'channel_mention') return true;
    // Fallback for notifications: messages that explicitly have community structure
    if (notif.type === 'message' && (notif.content.includes('in #') || notif.content.toLowerCase().includes('community'))) return true;
    // If we have its relatedId in communityImages, it's a community notif
    if (notif.relatedId && communityImages[notif.relatedId]) return true;
    return false;
  };

  // Filtering Logic
  const filteredNotifications = useMemo(() => {
    const getCategory = (notif: Notification) => {
      if (notif.category) return notif.category;
      const type = notif.type;
      
      const isCommunity = isCommunityNotif(notif);

      if (['like', 'comment', 'mention'].includes(type)) return 'social';
      if (type === 'message') return isCommunity ? 'community' : 'social';
      if (['channel_mention', 'challenge'].includes(type)) return 'community';
      if (['purchase'].includes(type)) return 'marketplace';
      if (['payout', 'xp_gift', 'wallet'].includes(type)) return 'earnings';
      if (['event_invite', 'event_reminder'].includes(type)) return 'events';
      return 'system';
    };

    if (activeTab === 'All') {
      return mergedNotifications.map(n => {
        const cat = getCategory(n);
        return { ...n, category: cat as any };
      });
    }
    return mergedNotifications
      .map(n => {
        const cat = getCategory(n);
        return { ...n, category: cat as any };
      })
      .filter(n => n.category.toLowerCase() === activeTab.toLowerCase());
  }, [mergedNotifications, activeTab]);

  // Time Grouping
  const timeGroups = useMemo(() => {
    const groups: Record<string, Notification[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Older': []
    };

    filteredNotifications.forEach(notif => {
      const date = notif.createdAt?.toDate ? notif.createdAt.toDate() : new Date(notif.createdAt);
      if (isToday(date)) groups['Today'].push(notif);
      else if (isYesterday(date)) groups['Yesterday'].push(notif);
      else if (isThisWeek(date)) groups['This Week'].push(notif);
      else groups['Older'].push(notif);
    });

    return groups;
  }, [filteredNotifications]);

  const markAsRead = async (ids: string) => {
    const idArray = ids.split(',');
    try {
      await Promise.all(idArray.map((id) => notificationsRepository.markRead(id)));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    await notificationsRepository.markAllRead(
      auth.currentUser!.uid,
      unread.map(n => n.id)
    );
  };

  const deleteNotifications = async (ids: string) => {
    const idArray = ids.split(',');
    try {
      await Promise.all(idArray.map((id) => notificationsRepository.deleteNotification(id)));
    } catch (error) {
      console.error("Error deleting:", error);
    }
  };

  const getIcon = (type: string, priority: string) => {
    const size = 18;
    switch (type) {
      case 'like': return <Heart className="text-red-500" size={size} />;
      case 'comment': return <MessageSquare className="text-blue-500" size={size} />;
      case 'mention':
      case 'channel_mention': return <AtSign className="text-purple-500" size={size} />;
      case 'message': return <MessageSquare className="text-green-500" size={size} />;
      case 'xp_gift': return <Zap className="text-yellow-500" size={size} />;
      case 'challenge': return <Trophy className="text-orange-500" size={size} />;
      case 'purchase': return <ShoppingBag className="text-emerald-500" size={size} />;
      case 'payout': return <CreditCard className="text-cyan-500" size={size} />;
      case 'event_invite':
      case 'event_reminder': return <Calendar className="text-pink-500" size={size} />;
      case 'wallet': return <CreditCard className="text-indigo-500" size={size} />;
      case 'system': return <Info className="text-slate-400" size={size} />;
      case 'community': return <Users className="text-sky-500" size={size} />;
      default: return <Bell className="text-primary" size={size} />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    const isCommunity = isCommunityNotif(notification);

    switch (notification.type) {
      case 'like':
      case 'comment':
      case 'mention':
        if (notification.relatedId) navigate(`/post/${notification.relatedId}`);
        break;
      case 'channel_mention':
      case 'message':
        if (isCommunity) {
          if (notification.channelId && notification.relatedId) {
            // relatedId is communityId, channelId is the specific channel
            navigate(`/feed?view=community&id=${notification.relatedId}&channelId=${notification.channelId}`);
          } else if (notification.relatedId) {
            navigate(`/feed?view=community&id=${notification.relatedId}`);
          }
        } else if (notification.senderId) {
          // Direct Message
          navigate(`/feed?view=messages&userId=${notification.senderId}`);
        }
        break;
      case 'community':
        if (notification.relatedId) {
          // Navigate to community settings membership tab
          navigate(`/feed?view=community&id=${notification.relatedId}&settings=members`);
        }
        break;
      case 'challenge':
        if (notification.relatedId) {
          navigate(`/challenges/${notification.relatedId}`);
        } else {
          navigate('/challenges');
        }
        break;
      case 'xp_gift':
        navigate('/dashboard');
        break;
      case 'purchase':
      case 'payout':
        navigate('/marketplace');
        break;
      case 'event_invite':
      case 'event_reminder':
        if (notification.relatedId) {
          navigate(`/events/${notification.relatedId}`);
        } else {
          navigate('/events');
        }
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 pb-20 p-2 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/10">
              <Bell size={28} />
            </div>
            Notifications
          </h1>
          <p className="text-white/40 mt-1 ml-15">Stay updated with your community activities</p>
        </div>
        <div className="flex items-center gap-3 ml-15 md:ml-0">
          <button 
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm transition-all"
          >
            <Check size={16} /> Mark all read
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm transition-all">
            <Settings size={16} /> Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 w-full">
        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
            {['All', 'Social', 'Community', 'Marketplace', 'Events', 'Earnings', 'System'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as TabCategory)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all border whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-primary text-white border-primary' 
                    : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="space-y-8">
            {Object.entries(timeGroups).map(([groupName, groupNotifs]) => (
              groupNotifs.length > 0 && (
                <div key={groupName} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 whitespace-nowrap">{groupName}</h3>
                    <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  
                  <div className="space-y-3">
                    <AnimatePresence initial={false}>
                      {groupNotifs.map((notification) => {
                          const theme = getCategoryTheme((notification as any).category || 'system');
                          const isCommunity = isCommunityNotif(notification);
                          const communityImg = notification.relatedId ? communityImages[notification.relatedId] : null;

                          return (
                              <motion.div
                                key={notification.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                className={`group relative p-3 rounded-2xl transition-all cursor-pointer ${
                                  !notification.read 
                                    ? `bg-primary/5 border border-primary/10` 
                                    : 'border border-transparent hover:border-white/5'
                                }`}
                                onClick={() => handleNotificationClick(notification)}
                              >
                              <div className="flex gap-4">
                                {/* Avatars */}
                                <div className="relative flex-shrink-0">
                                  {notification.actors && notification.actors.length > 1 && !['message', 'channel_mention'].includes(notification.type) ? (
                                    <div className="flex -space-x-3">
                                      {notification.actors.slice(0, 3).map((actor, i) => (
                                        <div key={actor.id} className="w-10 h-10 rounded-full border-2 border-background overflow-hidden relative" style={{ zIndex: 10 - i }}>
                                          <img src={(actor.photo && actor.photo.trim() !== '') ? actor.photo : `https://api.dicebear.com/7.x/avataaars/svg?seed=${actor.id}`} alt={actor.name} className="w-full h-full object-cover" />
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className={`w-11 h-11 ${isCommunity ? 'rounded-xl' : 'rounded-full'} overflow-hidden`}>
                                      <img 
                                        src={isCommunity && (communityImg && communityImg.trim() !== '')
                                          ? communityImg 
                                          : (notification.senderPhoto && notification.senderPhoto.trim() !== '') 
                                            ? notification.senderPhoto 
                                            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${notification.senderId}`} 
                                        alt="Sender" 
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-300"
                                      />
                                    </div>
                                  )}
                                  <div className="absolute -bottom-1 -right-1 flex items-center justify-center">
                                    {getIcon(notification.type, notification.priority)}
                                  </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 pt-0.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[15px] text-white/90 leading-tight">
                                        {notification.actors && notification.actors.length > 1 && !['message', 'channel_mention'].includes(notification.type) ? (
                                          <span>{notification.content}</span>
                                        ) : (
                                          <>
                                            <span className="font-bold text-white tracking-tight">{notification.senderName}</span> {notification.content}
                                          </>
                                        )}
                                      </p>
                                      <div className="flex items-center gap-2 mt-1.5">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.color}`}>
                                          {notification.category || 'System'}
                                        </span>
                                        <span className="text-white/10">•</span>
                                        <p className="text-[11px] text-white/40 flex items-center gap-2">
                                          {(() => {
                                            if (!notification.createdAt) return '';
                                            try {
                                              const d = notification.createdAt.toDate ? notification.createdAt.toDate() : new Date(notification.createdAt);
                                              if (!(d instanceof Date) || isNaN(d.getTime())) return '';
                                              return formatDistanceToNow(d, { addSuffix: true });
                                            } catch (e) {
                                              return '';
                                            }
                                          })()}
                                          {notification.priority === 'high' && (
                                            <span className={`flex items-center gap-1 ${theme.color} animate-pulse`}>
                                              <Star size={10} fill="currentColor" /> Priority
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {!notification.read && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            markAsRead(notification.id);
                                          }}
                                          className="p-1.5 rounded-lg text-white/20 hover:text-primary transition-all"
                                        >
                                          <Check size={16} />
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteNotifications(notification.id);
                                        }}
                                        className="p-1.5 rounded-lg text-white/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Action indicator removed for simpler UI */}
                                </div>
                              </div>

                              {!notification.read && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_10px_rgba(124,58,237,1)]" />
                              )}
                            </motion.div>
                      );
                    })}
                    </AnimatePresence>
                  </div>
                </div>
              )
            ))}

            {filteredNotifications.length === 0 && (
              <div className="py-20 text-center glass rounded-3xl border border-white/5">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                  <Bell className="text-white/20" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Clean Slate!</h3>
                <p className="text-white/30 max-w-xs mx-auto">You're all caught up. No notifications found in the {activeTab} category.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar / Summary */}
        <div className="space-y-6">
          <DailySummaryCard userProfile={userProfile} notifications={notifications} />
          
          <div className="glass p-6 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <CheckCircle className="text-primary" size={18} /> Quick Actions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={markAllAsRead}
                className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-bold transition-all text-left flex items-center justify-between group"
              >
                Mark all as read
                <Check size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-xs font-bold transition-all text-left flex items-center justify-between group">
                Mute Social Alerts
                <div className="w-8 h-4 rounded-full bg-white/10 relative">
                  <div className="absolute left-1 top-1 w-2 h-2 rounded-full bg-white/30" />
                </div>
              </button>
            </div>
          </div>

          <div className="glass p-6 rounded-3xl border border-white/5 bg-gradient-to-br from-primary/10 to-transparent">
            <h3 className="text-lg font-bold">Pro Developer</h3>
            <p className="text-xs text-white/50 mt-1">Upgrade your plan to unlock advanced notification filters and priority support.</p>
            <button className="w-full mt-4 py-3 rounded-2xl bg-primary text-black text-xs font-bold hover:scale-[1.02] transition-all">
              Elevate to Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DailySummaryCard({ userProfile, notifications }: { userProfile: any, notifications: Notification[] }) {
  const stats = useMemo(() => {
    const today = notifications.filter(n => isToday(n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt)));
    
    return {
      xpGain: today.filter(n => n.type === 'xp_gift').length * 20, // Simplified calculation
      comments: today.filter(n => n.type === 'comment').length,
      likes: today.filter(n => n.type === 'like').length,
      sales: today.filter(n => n.type === 'purchase').length
    };
  }, [notifications]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full" />
      
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 overflow-hidden bg-primary/5">
          <img 
            src={(userProfile?.profileImage && userProfile.profileImage.trim() !== '') 
              ? userProfile.profileImage 
              : ((auth.currentUser?.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`)} 
            className="w-full h-full object-cover" 
            alt="Profile" 
          />
        </div>
        <div>
          <h3 className="text-sm font-bold">Daily Pulse</h3>
          <p className="text-[10px] text-white/40">Today's Activity Highlights</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={12} className="text-yellow-400" />
            <span className="text-[10px] font-bold text-white/40 uppercase">XP Gained</span>
          </div>
          <p className="text-xl font-bold">+{stats.xpGain}</p>
        </div>
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={12} className="text-blue-400" />
            <span className="text-[10px] font-bold text-white/40 uppercase">Replies</span>
          </div>
          <p className="text-xl font-bold">{stats.comments}</p>
        </div>
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <Heart size={12} className="text-red-400" />
            <span className="text-[10px] font-bold text-white/40 uppercase">Love</span>
          </div>
          <p className="text-xl font-bold">{stats.likes}</p>
        </div>
        <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={12} className="text-emerald-400" />
            <span className="text-[10px] font-bold text-white/40 uppercase">Sales</span>
          </div>
          <p className="text-xl font-bold">{stats.sales}</p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-white/30 uppercase">Weekly Rank</span>
          <span className="text-sm font-bold flex items-center gap-1">Top 2% <ArrowUpRight size={14} className="text-primary" /></span>
        </div>
        <div className="flex -space-x-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="w-8 h-8 rounded-full border-2 border-background bg-zinc-800 flex items-center justify-center">
              <Users size={12} className="text-white/20" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
