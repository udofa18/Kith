import { useState, useEffect, useMemo } from 'react';
import { auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { notificationsRepository } from '../services/db/notificationsRepository';
import { usersRepository } from '../services/db/usersRepository';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell, Heart, MessageSquare, AtSign, Zap, Trophy, Trash2,
  Check, Settings, ShoppingBag, Calendar, CreditCard, Info,
  Star, Users, CheckCircle,
} from 'lucide-react';
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  appCategoryForType,
  normalizeAppCategory,
  unreadBellCount,
  type AppNotificationCategory,
} from '../lib/notificationTaxonomy';
import { notificationTarget } from '../lib/notificationRouting';

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
  type: 'like' | 'comment' | 'mention' | 'repost' | 'quote' | 'new_post' | 'message' | 'message_request' | 'xp_gift' | 'challenge' | 'channel_mention' | 'purchase' | 'payout' | 'event_invite' | 'event_reminder' | 'system' | 'wallet' | 'community' | 'community_post';
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

const CATEGORY_LABELS: Record<AppNotificationCategory, string> = {
  social: 'Social',
  community: 'Community',
  marketplace: 'Marketplace',
  events: 'Events',
  earnings: 'Earnings',
  system: 'System',
};

const timeOf = (value: any): Date => {
  if (!value) return new Date(0);
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
};

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabCategory>('All');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [communityImages, setCommunityImages] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;

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
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchImages = async () => {
      const communityIds = Array.from(new Set(
        notifications
          .filter(n => isCommunityNotif(n))
          .map(n => n.relatedId)
          .filter(id => id && !communityImages[id]),
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
          console.error('Error fetching community image:', err);
        }
      }));

      if (updated) setCommunityImages(newImages);
    };

    fetchImages();
  }, [notifications, communityImages]);

  const bundling = userProfile?.settings?.notifications?.bundling !== false;
  const hasUnread = notifications.some((notification) => !notification.read);

  // Merge likes/comments/messages that share a context and day.
  const mergedNotifications = useMemo(() => {
    const merged: Notification[] = [];
    const groups: Record<string, Notification[]> = {};

    if (!bundling) {
      return [...notifications].sort(
        (a, b) => timeOf(b.createdAt).getTime() - timeOf(a.createdAt).getTime(),
      );
    }

    notifications.forEach(notif => {
      const dateKey = timeOf(notif.createdAt).toDateString();

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
        const uniqueActors = Array.from(new Set(actors.map(a => a.id)))
          .map(id => actors.find(a => a.id === id)!);

        let finalContent = first.content;

        if (['like', 'comment', 'xp_gift', 'purchase'].includes(first.type)) {
          const mainActors = uniqueActors.slice(0, 2).map(a => a.name);
          const othersCount = uniqueActors.length > 2 ? (uniqueActors.length - 2) : 0;

          let actorText = mainActors.join(', ');
          if (othersCount > 0) actorText += ` and ${othersCount} others`;

          const contentWithoutName = first.content.startsWith(first.senderName)
            ? first.content.substring(first.senderName.length).trim()
            : first.content;

          finalContent = `${actorText} ${contentWithoutName}`;
        } else if (first.type === 'message' || first.type === 'channel_mention') {
          const msgWord = group.length === 1 ? 'message' : 'messages';
          const isMention = group.some(n => n.type === 'channel_mention');

          if (first.content.includes('in #')) {
            const channelParts = first.content.split('in');
            const contextText = channelParts.length > 1 ? channelParts[1].trim() : 'a channel';

            finalContent = group.length > 1
              ? `${isMention ? 'mentioned you and ' : ''}sent ${group.length} ${msgWord} in ${contextText}`
              : first.content;
          } else {
            finalContent = group.length > 1
              ? `sent you ${group.length} ${msgWord} in DMs`
              : 'sent you a direct message';
          }
        }

        merged.push({
          ...first,
          content: finalContent,
          actors: uniqueActors,
          mergedCount: group.length,
          id: group.map(n => n.id).join(','),
          read: group.every(n => n.read),
        });
      } else {
        merged.push(group[0]);
      }
    });

    return merged.sort((a, b) => timeOf(b.createdAt).getTime() - timeOf(a.createdAt).getTime());
  }, [notifications, bundling]);

  const getCategoryTheme = (category: string) => {
    const themes: Record<string, { text: string; bg: string; dot: string }> = {
      social: { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', dot: 'bg-rose-500' },
      community: { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10', dot: 'bg-sky-500' },
      marketplace: { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', dot: 'bg-orange-500' },
      earnings: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
      events: { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10', dot: 'bg-violet-500' },
      system: { text: 'text-muted-foreground', bg: 'bg-muted', dot: 'bg-muted-foreground' },
    };
    return themes[normalizeAppCategory(category)] || themes.system;
  };

  const isCommunityNotif = (notif: Notification) => {
    if (notif.channelId) return true;
    if (notif.type === 'channel_mention' || notif.type === 'community_post') return true;
    if (notif.type === 'message' && (notif.content.includes('in #') || notif.content.toLowerCase().includes('community'))) return true;
    if (notif.relatedId && communityImages[notif.relatedId]) return true;
    return false;
  };

  const filteredNotifications = useMemo(() => {
    const getCategory = (notif: Notification): AppNotificationCategory => {
      // Direct messages are social even when a legacy writer stored them under
      // community; channel mentions stay in the community bucket.
      if (notif.type === 'message' || notif.type === 'message_request') {
        return isCommunityNotif(notif) ? 'community' : 'social';
      }
      if (notif.category) return normalizeAppCategory(notif.category);
      return appCategoryForType(notif.type);
    };

    const mapped = mergedNotifications.map(n => ({ ...n, category: getCategory(n) }));
    if (activeTab === 'All') return mapped;
    return mapped.filter(n => normalizeAppCategory(n.category) === normalizeAppCategory(activeTab));
  }, [mergedNotifications, activeTab, communityImages]);

  const timeGroups = useMemo(() => {
    const groups: Record<string, Notification[]> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      Older: [],
    };

    filteredNotifications.forEach(notif => {
      const date = timeOf(notif.createdAt);
      if (isToday(date)) groups.Today.push(notif);
      else if (isYesterday(date)) groups.Yesterday.push(notif);
      else if (isThisWeek(date)) groups['This Week'].push(notif);
      else groups.Older.push(notif);
    });

    return groups;
  }, [filteredNotifications]);

  const markAsRead = async (ids: string) => {
    const idArray = ids.split(',');
    try {
      await Promise.all(idArray.map((id) => notificationsRepository.markRead(id)));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    await notificationsRepository.markAllRead(
      auth.currentUser!.uid,
      unread.map(n => n.id),
    );
  };

  const deleteNotifications = async (ids: string) => {
    const idArray = ids.split(',');
    try {
      await Promise.all(idArray.map((id) => notificationsRepository.deleteNotification(id)));
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const getIcon = (type: string) => {
    const size = 18;
    switch (type) {
      case 'like': return <Heart className="text-rose-500" size={size} />;
      case 'comment': return <MessageSquare className="text-sky-500" size={size} />;
      case 'mention':
      case 'channel_mention': return <AtSign className="text-violet-500" size={size} />;
      case 'message': return <MessageSquare className="text-emerald-500" size={size} />;
      case 'xp_gift': return <Zap className="text-amber-500" size={size} />;
      case 'challenge': return <Trophy className="text-orange-500" size={size} />;
      case 'purchase': return <ShoppingBag className="text-emerald-500" size={size} />;
      case 'payout': return <CreditCard className="text-cyan-500" size={size} />;
      case 'event_invite':
      case 'event_reminder': return <Calendar className="text-pink-500" size={size} />;
      case 'wallet': return <CreditCard className="text-indigo-500" size={size} />;
      case 'system': return <Info className="text-muted-foreground" size={size} />;
      case 'community': return <Users className="text-sky-500" size={size} />;
      case 'community_post': return <Users className="text-sky-500" size={size} />;
      default: return <Bell className="text-primary" size={size} />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    const target = notificationTarget(notification, {
      isCommunity: isCommunityNotif(notification),
    });
    if (target) navigate(target);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 pb-20 p-2 md:p-6 lg:p-8 text-foreground">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <Bell size={26} />
            </span>
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground md:ml-[60px]">
            Everything that needs your attention, in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 md:ml-0">
          <button
            onClick={markAllAsRead}
            disabled={!hasUnread}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check size={16} /> Mark all read
          </button>
          <button
            onClick={() => navigate('/settings?tab=notifications')}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Settings size={16} /> Settings
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 w-full">
        <div className="lg:col-span-3 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {(['All', 'Social', 'Community', 'Marketplace', 'Events', 'Earnings', 'System'] as TabCategory[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={activeTab === tab}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                  activeTab === tab
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div className="space-y-8">
            {Object.entries(timeGroups).map(([groupName, groupNotifs]) => (
              groupNotifs.length > 0 && (
                <div key={groupName} className="space-y-3">
                  <div className="flex items-center gap-4">
                    <h3 className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] text-faint">{groupName}</h3>
                    <div className="h-px w-full bg-gradient-to-r from-border to-transparent" />
                  </div>

                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {groupNotifs.map((notification) => {
                        const theme = getCategoryTheme(notification.category || 'system');
                        const isCommunity = isCommunityNotif(notification);
                        const communityImg = notification.relatedId ? communityImages[notification.relatedId] : null;
                        const hasActorStack = Boolean(notification.actors && notification.actors.length > 1 && !['message', 'channel_mention'].includes(notification.type));

                        return (
                          <motion.div
                            key={notification.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            role="button"
                            tabIndex={0}
                            aria-label={`${notification.senderName} ${notification.content}`}
                            onClick={() => handleNotificationClick(notification)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleNotificationClick(notification);
                              }
                            }}
                            className={`group relative cursor-pointer rounded-2xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                              !notification.read
                                ? 'border-primary/20 bg-primary/[0.06]'
                                : 'border-transparent hover:border-border hover:bg-muted/40'
                            }`}
                          >
                            <div className="flex gap-4">
                              {/* Avatar(s) */}
                              <div className="relative flex-shrink-0">
                                {hasActorStack ? (
                                  <div className="flex -space-x-3">
                                    {notification.actors!.slice(0, 3).map((actor, i) => (
                                      <div key={actor.id} className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-background" style={{ zIndex: 10 - i }}>
                                        <img
                                          src={actor.photo?.trim() ? actor.photo : `https://api.dicebear.com/7.x/avataaars/svg?seed=${actor.id}`}
                                          alt={actor.name}
                                          className="h-full w-full object-cover"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className={`h-11 w-11 overflow-hidden ${isCommunity ? 'rounded-xl' : 'rounded-full'}`}>
                                    <img
                                      src={
                                        isCommunity && communityImg?.trim()
                                          ? communityImg
                                          : notification.senderPhoto?.trim()
                                            ? notification.senderPhoto
                                            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${notification.senderId}`
                                      }
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      className="h-full w-full object-cover grayscale-[0.35] transition-all duration-300 group-hover:grayscale-0"
                                    />
                                  </div>
                                )}
                                <div className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-background p-0.5">
                                  {getIcon(notification.type)}
                                </div>
                              </div>

                              {/* Content */}
                              <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[15px] leading-snug text-foreground/90">
                                      {hasActorStack ? (
                                        <span>{notification.content}</span>
                                      ) : (
                                        <>
                                          <span className="font-bold tracking-tight text-foreground">{notification.senderName}</span>{' '}
                                          {notification.content}
                                        </>
                                      )}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.text}`}>
                                        {CATEGORY_LABELS[normalizeAppCategory(notification.category)]}
                                      </span>
                                      <span className="text-faint">•</span>
                                      <span className="text-[11px] text-muted-foreground">
                                        {formatDistanceToNow(timeOf(notification.createdAt), { addSuffix: true })}
                                      </span>
                                      {notification.priority === 'high' && (
                                        <span className={`flex items-center gap-1 ${theme.text}`}>
                                          <Star size={10} fill="currentColor" /> Priority
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-0.5">
                                    {!notification.read && (
                                      <button
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          markAsRead(notification.id);
                                        }}
                                        aria-label="Mark as read"
                                        title="Mark as read"
                                        className="rounded-lg p-1.5 text-faint transition-colors hover:bg-muted hover:text-primary"
                                      >
                                        <Check size={16} />
                                      </button>
                                    )}
                                    <button
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        deleteNotifications(notification.id);
                                      }}
                                      aria-label="Delete notification"
                                      title="Delete"
                                      className="rounded-lg p-1.5 text-faint opacity-100 transition-colors hover:bg-muted hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {!notification.read && (
                              <div className={`absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${theme.dot} shadow-sm`} />
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
              <div className="rounded-3xl border border-border bg-surface py-20 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-border bg-muted">
                  <Bell className="text-faint" size={32} />
                </div>
                <h3 className="mb-2 text-xl font-bold">You're all caught up</h3>
                <p className="mx-auto max-w-xs text-sm text-muted-foreground">
                  No notifications in {activeTab === 'All' ? 'your feed' : activeTab} right now. New activity will show up here.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <DailySummaryCard userProfile={userProfile} notifications={notifications} />

          <div className="rounded-3xl border border-border bg-surface p-5 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <CheckCircle className="text-primary" size={18} /> Quick actions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={markAllAsRead}
                disabled={!hasUnread}
                className="flex w-full items-center justify-between rounded-2xl bg-muted p-3 text-left text-xs font-bold transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark all as read
                <Check size={14} className="opacity-60" />
              </button>
              <button
                onClick={() => navigate('/settings?tab=notifications')}
                className="flex w-full items-center justify-between rounded-2xl bg-muted p-3 text-left text-xs font-bold transition-colors hover:bg-muted/70"
              >
                Notification settings
                <Settings size={14} className="opacity-60" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DailySummaryCard({ userProfile, notifications }: { userProfile: any; notifications: Notification[] }) {
  const navigate = useNavigate();
  const stats = useMemo(() => {
    const today = notifications.filter(n => isToday(timeOf(n.createdAt)));

    return {
      likes: today.filter(n => n.type === 'like').length,
      replies: today.filter(n => n.type === 'comment').length,
      mentions: today.filter(n => n.type === 'mention' || n.type === 'channel_mention').length,
      unread: unreadBellCount(notifications),
    };
  }, [notifications]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-3xl border border-border bg-surface p-5"
    >
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl" aria-hidden />

      <div className="relative mb-5 flex items-center gap-3">
        <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary/20 bg-primary/5">
          <img
            src={
              userProfile?.profileImage?.trim()
                ? userProfile.profileImage
                : (auth.currentUser?.photoURL?.trim()
                  ? auth.currentUser.photoURL
                  : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`)
            }
            className="h-full w-full object-cover"
            alt=""
          />
        </div>
        <div>
          <h3 className="text-sm font-bold">Today at a glance</h3>
          <p className="text-[10px] text-muted-foreground">
            {stats.unread > 0 ? `${stats.unread} unread` : 'All caught up'}
          </p>
        </div>
      </div>

      <div className="relative grid grid-cols-2 gap-3">
        {[
          { label: 'Likes', value: stats.likes, icon: Heart, tone: 'text-rose-500' },
          { label: 'Replies', value: stats.replies, icon: MessageSquare, tone: 'text-sky-500' },
          { label: 'Mentions', value: stats.mentions, icon: AtSign, tone: 'text-violet-500' },
          { label: 'Unread', value: stats.unread, icon: Bell, tone: 'text-primary' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-border bg-background/60 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Icon size={12} className={tone} />
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate('/settings?tab=notifications')}
        className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Choose what reaches you
      </button>
    </motion.div>
  );
}
