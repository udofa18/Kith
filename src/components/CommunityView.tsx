import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, increment, updateDoc, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from '../lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import { eventHref } from '../lib/eventLinks';
import { toast } from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { queryKeys, STALE } from '../lib/queryClient';
import { 
  Users, Settings, Plus, MessageSquare, Shield, UserPlus, UserMinus, 
  Info, Calendar, Hash, Lock, Search, MoreVertical, Trash2, 
  ShieldAlert, ShieldCheck, UserCog, Save, Globe, Twitter, 
  Github, Linkedin, ExternalLink, AlertCircle, Image as ImageIcon, Link as LinkIcon,
  Upload, Layout, Clock, Trophy, BarChart3, Bell, BellOff, Pin, ChevronRight, Copy, Check, ArrowLeft, X
} from 'lucide-react';
import UserHoverCard from './UserHoverCard';
import ChannelSidebar from './ChannelSidebar';
import ChannelView from './ChannelView';
import CreateChannelModal from './CreateChannelModal';
import ChannelSettingsModal from './ChannelSettingsModal';
import CommunityEvents from './CommunityEvents';
import CommunityLeaderboard from './CommunityLeaderboard';
import CommunityAnalytics from './CommunityAnalytics';
import CommunityAbout from './community/CommunityAbout';
import CommunityMembers from './community/CommunityMembers';
import { useMembership } from '../lib/communityRoles';
import { deleteChannelWithMessages } from '../lib/channelAdmin';
import VoiceChannelView from './VoiceChannelView';
import LiveStreamView from './LiveStreamView';
import CommunityInviteModal from './CommunityInviteModal';
import ConfirmModal from './ConfirmModal';
import CommunitySettingsCenter from './CommunitySettingsCenter';
import CommunityDetailsModal from './CommunityDetailsModal';
import { updateDailyStats } from '../lib/stats';
import { formatDate } from '../lib/utils';
import VerifiedBadge from './VerifiedBadge';
import { CommunityIcon, communityHue } from './CommunityCard';
import Avatar from './ui/Avatar';
import { categoryLabel, categoryOf } from '../lib/communityCategories';
import { feeIsRealMoney, feeOf, formatFee } from '../lib/communityPricing';
import { joinCommunity, leaveCommunity } from '../services/socialService';
import { presenceLabel } from '../features/messages/api';
import { channelTypeInfo } from '../lib/channelTypes';
import { formatEventPrice, getOrderStatus, isOrderId } from '../lib/payments';
import { memberAccess } from '../lib/membershipAccess';
import MembershipRenewalPrompt from './community/MembershipRenewalPrompt';

export default function CommunityView({ communityId }: { communityId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  const { data: community, isLoading: communityLoading } = useQuery({
    queryKey: queryKeys.community(communityId),
    queryFn: async () => {
      const docSnap = await getDoc(doc(db, 'communities', communityId));
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() } as any;
    },
    enabled: !!communityId,
    staleTime: STALE.community,
  });

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: queryKeys.communityChannels(communityId),
    queryFn: async () => {
      const q = query(
        collection(db, 'communities', communityId, 'channels'),
        orderBy('order', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    },
    enabled: !!communityId,
    staleTime: STALE.channels,
  });

  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [myMember, setMyMember] = useState<any>(null);
  const access = useMemo(() => memberAccess(myMember), [myMember]);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'channels' | 'about' | 'members' | 'settings' | 'events' | 'leaderboard' | 'analytics'>('channels');
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setCurrentUserProfile(doc.data());
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (communityId && isMember) {
      updateDailyStats(communityId, 'activeMember').catch(console.error);
    }
  }, [communityId, isMember]);

  useEffect(() => {
    if (channels.length > 0) {
      setActiveChannelId(prev => {
        if (prev) return prev;
        const targetChannelId = searchParams.get('channelId');
        if (targetChannelId && channels.some(c => c.id === targetChannelId)) {
          return targetChannelId;
        }
        return channels[0].id;
      });
    }
  }, [channels, searchParams]);

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [channelToEdit, setChannelToEdit] = useState<any>(null);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [creator, setCreator] = useState<any>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backdropInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [userChannelStats, setUserChannelStats] = useState<Record<string, number>>({});
  const [userMentions, setUserMentions] = useState<Record<string, number>>({});
  const profileCache = useRef(new Map<string, any>());
  // Phones show one pane at a time: the community menu, or what's open (a channel or tab).
  const membership = useMembership(communityId);
  const [mobilePane, setMobilePane] = useState<'nav' | 'content'>('nav');
  // The member list is tucked away until asked for; the choice is remembered.
  const [showMemberPanel, setShowMemberPanel] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('kith.memberPanel') === '1');
  const [panelSearch, setPanelSearch] = useState('');
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  useEffect(() => {
    localStorage.setItem('kith.memberPanel', showMemberPanel ? '1' : '0');
    if (!showMemberPanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMemberPanel(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMemberPanel]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCommunityMenu, setShowCommunityMenu] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [hiddenChannels, setHiddenChannels] = useState<string[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [showPinnedDropdown, setShowPinnedDropdown] = useState(false);
  const [lastPinnedMessage, setLastPinnedMessage] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const copyGeneralLink = () => {
    const link = `${window.location.origin}/community/${communityId}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast.success("Community link copied!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    const settingsTab = searchParams.get('settings');
    if (settingsTab === 'members' && isAdmin) {
      setActiveTab('settings');
    }
  }, [searchParams, isAdmin]);

  // Returning from a membership checkout. The server fulfils the order after Paystack confirms the
  // charge, so poll the order instead of trusting the redirect. Paystack sends `reference` (our order
  // id); Stripe uses `order`.
  const orderParamValue = searchParams.get('order') ?? searchParams.get('reference');
  const orderParam = isOrderId(orderParamValue) ? orderParamValue : null;
  const checkoutCancelled = searchParams.get('cancelled');
  useEffect(() => {
    if (!checkoutCancelled) return;
    toast('Checkout cancelled. No charge was made.');
    setSearchParams({}, { replace: true });
  }, [checkoutCancelled, setSearchParams]);

  useEffect(() => {
    if (!orderParam || !auth.currentUser) return;
    let cancelled = false;
    let attempts = 0;
    const finish = () => setSearchParams({}, { replace: true });
    const poll = async () => {
      try {
        const status = await getOrderStatus(orderParam);
        if (cancelled) return;
        if (status.status === 'paid') {
          toast.success(`You're in! Welcome to ${community?.name || 'the community'}.`);
          queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) });
          return finish();
        }
        if (status.status === 'failed') {
          toast.error("That payment didn't go through. Nothing was charged.");
          return finish();
        }
      } catch {
        // Transient error: keep polling until the limit.
      }
      attempts += 1;
      if (cancelled) return;
      if (attempts < 15) setTimeout(poll, 2000);
      else finish();
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [orderParam, auth.currentUser?.uid, communityId, community?.name, queryClient, setSearchParams]);

  const [settingsForm, setSettingsForm] = useState({
    name: '',
    description: '',
    category: 'Technology',
    website: '',
    twitter: '',
    discord: '',
    github: '',
    linkedin: '',
    rules: [] as string[],
    welcomeMessage: '',
    xpMultiplier: 1,
    image: '',
    backdrop: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [myCustomRoles, setMyCustomRoles] = useState<string[]>([]);
  const [myTimeoutUntil, setMyTimeoutUntil] = useState<number | null>(null);
  const [mutedChannels, setMutedChannels] = useState<string[]>([]);

  useEffect(() => {
    if (!communityId) return;

    const qRoles = query(collection(db, 'communities', communityId, 'roles'), orderBy('order', 'asc'));
    const unsubscribeRoles = onSnapshot(qRoles, (snap) => {
      setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, `communities/${communityId}/roles`);
    });

    let unsubscribeMyMember: (() => void) | undefined;
    if (auth.currentUser) {
      unsubscribeMyMember = onSnapshot(doc(db, 'communities', communityId, 'members', auth.currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const myMember = docSnap.data();
          setMyMember(myMember);
          setIsMember(true);
          setIsOwner(myMember.role === 'owner');
          setIsAdmin(myMember.role === 'admin' || myMember.role === 'owner' || myMember.role === 'moderator' || (myMember.permissions || []).includes('moderate_chat'));
          setMyPermissions(myMember.permissions || []);
          setMyCustomRoles(myMember.customRoles || []);
          setMyTimeoutUntil(myMember.timeoutUntil?.toMillis?.() ?? null);
          setHiddenChannels(myMember.hiddenChannels || []);
          setMutedChannels(myMember.mutedChannels || []);
        } else {
          setIsMember(false);
          setMyMember(null);
          setIsOwner(false);
          setIsAdmin(false);
          setMyPermissions([]);
          setMyCustomRoles([]);
          setHiddenChannels([]);
          setMutedChannels([]);
        }
      }, (error) => {
        console.error("Error fetching my membership:", error);
      });
    }

    let unsubscribeStats: (() => void) | undefined;
    let unsubscribeMentions: (() => void) | undefined;

    const unsubscribeMembers = onSnapshot(collection(db, 'communities', communityId, 'members'), async (snapshot) => {
      // Basic members list without user profiles initially for speed
      const basicMembers = snapshot.docs.map(d => ({ id: d.id, ...d.data(), user: profileCache.current.get(d.id) ?? null }));
      setMembers(basicMembers);

      // Attach profiles. Each profile is fetched once and cached, so a member joining or
      // changing role doesn't re-download everyone.
      (async () => {
        await Promise.all(snapshot.docs.map(async (d) => {
          if (profileCache.current.has(d.id)) return;
          const userDoc = await getDoc(doc(db, 'users', d.id)).catch(() => null);
          profileCache.current.set(d.id, userDoc?.exists() ? userDoc.data() : null);
        }));
        setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data(), user: profileCache.current.get(d.id) ?? null })));
      })().catch(console.error);

      if (auth.currentUser) {
        // Fetch channel stats for unread counts
        if (!unsubscribeStats) {
          const statsRef = collection(db, 'communities', communityId, 'members', auth.currentUser.uid, 'channelStats');
          unsubscribeStats = onSnapshot(statsRef, (statsSnap) => {
            const stats: Record<string, number> = {};
            statsSnap.docs.forEach(d => {
              stats[d.id] = d.data().lastReadCount || 0;
            });
            setUserChannelStats(stats);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `communities/${communityId}/members/${auth.currentUser?.uid}/channelStats`);
          });
        }

        // Fetch mentions
        if (!unsubscribeMentions) {
          const mentionsQuery = query(
            collection(db, 'notifications'),
            where('recipientId', '==', auth.currentUser.uid),
            where('relatedId', '==', communityId),
            where('type', '==', 'channel_mention'),
            where('read', '==', false)
          );

          const unsub = onSnapshot(mentionsQuery, (snap) => {
            const counts: Record<string, number> = {};
            snap.docs.forEach(d => {
              const data = d.data();
              if (data.channelId) {
                counts[data.channelId] = (counts[data.channelId] || 0) + 1;
              }
            });
            setUserMentions(counts);
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `notifications (recipient: ${auth.currentUser?.uid}, community: ${communityId})`);
          });
          unsubscribeMentions = unsub;
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `communities/${communityId}/members`);
    });

    return () => {
      unsubscribeRoles();
      unsubscribeMembers();
      if (unsubscribeMyMember) unsubscribeMyMember();
      if (unsubscribeStats) unsubscribeStats();
      if (unsubscribeMentions) unsubscribeMentions();
    };
  }, [communityId]);

  // On phones, members land on the channel list; visitors land on the join panel.
  useEffect(() => { setMobilePane(isMember ? 'nav' : 'content'); }, [isMember]);

  // Refresh member profiles every couple of minutes so "active" dots stay accurate.
  const memberIds = members.map(m => m.id).join(',');
  useEffect(() => {
    if (!memberIds) return;
    const t = setInterval(async () => {
      const ids = memberIds.split(',').slice(0, 100);
      await Promise.all(ids.map(async id => {
        const snap = await getDoc(doc(db, 'users', id)).catch(() => null);
        if (snap?.exists()) profileCache.current.set(id, snap.data());
      }));
      setMembers(prev => prev.map(m => ({ ...m, user: profileCache.current.get(m.id) ?? m.user })));
    }, 2 * 60_000);
    return () => clearInterval(t);
  }, [memberIds]);

  useEffect(() => {
    if (!communityId || !activeChannelId || activeTab !== 'channels') {
      setPinnedMessages([]);
      setLastPinnedMessage(null);
      return;
    }

    const messagesRef = collection(db, 'communities', communityId, 'channels', activeChannelId, 'messages');
    const q = query(messagesRef, where('isPinned', '==', true), orderBy('pinnedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const pinned = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPinnedMessages(pinned);
      setLastPinnedMessage(pinned[0] || null);
    }, (error) => {
      console.error("Error fetching pinned messages:", error);
    });

    return () => unsubscribe();
  }, [communityId, activeChannelId, activeTab]);

  const handleReorderChannels = async (updatedCategoryChannels: any[]) => {
    if (!isAdmin || !communityId) return;

    // Create a new array with updated orders for the affected channels
    const newChannels = [...channels];
    
    // Create a map for quick lookup and update the local state first for responsiveness
    const updatedMap: Record<string, number> = {};
    updatedCategoryChannels.forEach((c, index) => {
      updatedMap[c.id] = index;
    });

    const finalChannels = newChannels.map(c => {
      if (updatedMap.hasOwnProperty(c.id)) {
        return { ...c, order: updatedMap[c.id] };
      }
      return c;
    });

    queryClient.setQueryData(queryKeys.communityChannels(communityId), finalChannels);

    try {
      const batch = writeBatch(db);
      updatedCategoryChannels.forEach((channel, index) => {
        const channelRef = doc(db, 'communities', communityId, 'channels', channel.id);
        batch.update(channelRef, { order: index });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/channels (reorder)`);
      // Revert if failed? (Optional but good)
      // setChannels(channels); 
    }
  };

  useEffect(() => {
    if (!communityId || !isAdmin) {
      setPendingRequests([]);
      return;
    }

    const q = query(
      collection(db, 'communities', communityId, 'joinRequests'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingRequests(reqs);
    });

    return () => unsubscribe();
  }, [communityId, isAdmin]);

  useEffect(() => {
    if (!communityId) return;

    let q;
    if (isMember) {
      q = query(
        collection(db, 'events'),
        where('communityId', '==', communityId),
        where('status', '==', 'upcoming'),
        where('visibility', 'in', ['public', 'community']),
        orderBy('date', 'asc')
      );
    } else {
      q = query(
        collection(db, 'events'),
        where('communityId', '==', communityId),
        where('status', '==', 'upcoming'),
        where('visibility', '==', 'public'),
        orderBy('date', 'asc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedEvents = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).slice(0, 3); // Only show top 3
      setUpcomingEvents(fetchedEvents);
    }, (error) => {
      console.error("Error fetching sidebar events:", error);
      // Don't throw to avoid crashing the whole view
    });

    return () => unsubscribe();
  }, [communityId, isMember]);

  useEffect(() => {
    if (community) {
      setSettingsForm({
        name: community.name || '',
        description: community.description || '',
        category: community.category || 'Technology',
        website: community.website || '',
        twitter: community.socials?.twitter || '',
        discord: community.socials?.discord || '',
        github: community.socials?.github || '',
        linkedin: community.socials?.linkedin || '',
        rules: community.rules || [],
        welcomeMessage: community.welcomeMessage || '',
        xpMultiplier: community.xpMultiplier || 1,
        image: community.image || '',
        backdrop: community.backdrop || ''
      });
    }
  }, [community]);

  useEffect(() => {
    if (!auth.currentUser || !communityId || !activeChannelId || !isMember) return;

    const markAsRead = async () => {
      const activeChannel = channels.find(c => c.id === activeChannelId);
      if (!activeChannel) return;

      const statsRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid, 'channelStats', activeChannelId);
      await setDoc(statsRef, { lastReadCount: activeChannel.messageCount || 0 }, { merge: true });

      // Mark notifications as read
      const notifQuery = query(
        collection(db, 'notifications'),
        where('recipientId', '==', auth.currentUser?.uid),
        where('channelId', '==', activeChannelId),
        where('read', '==', false)
      );
      
      const snap = await getDocs(notifQuery);
      if (snap.size > 0) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.update(d.ref, { read: true }));
        await batch.commit();
      }
    };

    markAsRead();
  }, [communityId, activeChannelId, isMember, channels]);

  const handleFileUpload = async (file: File, type: 'image' | 'backdrop') => {
    if (!file || !communityId) return;
    setIsUploading(true);
    try {
      const storageRef = ref(null, `communities/${communityId}/${auth.currentUser.uid}/${type}_${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setSettingsForm(prev => ({ ...prev, [type]: url }));
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleHide = async (channelId: string) => {
    if (!auth.currentUser || !communityId) return;
    
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    if (isAdmin) {
      try {
        const channelRef = doc(db, 'communities', communityId, 'channels', channelId);
        const newHiddenState = !channel.isHidden;
        await updateDoc(channelRef, { isHidden: newHiddenState });
        toast.success(newHiddenState ? "Channel hidden from members" : "Channel made visible to all");
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/channels/${channelId}`);
      }
    } else {
      // General users shouldn't be able to hide channels per request
      toast.error("Only admins can change channel visibility");
    }
  };

  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);
  const [showChannelDeleteConfirm, setShowChannelDeleteConfirm] = useState(false);

  const handleDeleteChannel = async () => {
    if (!channelToDelete || !communityId) return;
    try {
      const target = channels.find(c => c.id === channelToDelete);
      await deleteChannelWithMessages(communityId, { id: channelToDelete, name: target?.name });
      toast.success("Channel deleted successfully");
      setShowChannelDeleteConfirm(false);
      setChannelToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/channels/${channelToDelete}`);
    }
  };

  const handleMuteChannel = async (channelId: string) => {
    if (!auth.currentUser || !communityId) return;
    try {
      const memberRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid);
      const isMuted = mutedChannels.includes(channelId);
      const newMuted = isMuted
        ? mutedChannels.filter(id => id !== channelId)
        : [...mutedChannels, channelId];
      
      await updateDoc(memberRef, { mutedChannels: newMuted });
      setMutedChannels(newMuted);
      toast.success(isMuted ? "Channel unmuted" : "Channel muted");
    } catch (error) {
      console.error("Error muting channel:", error);
    }
  };

  const handleMarkAsRead = async (channelId: string) => {
    if (!auth.currentUser || !communityId) return;
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    try {
      const statsRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid, 'channelStats', channelId);
      await setDoc(statsRef, { 
        lastReadCount: channel.messageCount || 0,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setUserChannelStats(prev => ({
        ...prev,
        [channelId]: channel.messageCount || 0
      }));
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleToggleLock = async (channelId: string) => {
    if (!isAdmin || !communityId) return;
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    try {
      const channelRef = doc(db, 'communities', communityId, 'channels', channelId);
      await updateDoc(channelRef, { isLocked: !channel.isLocked });
      toast.success(channel.isLocked ? "Channel unlocked" : "Channel locked");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/channels/${channelId}`);
    }
  };

  const handleJoinLeave = async () => {
    if (!auth.currentUser || !communityId || !community) return;

    try {
      if (isMember) {
        if (isOwner) {
          toast.error("Owners can't leave. Transfer ownership first.");
          return;
        }
        await leaveCommunity(auth.currentUser.uid, communityId);
        toast.success(`You left ${community.name}`);
        setSearchParams({ view: 'communities' });
        return;
      }

      // Private, paid or question-gated communities go through the join dialog.
      const control = community.membershipControl;
      const isPrivateFlag = community.isPrivate || (control?.accessType && control?.accessType !== 'public') || control?.approvalRequired;
      if (isPrivateFlag || feeOf(community) || control?.onboardingQuestions?.length > 0) {
        setShowDetailsModal(true);
        return;
      }
      await joinCommunity(auth.currentUser.uid, auth.currentUser.displayName, community);
      queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) });
      toast.success(`Welcome to ${community.name}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("We couldn't stop your monthly payment")) {
        toast.error(error.message);
        return;
      }
      handleFirestoreError(error, isMember ? OperationType.DELETE : OperationType.WRITE, `communities/${communityId}/members/${auth.currentUser?.uid}`);
    }
  };

  const handleSaveSettings = async () => {
    if (!isAdmin || !communityId) return;
    setIsSavingSettings(true);
    try {
      const communityRef = doc(db, 'communities', communityId);
      await updateDoc(communityRef, {
        name: settingsForm.name,
        description: settingsForm.description,
        category: settingsForm.category,
        website: settingsForm.website,
        socials: {
          twitter: settingsForm.twitter,
          discord: settingsForm.discord,
          github: settingsForm.github,
          linkedin: settingsForm.linkedin
        },
        rules: settingsForm.rules,
        welcomeMessage: settingsForm.welcomeMessage || '',
        xpMultiplier: settingsForm.xpMultiplier,
        image: settingsForm.image,
        backdrop: settingsForm.backdrop
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addRule = () => {
    setSettingsForm(prev => ({ ...prev, rules: [...prev.rules, ''] }));
  };

  const updateRule = (index: number, value: string) => {
    const newRules = [...settingsForm.rules];
    newRules[index] = value;
    setSettingsForm(prev => ({ ...prev, rules: newRules }));
  };

  const removeRule = (index: number) => {
    setSettingsForm(prev => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  };

  const roleOrder = ['owner', 'admin', 'moderator', 'member'];
  const roleLabels: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admins',
    moderator: 'Moderators',
    member: 'Members'
  };

  const totalUnreadMessages = useMemo(() => {
    return channels.reduce((acc, channel) => {
      const unread = Math.max(0, (channel.messageCount || 0) - (userChannelStats[channel.id] || 0));
      return acc + unread;
    }, 0);
  }, [channels, userChannelStats]);

  // Group members by role for the sidebar
  const groupedMembers = useMemo(() => {
    const groups: Record<string, any[]> = {
      owner: [],
      admin: [],
      moderator: [],
      member: []
    };
    members.forEach(m => {
      if (groups[m.role]) groups[m.role].push(m);
      else groups.member.push(m);
    });
    return groups;
  }, [members]);

  const needsApproval = !!(community?.isPrivate || community?.membershipControl?.approvalRequired ||
    (community?.membershipControl?.accessType && community.membershipControl.accessType !== 'public'));
  const isOnline = (m: any) => presenceLabel(m.user?.lastActiveAt, now, m.user) === 'Active now';
  const onlineCount = members.filter(isOnline).length;
  // The stored count can drift; trust the loaded list once we have it.
  const memberTotal = members.length || community?.memberCount || 0;

  if (communityLoading || channelsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="rounded-[32px] p-20 text-center space-y-4 border border-foreground/10 bg-background/50 backdrop-blur-md">
        <div className="w-20 h-20 bg-foreground/5 rounded-full flex items-center justify-center mx-auto">
          <Info size={40} className="text-foreground/20" />
        </div>
        <h2 className="text-2xl font-bold">Community Not Found</h2>
        <p className="text-foreground/50 max-w-md mx-auto">
          The community you're looking for doesn't exist or has been removed.
        </p>
      </div>
    );
  }

  const activeChannel = channels.find(c => c.id === activeChannelId);
  return (
    <div className="h-full flex flex-col">
      <CreateChannelModal 
        communityId={communityId} 
        isOpen={showCreateChannel} 
        onClose={() => {
          setShowCreateChannel(false);
          setSelectedCategoryId(undefined);
        }} 
        roles={roles}
        initialCategoryId={selectedCategoryId}
      />

      {channelToEdit && (
        <ChannelSettingsModal 
          communityId={communityId} 
          channel={channelToEdit} 
          isOpen={showChannelSettings} 
          onClose={() => {
            setShowChannelSettings(false);
            setChannelToEdit(null);
          }} 
          roles={roles}
        />
      )}

      <ConfirmModal 
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleJoinLeave}
        title="Leave Community"
        message={`Are you sure you want to leave ${community.name}? You will lose access to all channels and content.`}
        confirmText="Leave Community"
      />

      {/* Discord-style Layout */}
      <div className="flex-1 flex overflow-hidden bg-background text-black dark:text-white">
        {/* Left Sidebar: Channels */}
        <div className={`${mobilePane === 'nav' ? 'flex' : 'hidden'} md:flex w-full md:w-64 shrink-0 flex-col border-r border-foreground/10 bg-foreground/[0.03]`}>
          {/* Community Header in Sidebar */}
          <div className="relative">
            <div 
              onClick={() => isMember && setShowCommunityMenu(!showCommunityMenu)}
              className="p-4 border-b border-foreground/10 flex items-center justify-between group cursor-pointer hover:bg-foreground/5 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CommunityIcon community={community} size={36} />
                <div className="min-w-0">
                  <h2 className="font-bold text-sm truncate">{community.name}</h2>
                  <p className="text-xs text-foreground/50 truncate">{memberTotal} {memberTotal === 1 ? 'member' : 'members'}{onlineCount > 0 && ` · ${onlineCount} online`}</p>
                </div>
              </div>
              {isMember && access.canUseChannels ? (
                <MoreVertical size={16} className="text-foreground/40 group-hover:text-foreground transition-all" />
              ) : (
                auth.currentUser && (
                  <button
                    onClick={e => { e.stopPropagation(); isMember ? setShowDetailsModal(true) : handleJoinLeave(); }}
                    className="shrink-0 px-3 py-1.5 bg-primary text-white rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    {isMember ? 'Renew' : 'Join'}
                  </button>
                )
              )}
            </div>

            <AnimatePresence>
              {showCommunityMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCommunityMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute left-4 right-4 top-full mt-1 bg-background border border-foreground/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        setShowCommunityMenu(false);
                        setActiveTab('about');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground/70 hover:bg-foreground/5 transition-colors"
                    >
                      <Info size={16} /> Community Info
                    </button>
                    {(isAdmin || myPermissions.includes('moderate_chat')) && (
                      <button
                        onClick={() => {
                          setShowCommunityMenu(false);
                          setActiveTab('settings');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground/70 hover:bg-foreground/5 transition-colors"
                      >
                        <Settings size={16} /> Server Settings
                      </button>
                    )}
                    <div className="h-[1px] bg-foreground/10" />
                    <button
                      onClick={() => {
                        setShowCommunityMenu(false);
                        setShowLeaveConfirm(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <UserMinus size={16} /> Leave Community
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {/* Tab Navigation */}
            <div className="space-y-1">
              {[
                { id: 'channels', label: 'Channels', icon: <Hash size={16} /> },
                { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy size={16} /> },
                { id: 'events', label: 'Events', icon: <Calendar size={16} /> },
                { id: 'members', label: 'Members', icon: <Users size={16} /> },
                { id: 'about', label: 'About', icon: <Info size={16} /> },
                ...(isAdmin || myPermissions.includes('moderate_chat') ? [
                  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
                  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> }
                ] : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id as any); if (tab.id !== 'channels') setMobilePane('content'); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-foreground/50 hover:bg-foreground/5 hover:text-foreground'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'channels' && !access.canUseChannels && (
              <p className="pt-4 border-t border-foreground/10 px-3 text-xs text-foreground/50">
                {isMember ? 'Renew your membership to open the channels.' : 'Channels appear here once you join.'}
              </p>
            )}
            {activeTab === 'channels' && access.canUseChannels && (
              <div className="pt-4 border-t border-foreground/10">
                <ChannelSidebar 
                  communityId={communityId}
                  channels={channels}
                  activeChannelId={activeChannelId}
                  onChannelSelect={(id: string) => {
                    setActiveChannelId(id);
                    setMobilePane('content');
                    // Keep the open channel in the URL so links, refresh and the voice bar know where you are.
                    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('channelId', id); p.delete('postId'); return p; }, { replace: true });
                  }}
                  isAdmin={isAdmin}
                  myPermissions={myPermissions}
                  myCustomRoles={myCustomRoles}
                  onCreateChannel={(catId) => {
                    setSelectedCategoryId(catId);
                    setShowCreateChannel(true);
                  }}
                  userChannelStats={userChannelStats}
                  userMentions={userMentions}
                  hiddenChannels={hiddenChannels}
                  onLeaveChannel={handleToggleHide}
                  onReorderChannels={handleReorderChannels}
                  onMarkAsRead={handleMarkAsRead}
                  onMuteChannel={handleMuteChannel}
                  onEditChannel={(channel) => {
                    setChannelToEdit(channel);
                    setShowChannelSettings(true);
                  }}
                  onDeleteChannel={(id) => {
                    setChannelToDelete(id);
                    setShowChannelDeleteConfirm(true);
                  }}
                  onToggleLock={handleToggleLock}
                  mutedChannels={mutedChannels}
                />
              </div>
            )}

            {/* Upcoming Events Sidebar Section */}
            {upcomingEvents.length > 0 && (
              <div className="pt-4 border-t border-foreground/5 space-y-3">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-semibold text-foreground/60">Upcoming events</h3>
                  <button 
                    onClick={() => setActiveTab('events')}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    See all
                  </button>
                </div>
                <div className="space-y-2">
                  {upcomingEvents.map(event => (
                    <Link 
                      key={event.id} 
                      to={eventHref(event)}
                      className="block p-2.5 rounded-xl border border-foreground/10 hover:border-primary/40 hover:bg-foreground/5 transition-colors group"
                    >
                      <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors text-foreground">{event.title}</h4>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-foreground/60">
                            <div className="flex items-center gap-1">
                              <Calendar size={10} className="text-primary" />
                              <span className="text-foreground">
                                {formatDate(event.date, 'MMM d')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock size={10} className="text-primary" />
                              <span className="text-foreground">
                                {formatDate(event.date, 'h:mm a')}
                              </span>
                            </div>
                          </div>
                          <span className={`text-xs font-medium ${event.isPaid ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                            {formatEventPrice(event)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* You */}
          {auth.currentUser && (
            <Link to={`/creators/${auth.currentUser.uid}`} className="p-3 border-t border-foreground/10 flex items-center gap-2.5 hover:bg-foreground/5 transition-colors">
              <Avatar src={currentUserProfile?.profileImage || auth.currentUser.photoURL} seed={auth.currentUser.uid} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate">{currentUserProfile?.displayName || auth.currentUser.displayName || 'You'}</span>
                <span className="block text-xs text-foreground/50 truncate">
                  {isOwner ? 'Owner' : isAdmin ? 'Admin' : isMember ? 'Member' : 'Not a member yet'}
                </span>
              </span>
            </Link>
          )}
        </div>

        {/* Middle Content: Chat or Tab Content */}
        <div className={`${mobilePane === 'content' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-w-0`}>
          <div className="h-14 px-3 sm:px-5 border-b border-foreground/10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button onClick={() => setMobilePane('nav')} aria-label="Back to channels" className="md:hidden p-2 -ml-1 rounded-full hover:bg-foreground/10">
                <ArrowLeft size={20} />
              </button>
              <div className="hidden sm:flex w-8 h-8 shrink-0 rounded-lg bg-primary/10 items-center justify-center text-primary">
                {activeTab === 'channels' ? (() => { const Icon = channelTypeInfo(activeChannel?.type).icon; return <Icon size={18} />; })() : (
                  activeTab === 'leaderboard' ? <Trophy size={18} /> : (
                    activeTab === 'analytics' ? <BarChart3 size={18} /> : <Info size={18} />
                  )
                )}
              </div>
              <div className="min-w-0">
              <div className="min-w-0">
                <h2 className="font-bold text-base sm:text-lg leading-tight truncate">
                  {activeTab === 'channels' ? (isMember ? (activeChannel?.name || 'Channels') : community.name) : (activeTab.charAt(0).toUpperCase() + activeTab.slice(1))}
                </h2>
                {activeTab === 'channels' && activeChannel?.description && (
                  <p className="text-xs text-foreground/50 truncate max-w-[400px]">{activeChannel.description}</p>
                )}
              </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isMember && activeTab !== 'members' && activeTab !== 'settings' && (
                <button
                  onClick={() => setShowMemberPanel(o => !o)}
                  aria-pressed={showMemberPanel}
                  aria-label={showMemberPanel ? 'Hide members' : 'Show members'}
                  title={showMemberPanel ? 'Hide members' : 'Show members'}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${showMemberPanel ? 'bg-primary/10 text-primary' : 'text-foreground/50 hover:bg-foreground/5 hover:text-foreground'}`}
                >
                  <Users size={17} />
                  <span>{memberTotal}</span>
                </button>
              )}
              {(isAdmin || myPermissions.includes('invite_users')) && (
                <button 
                  onClick={() => setShowInviteModal(true)}
                  className="px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary/20 transition-all flex items-center gap-2"
                >
                  <UserPlus size={14} /> Invite
                </button>
              )}
              
              {activeTab === 'channels' && activeChannel && (
                <>
                  <div className="relative">
                    <button 
                      onClick={() => setShowPinnedDropdown(!showPinnedDropdown)}
                      className={`p-2 hover:bg-foreground/5 rounded-xl transition-all relative ${pinnedMessages.length > 0 ? 'text-primary' : 'text-foreground/40'}`}
                      title="Pinned Messages"
                    >
                      <Pin size={18} className={showPinnedDropdown ? 'fill-current' : ''} />
                      {pinnedMessages.length > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full border-2 border-background" />
                      )}
                    </button>

                    <AnimatePresence>
                      {showPinnedDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowPinnedDropdown(false)} />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute right-0 top-full mt-2 w-80 bg-background border border-foreground/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[500px]"
                          >
                            <div className="p-4 border-b border-foreground/5 bg-foreground/5 flex items-center justify-between">
                              <h3 className="text-sm font-bold flex items-center gap-2">
                                <Pin size={14} className="text-primary" /> Pinned Messages
                              </h3>
                              <span className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">{pinnedMessages.length} Pinned</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                              {pinnedMessages.length === 0 ? (
                                <div className="p-10 text-center space-y-2">
                                  <Pin size={32} className="mx-auto opacity-10" />
                                  <p className="text-xs text-foreground/40 font-medium">No pinned messages in this channel yet.</p>
                                </div>
                              ) : (
                                pinnedMessages.map(msg => (
                                  <div key={msg.id} className="p-3 rounded-xl bg-foreground/5 border border-foreground/5 group hover:border-primary/30 transition-all">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="w-5 h-5 rounded-full bg-foreground/10 overflow-hidden">
                                        <img src={(msg.authorPhoto && msg.authorPhoto.trim() !== '') ? msg.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.authorId}`} alt="" />
                                      </div>
                                      <span className="text-xs font-bold text-foreground/80">{msg.authorName}</span>
                                    </div>
                                    <p className="text-xs text-foreground/60 line-clamp-3 mb-3 leading-relaxed">
                                      {msg.content}
                                    </p>
                                    <button 
                                      onClick={() => {
                                        setShowPinnedDropdown(false);
                                        const el = document.getElementById(`message-${msg.id}`);
                                        if (el) {
                                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          el.classList.add('bg-primary/20');
                                          setTimeout(() => el.classList.remove('bg-primary/20'), 2000);
                                        } else {
                                          toast.error("Message too far back to jump to directly.");
                                        }
                                      }}
                                      className="w-full py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-all flex items-center justify-center gap-1.5"
                                    >
                                      Jump to Message <ChevronRight size={12} />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="relative">
                    <button
                      onClick={() => setShowNotifMenu(o => !o)}
                      aria-haspopup="menu"
                      aria-expanded={showNotifMenu}
                      aria-label="Notification settings"
                      title={mutedChannels.includes(activeChannel.id) ? 'Muted: only @mentions' : 'Notification settings'}
                      className={`p-2 hover:bg-foreground/5 rounded-xl transition-all ${mutedChannels.includes(activeChannel.id) ? 'text-foreground/40' : 'text-primary'}`}
                    >
                      {mutedChannels.includes(activeChannel.id) ? <BellOff size={18} /> : <Bell size={18} />}
                    </button>
                    <AnimatePresence>
                      {showNotifMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowNotifMenu(false)} />
                          <motion.div
                            role="menu"
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                            className="absolute right-0 top-full mt-2 w-72 z-50 bg-background border border-foreground/10 rounded-xl shadow-xl overflow-hidden"
                          >
                            <p className="px-4 pt-3 pb-2 text-xs font-semibold text-foreground/50">Notifications for #{activeChannel.name}</p>
                            {([
                              { muted: false, title: 'All messages', body: 'A sound and an unread badge for every new message.' },
                              { muted: true, title: 'Only @mentions', body: 'Muted. You still hear it when someone mentions you.' },
                            ] as const).map(opt => {
                              const on = mutedChannels.includes(activeChannel.id) === opt.muted;
                              return (
                                <button
                                  key={opt.title} role="menuitemradio" aria-checked={on}
                                  onClick={() => { if (!on) handleMuteChannel(activeChannel.id); setShowNotifMenu(false); }}
                                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-foreground/5"
                                >
                                  <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-primary' : 'border-foreground/30'}`}>{on && <span className="w-2 h-2 rounded-full bg-primary" />}</span>
                                  <span><span className="block text-sm font-medium">{opt.title}</span><span className="block text-xs text-foreground/55">{opt.body}</span></span>
                                </button>
                              );
                            })}
                            <p className="px-4 py-2.5 text-xs text-foreground/45 border-t border-foreground/10">Applies only to you.</p>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}

              {(isAdmin || myPermissions.includes('moderate_chat') || activeChannel?.owners?.includes(auth.currentUser?.uid)) && activeTab === 'channels' && activeChannel && (
                <button 
                  onClick={() => {
                    setChannelToEdit(activeChannel);
                    setShowChannelSettings(true);
                  }}
                  className="p-2 hover:bg-foreground/5 rounded-xl text-foreground/40 hover:text-foreground transition-all"
                  title="Channel Settings"
                >
                  <Settings size={16} />
                </button>
              )}

            </div>
          </div>

          {activeTab === 'channels' && lastPinnedMessage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="px-6 py-3 bg-amber-500/10 dark:bg-amber-500/20 border-b border-amber-500/30 border-l-4 border-l-amber-500 flex items-center justify-between group cursor-pointer hover:bg-amber-500/25 transition-all shrink-0 shadow-sm"
              onClick={() => {
                const el = document.getElementById(`message-${lastPinnedMessage.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('bg-primary/20');
                  setTimeout(() => el.classList.remove('bg-primary/20'), 2000);
                }
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Pin size={16} className="text-amber-500 fill-current shrink-0" />
                <p className="text-sm font-medium text-foreground truncate">
                  <span className="font-bold text-amber-600 dark:text-amber-400">{lastPinnedMessage.authorName}:</span> {lastPinnedMessage.content}
                </p>
              </div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                Jump <ChevronRight size={14} />
              </div>
            </motion.div>
          )}

          {activeTab === 'channels' ? (
            !isMember ? (
              <JoinPanel
                community={community}
                signedIn={!!auth.currentUser}
                onJoin={handleJoinLeave}
                onAbout={() => setActiveTab('about')}
                members={members}
              />
            ) : !access.canUseChannels ? (
              <LockedMembershipPanel
                community={community}
                access={access}
                onRenew={() => setShowDetailsModal(true)}
              />
            ) : activeChannel ? (
              activeChannel.type === 'voice' ? (
                <VoiceChannelView 
                  communityId={communityId}
                  channel={activeChannel}
                  currentUserProfile={members.find(m => m.id === auth.currentUser?.uid)?.user}
                  isAdmin={isAdmin}
                  myPermissions={myPermissions}
                />
              ) : activeChannel.type === 'live' ? (
                <LiveStreamView 
                  communityId={communityId}
                  channel={activeChannel}
                  currentUserProfile={members.find(m => m.id === auth.currentUser?.uid)?.user}
                  isOwner={isOwner}
                  isAdmin={isAdmin}
                  myPermissions={myPermissions}
                />
              ) : (
                <ChannelView 
                  communityId={communityId} 
                  channel={activeChannel} 
                  isMember={isMember} 
                  isAdmin={isAdmin}
                  myPermissions={myPermissions}
                  myCustomRoles={myCustomRoles}
                  timeoutUntil={myTimeoutUntil}
                  isMuted={activeChannel ? mutedChannels.includes(activeChannel.id) : false}
                  onOpenChannel={(id: string) => {
                    setActiveChannelId(id);
                    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('channelId', id); p.delete('postId'); return p; }, { replace: true });
                  }}
                  communityMembers={members}
                  roles={roles}
                  onOpenSettings={() => {
                    setChannelToEdit(activeChannel);
                    setShowChannelSettings(true);
                  }}
                />
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-foreground/50">
                <Hash size={40} className="mb-3 opacity-30" />
                <p>Pick a channel to start chatting.</p>
              </div>
            )
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'events' && <CommunityEvents communityId={communityId} isAdmin={isAdmin} isMember={isMember} canCreate={membership.can('create_event')} />}
              {activeTab === 'leaderboard' && <CommunityLeaderboard communityId={communityId} />}
              {activeTab === 'analytics' && <CommunityAnalytics communityId={communityId} />}
              {activeTab === 'about' && (
                <CommunityAbout
                  community={community}
                  communityId={communityId}
                  members={members}
                  needsApproval={needsApproval}
                  onlineCount={onlineCount}
                  copied={copiedLink}
                  onCopy={copyGeneralLink}
                  onEdit={membership.isAdmin ? () => { setActiveTab('settings'); setSearchParams({ view: 'community', id: communityId, settings: 'branding' }); } : undefined}
                />
              )}
              {activeTab === 'members' && (
                <CommunityMembers communityId={communityId} community={community} members={members} roles={roles} now={now} />
              )}
              {activeTab === 'settings' && (
                <CommunitySettingsCenter 
                  communityId={communityId} 
                  initialSection={searchParams.get('settings') as any}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: members, online first. Closed until opened from the header. */}
        {showMemberPanel && isMember && activeTab !== 'members' && activeTab !== 'settings' && (() => {
          const q = panelSearch.trim().toLowerCase();
          const matches = (m: any) => !q || `${m.user?.displayName || ''} ${m.user?.username || ''}`.toLowerCase().includes(q);
          return (
            <>
              <div className="xl:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setShowMemberPanel(false)} />
              <aside aria-label="Members" className="fixed xl:static inset-y-0 right-0 z-50 xl:z-auto w-72 xl:w-64 max-w-[85vw] shrink-0 flex flex-col border-l border-foreground/10 bg-background shadow-2xl xl:shadow-none">
                <div className="h-14 px-4 shrink-0 flex items-center justify-between border-b border-foreground/10">
                  <h2 className="text-sm font-semibold">Members <span className="font-normal text-foreground/50">· {onlineCount} online</span></h2>
                  <button onClick={() => setShowMemberPanel(false)} aria-label="Close members" className="p-1.5 -mr-1.5 rounded-lg text-foreground/50 hover:bg-foreground/10"><X size={16} /></button>
                </div>
                <div className="p-3 shrink-0">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/40" />
                    <input value={panelSearch} onChange={e => setPanelSearch(e.target.value)} placeholder="Search members" aria-label="Search members"
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-foreground/5 text-sm outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-foreground/35" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pb-4">
                  {isAdmin && pendingRequests.length > 0 && !q && (
                    <button
                      onClick={() => { setShowMemberPanel(false); setActiveTab('settings'); setMobilePane('content'); setSearchParams({ view: 'community', id: communityId, settings: 'members' }); }}
                      className="mx-3 mb-4 w-[calc(100%-1.5rem)] flex items-center gap-2.5 p-3 rounded-2xl bg-primary/10 text-left hover:bg-primary/15 transition-colors"
                    >
                      <UserPlus size={18} className="text-primary shrink-0" />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-semibold">{pendingRequests.length} join {pendingRequests.length === 1 ? 'request' : 'requests'}</span>
                        <span className="block text-xs text-foreground/55">Review and approve</span>
                      </span>
                    </button>
                  )}
                  {roleOrder.map(role => {
                    const list = [...(groupedMembers[role] || [])].filter(matches).sort((x, y) => Number(isOnline(y)) - Number(isOnline(x)));
                    if (list.length === 0) return null;
                    return (
                      <section key={role} className="mb-4">
                        <h3 className="px-4 mb-1 text-xs font-semibold text-foreground/45">{roleLabels[role]} · {list.length}</h3>
                        {list.map(member => (
                          <MemberRow key={member.id} member={member} roles={roles} online={isOnline(member)} now={now} />
                        ))}
                      </section>
                    );
                  })}
                  {q && members.every(m => !matches(m)) && <p className="px-4 py-6 text-sm text-center text-foreground/45">No one matches "{panelSearch}".</p>}
                </div>
              </aside>
            </>
          );
        })()}
</div>
      <ConfirmModal 
        isOpen={showChannelDeleteConfirm}
        onClose={() => {
          setShowChannelDeleteConfirm(false);
          setChannelToDelete(null);
        }}
        onConfirm={handleDeleteChannel}
        title="Delete Channel"
        message="Are you sure you want to delete this channel? All messages and content will be permanently removed. This action cannot be undone."
        confirmText="Delete Channel"
      />

      <CreateChannelModal 
        isOpen={showCreateChannel}
        onClose={() => {
          setShowCreateChannel(false);
          setSelectedCategoryId(undefined);
        }}
        communityId={communityId}
        roles={roles}
        initialCategoryId={selectedCategoryId}
      />

      <ChannelSettingsModal 
        isOpen={showChannelSettings}
        onClose={() => {
          setShowChannelSettings(false);
          setChannelToEdit(null);
        }}
        communityId={communityId}
        channel={channelToEdit}
        roles={roles}
        welcomeChannelId={community?.welcomeConfig?.channelId}
      />

      <CommunityDetailsModal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        communityId={communityId}
        onJoinSuccess={() => {
          setShowDetailsModal(false);
          queryClient.invalidateQueries({ queryKey: queryKeys.community(communityId) });
        }}
      />

      {community && myMember && (
        <MembershipRenewalPrompt
          communityId={communityId}
          communityName={community.name || 'this community'}
          member={myMember}
          onRenew={() => setShowDetailsModal(true)}
        />
      )}
    </div>
  );
}

/** Shown in place of channels when a paid membership has lapsed but is still inside grace. */
function LockedMembershipPanel({
  community,
  access,
  onRenew,
}: {
  community: any;
  access: ReturnType<typeof memberAccess>;
  onRenew: () => void;
}) {
  const fee = feeOf(community);
  const grace = access.graceDaysLeft;
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
          <Lock size={28} />
        </div>
        <h2 className="mt-4 text-2xl font-bold">Your membership has ended</h2>
        <p className="mt-2 text-sm text-foreground/65 leading-relaxed">
          {access.state === 'grace' && grace !== null
            ? `Channels are locked. You can still browse this community for ${grace} more ${grace === 1 ? 'day' : 'days'} before access is removed.`
            : 'Channels are locked. Renew your membership to rejoin the conversation.'}
        </p>
        {fee && (
          <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">
            {formatFee(fee)} · billed monthly
          </p>
        )}
        <button
          onClick={onRenew}
          className="mt-5 px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90"
        >
          Renew membership
        </button>
      </div>
    </div>
  );
}

/** Shown in place of channels to people who haven't joined. */
function JoinPanel({ community, signedIn, onJoin, onAbout, members }: { community: any; signedIn: boolean; onJoin: () => void; onAbout: () => void; members: any[] }) {
  const fee = feeOf(community);
  const realMoney = feeIsRealMoney(fee);
  const recurring = realMoney && fee.interval === 'month';
  const control = community.membershipControl;
  const needsApproval = community.isPrivate || control?.approvalRequired || (control?.accessType && control.accessType !== 'public');
  const faces = members.filter(m => m.user).slice(0, 5);
  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <CommunityIcon community={community} size={80} className="mx-auto" />
        <h2 className="mt-4 text-2xl font-bold">{community.name}</h2>
        {community.description && <p className="mt-2 text-foreground/65 leading-relaxed">{community.description}</p>}
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground/60">
          {faces.length > 0 && (
            <span className="flex -space-x-2">
              {faces.map(m => (
                <span key={m.id} className="rounded-full ring-2 ring-background"><Avatar src={m.user.profileImage || m.user.photoURL} seed={m.id} size={28} /></span>
              ))}
            </span>
          )}
          <span>{community.memberCount || 0} members</span>
        </div>
        <div className="mt-6 p-4 rounded-2xl border border-foreground/10 text-sm text-foreground/65">
          {needsApproval ? 'This is a private community. Send a request and the admins will review it.' : 'Join to see the channels, chat with members and post in the feed.'}
          {fee && (
            <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
              Joining fee: {formatFee(fee)}{realMoney ? (recurring ? ' · card billed monthly, leave to cancel' : ' · paid by card') : ''}
            </span>
          )}
        </div>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={onAbout} className="px-5 py-2.5 rounded-full border border-foreground/15 text-sm font-semibold hover:bg-foreground/5">About</button>
          {signedIn ? (
            <button onClick={onJoin} className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">
              {needsApproval ? 'Request to join' : realMoney ? 'Join & pay' : 'Join community'}
            </button>
          ) : (
            <Link to="/login" className="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90">Sign in to join</Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, roles, online, now }: { member: any; roles: any[]; online: boolean; now: number }) {
  const u = member.user;
  const name = u?.displayName || u?.username || 'Member';
  const customRoles = (member.customRoles || []).map((rid: string) => roles.find(r => r.id === rid)).filter(Boolean);
  const presence = presenceLabel(u?.lastActiveAt, now, u);
  return (
    <UserHoverCard userId={member.id}>
      <div className={`mx-2 flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-foreground/5 transition-colors cursor-pointer ${online ? '' : 'opacity-70'}`}>
        <span className="relative shrink-0">
          <Avatar src={u?.profileImage || u?.photoURL} seed={member.id} size={32} />
          {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-background" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate" style={customRoles[0]?.color ? { color: customRoles[0].color } : undefined}>{name}</span>
          <span className="block text-[11px] text-foreground/45 truncate">
            {customRoles.length ? customRoles.map((r: any) => r.name).join(' · ') : presence && !online ? presence : u?.username ? `@${u.username}` : ''}
          </span>
        </span>
      </div>
    </UserHoverCard>
  );
}
