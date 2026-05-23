import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, increment, updateDoc, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { 
  Users, Settings, Plus, MessageSquare, Shield, UserPlus, UserMinus, 
  Info, Calendar, Hash, Lock, Search, MoreVertical, Trash2, 
  ShieldAlert, ShieldCheck, UserCog, Save, Globe, Twitter, 
  Github, Linkedin, ExternalLink, AlertCircle, Image as ImageIcon, Link as LinkIcon,
  Upload, Layout, Clock, Trophy, BarChart3, Bell, Pin, ChevronRight, Copy, Check
} from 'lucide-react';
import UserHoverCard from './UserHoverCard';
import ChannelSidebar from './ChannelSidebar';
import ChannelView from './ChannelView';
import CreateChannelModal from './CreateChannelModal';
import ChannelSettingsModal from './ChannelSettingsModal';
import CommunityEvents from './CommunityEvents';
import CommunityLeaderboard from './CommunityLeaderboard';
import CommunityAnalytics from './CommunityAnalytics';
import VoiceChannelView from './VoiceChannelView';
import LiveStreamView from './LiveStreamView';
import CommunityInviteModal from './CommunityInviteModal';
import ConfirmModal from './ConfirmModal';
import CommunitySettingsCenter from './CommunitySettingsCenter';
import CommunityDetailsModal from './CommunityDetailsModal';
import { updateDailyStats } from '../lib/stats';
import { formatDate } from '../lib/utils';
import VerifiedBadge from './VerifiedBadge';

export default function CommunityView({ communityId }: { communityId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  const { data: community, isLoading: communityLoading } = useQuery({
    queryKey: ['community', communityId],
    queryFn: async () => {
      const docSnap = await getDoc(doc(db, 'communities', communityId));
      if (!docSnap.exists()) return null;
      return { id: docSnap.id, ...docSnap.data() } as any;
    },
    enabled: !!communityId,
  });

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ['community-channels', communityId],
    queryFn: async () => {
      const q = query(
        collection(db, 'communities', communityId, 'channels'),
        orderBy('order', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    },
    enabled: !!communityId,
  });

  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
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
  const [memberSearch, setMemberSearch] = useState('');
  const [activeMemberMenu, setActiveMemberMenu] = useState<string | null>(null);
  const [creator, setCreator] = useState<any>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backdropInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [userChannelStats, setUserChannelStats] = useState<Record<string, number>>({});
  const [userMentions, setUserMentions] = useState<Record<string, number>>({});
  const [mentionsUnsubscribe, setMentionsUnsubscribe] = useState<(() => void) | null>(null);
  const [showKickConfirm, setShowKickConfirm] = useState(false);
  const [memberToKickId, setMemberToKickId] = useState<string | null>(null);
  const [kicking, setKicking] = useState(false);
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
          setIsMember(true);
          setIsOwner(myMember.role === 'owner');
          setIsAdmin(myMember.role === 'admin' || myMember.role === 'owner' || myMember.role === 'moderator' || (myMember.permissions || []).includes('moderate_chat'));
          setMyPermissions(myMember.permissions || []);
          setMyCustomRoles(myMember.customRoles || []);
          setHiddenChannels(myMember.hiddenChannels || []);
          setMutedChannels(myMember.mutedChannels || []);
        } else {
          setIsMember(false);
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

    const unsubscribeMembers = onSnapshot(collection(db, 'communities', communityId, 'members'), async (snapshot) => {
      // Basic members list without user profiles initially for speed
      const basicMembers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMembers(basicMembers);

      // Fetch user profiles in background - only when needed or gradually
      // For now, let's just optimize the existing one to not block
      (async () => {
        const memberData = await Promise.all(snapshot.docs.map(async (d) => {
          const userDoc = await getDoc(doc(db, 'users', d.id));
          return { 
            id: d.id, 
            ...d.data(), 
            user: userDoc.exists() ? userDoc.data() : null 
          };
        }));
        setMembers(memberData);
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
        if (!mentionsUnsubscribe) {
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
          setMentionsUnsubscribe(() => unsub);
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
      if (mentionsUnsubscribe) mentionsUnsubscribe();
    };
  }, [communityId, mentionsUnsubscribe]);

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

    queryClient.setQueryData(['community-channels', communityId], finalChannels);

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
      const storageRef = ref(storage, `communities/${communityId}/${auth.currentUser.uid}/${type}_${Date.now()}_${file.name}`);
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
      await deleteDoc(doc(db, 'communities', communityId, 'channels', channelToDelete));
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
      const memberRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid);
      const communityRef = doc(db, 'communities', communityId);

      if (isMember) {
        if (isOwner) {
          toast.error("Owners cannot leave. Please transfer ownership first.");
          return;
        }
        await deleteDoc(memberRef);
        await updateDoc(communityRef, { memberCount: increment(-1) });
        toast.success(`Left ${community.name}`);
        setSearchParams({ view: 'communities' });
      } else {
        // Check for paid entry or private/approval status
        const control = community.membershipControl;
        const isPrivateFlag = community.isPrivate || (control?.accessType && control?.accessType !== 'public') || control?.approvalRequired;
        const isPaid = community.isPaid && community.price > 0;
        const hasOnboarding = control?.onboardingQuestions?.length > 0;

        if (isPrivateFlag || isPaid || hasOnboarding) {
          setShowDetailsModal(true);
          return;
        }

        await setDoc(memberRef, {
          userId: auth.currentUser.uid,
          role: 'member',
          joinedAt: serverTimestamp()
        });
        await updateDoc(communityRef, { memberCount: increment(1) });
        toast.success(`Joined ${community.name}`);
      }
    } catch (error) {
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

  const updateMemberRole = async (userId: string, newRole: string) => {
    if (!isAdmin || !communityId) return;
    try {
      const memberRef = doc(db, 'communities', communityId, 'members', userId);
      await updateDoc(memberRef, { role: newRole });
      setActiveMemberMenu(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/members/${userId}`);
    }
  };

  const kickMember = (userId: string) => {
    setMemberToKickId(userId);
    setShowKickConfirm(true);
    setActiveMemberMenu(null);
  };

  const confirmKickMember = async () => {
    if (!isAdmin || !communityId || !memberToKickId) return;
    setKicking(true);
    try {
      const memberRef = doc(db, 'communities', communityId, 'members', memberToKickId);
      const communityRef = doc(db, 'communities', communityId);
      await deleteDoc(memberRef);
      await updateDoc(communityRef, { memberCount: increment(-1) });
      setShowKickConfirm(false);
      setMemberToKickId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/members/${memberToKickId}`);
    } finally {
      setKicking(false);
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
  const filteredMembers = members.filter(m => 
    m.user?.username?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.role.toLowerCase().includes(memberSearch.toLowerCase())
  );

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
        isOpen={showKickConfirm}
        onClose={() => setShowKickConfirm(false)}
        onConfirm={confirmKickMember}
        title="Remove Member"
        message="Are you sure you want to remove this member from the community?"
        confirmText="Remove Member"
        loading={kicking}
      />

      <CommunityDetailsModal 
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        communityId={communityId}
      />

      {showInviteModal && community && (
        <CommunityInviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          communityId={community.id}
          communityName={community.name}
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
      <div className="flex-1 flex overflow-hidden rounded-[32px] border border-foreground/10 bg-background/50 backdrop-blur-md">
        {/* Left Sidebar: Channels */}
        <div className="w-64 flex flex-col border-r border-foreground/10 bg-foreground/5">
          {/* Community Header in Sidebar */}
          <div className="relative">
            <div 
              onClick={() => isMember && setShowCommunityMenu(!showCommunityMenu)}
              className="p-4 border-b border-foreground/10 flex items-center justify-between group cursor-pointer hover:bg-foreground/5 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-foreground/10">
                  <img 
                    src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/100/100`} 
                    alt="" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-sm truncate">{community.name}</h2>
                  <p className="text-[10px] text-foreground/50 truncate">{community.memberCount} members</p>
                </div>
              </div>
              {isMember ? (
                <MoreVertical size={16} className="text-foreground/40 group-hover:text-foreground transition-all" />
              ) : (
                <button 
                  onClick={handleJoinLeave}
                  className="p-1.5 bg-primary text-primary-foreground rounded-lg shadow-[0_0_10px_rgba(139,92,246,0.5)] hover:scale-110 transition-all"
                >
                  <UserPlus size={14} />
                </button>
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
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-foreground/50 hover:bg-foreground/5 hover:text-foreground'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'channels' && (
              <div className="pt-4 border-t border-foreground/10">
                <ChannelSidebar 
                  communityId={communityId}
                  channels={channels}
                  activeChannelId={activeChannelId}
                  onChannelSelect={setActiveChannelId}
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
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/20">Upcoming Events</h3>
                  <button 
                    onClick={() => setActiveTab('events')}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    See All
                  </button>
                </div>
                <div className="space-y-2">
                  {upcomingEvents.map(event => (
                    <Link 
                      key={event.id} 
                      to={`/events/${event.id}`}
                      className="block p-2 rounded-xl bg-foreground/5 border border-foreground/5 hover:border-primary/30 hover:bg-foreground/10 transition-all group"
                    >
                      <div className="flex flex-col gap-1">
                        <h4 className="text-[11px] font-bold truncate group-hover:text-primary transition-colors text-foreground">{event.title}</h4>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[9px] text-foreground/40">
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
                          <span className={`text-[9px] font-bold ${event.isPaid ? 'text-yellow-500' : 'text-green-500'}`}>
                            {event.isPaid ? `$${event.price}` : 'FREE'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User Profile in Sidebar Footer */}
          <div className="p-3 bg-background/40 border-t border-foreground/5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-foreground/10 overflow-hidden flex-shrink-0">
                <img 
                  src={
                    (currentUserProfile?.profileImage && currentUserProfile.profileImage.trim() !== '') ? currentUserProfile.profileImage : 
                    (auth.currentUser?.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : 
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`
                  } 
                  alt="" 
                  referrerPolicy="no-referrer" 
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{currentUserProfile?.displayName || auth.currentUser?.displayName || 'User'}</p>
                <p className="text-[10px] text-foreground/40 truncate">@{currentUserProfile?.username || auth.currentUser?.email?.split('@')[0] || 'user'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1.5 hover:bg-foreground/10 rounded-lg text-foreground/40 hover:text-foreground transition-all">
                <Settings size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Middle Content: Chat or Tab Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-background/5">
          <div className="h-16 px-6 border-b border-foreground/5 flex items-center justify-between bg-background/5 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                {activeTab === 'channels' ? <Hash size={18} /> : (
                  activeTab === 'leaderboard' ? <Trophy size={18} /> : (
                    activeTab === 'analytics' ? <BarChart3 size={18} /> : <Info size={18} />
                  )
                )}
              </div>
              <div>
                <h2 className="font-black text-xl tracking-tight">
                  {activeTab === 'channels' ? (activeChannel?.name || 'Select Channel') : (activeTab.charAt(0).toUpperCase() + activeTab.slice(1))}
                </h2>
                {activeTab === 'channels' && activeChannel?.description && (
                  <p className="text-xs text-foreground/40 truncate max-w-[400px] font-medium">{activeChannel.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
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

                  <button 
                    className="p-2 hover:bg-foreground/5 rounded-xl text-foreground/40 hover:text-foreground transition-all"
                    title="Notification Settings"
                  >
                    <Bell size={18} />
                  </button>
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

              {activeTab === 'channels' && (
                <button 
                  onClick={() => setActiveTab('about')}
                  className="p-2 hover:bg-foreground/5 rounded-xl text-foreground/40 hover:text-foreground transition-all"
                  title="About Community"
                >
                  <Info size={18} />
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
            activeChannel ? (
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
                  communityMembers={members}
                  roles={roles}
                  onOpenSettings={() => {
                    setChannelToEdit(activeChannel);
                    setShowChannelSettings(true);
                  }}
                />
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-20 text-center text-foreground/30">
                <Hash size={64} className="mb-4 opacity-10 text-foreground" />
                <p>Select a channel to start chatting</p>
              </div>
            )
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'events' && <CommunityEvents communityId={communityId} isAdmin={isAdmin} isMember={isMember} />}
              {activeTab === 'leaderboard' && <CommunityLeaderboard communityId={communityId} />}
              {activeTab === 'analytics' && <CommunityAnalytics communityId={communityId} />}
              {activeTab === 'about' && (
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="relative h-64 rounded-3xl overflow-hidden border border-foreground/10 group">
                  <img src={(community.backdrop && community.backdrop.trim() !== '') ? community.backdrop : `https://picsum.photos/seed/${community.id}_bg/1200/400`} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                    <div className="absolute bottom-8 left-8 flex items-end gap-6">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-background shadow-2xl shrink-0">
                          <img src={(community.image && community.image.trim() !== '') ? community.image : `https://picsum.photos/seed/${community.id}/200/200`} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="mb-1 space-y-1">
                        <div className="flex items-center gap-3">
                          <h1 className="text-3xl font-black tracking-tight">{community.name}</h1>
                          <div className="px-2 py-1 bg-primary text-primary-foreground text-[10px] font-black uppercase rounded-lg shadow-lg">
                            {community.category || 'General'}
                          </div>
                        </div>
                        <p className="text-sm text-foreground/60 flex items-center gap-2">
                          <Users size={14} className="text-primary" />
                          <span className="font-bold">{community.memberCount || 0}</span> members connected
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="glass rounded-[32px] p-8 space-y-6 border border-foreground/5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                          <Info size={120} />
                        </div>
                        <div>
                          <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Mission & Description</h3>
                          <p className="text-lg text-foreground/70 leading-relaxed font-medium">{community.description || 'No description provided.'}</p>
                        </div>

                        <div className="pt-6 border-t border-foreground/5 grid grid-cols-2 md:grid-cols-3 gap-6">
                          <div>
                            <p className="text-[10px] font-black text-foreground/30 uppercase tracking-widest mb-1">Created</p>
                            <p className="text-sm font-bold text-foreground/80">{formatDate(community.createdAt, 'MMMM yyyy')}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-foreground/30 uppercase tracking-widest mb-1">Status</p>
                            <p className="text-sm font-bold text-green-500 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-foreground/30 uppercase tracking-widest mb-1">Visibility</p>
                            <p className="text-sm font-bold text-foreground/80 flex items-center gap-1.5">
                              {community.isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                              {community.isPrivate ? 'Private' : 'Public'}
                            </p>
                          </div>
                        </div>

                        {community.rules?.length > 0 && (
                          <div className="pt-8 border-t border-foreground/5">
                            <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-6">Community Guidelines</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {community.rules.map((rule: string, i: number) => (
                                <div key={i} className="flex gap-4 p-5 rounded-2xl bg-foreground/5 border border-foreground/5 hover:border-primary/20 transition-all group">
                                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black shrink-0 group-hover:scale-110 transition-transform">
                                    {i + 1}
                                  </div>
                                  <p className="text-sm text-foreground/60 leading-relaxed font-medium">{rule}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {/* Join Link Card */}
                      <div className="glass rounded-[32px] p-6 border border-primary/20 bg-primary/5 space-y-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-24 h-24 bg-primary opacity-10 rounded-full blur-3xl" />
                        <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                          <LinkIcon size={14} /> Share Community
                        </h3>
                        <p className="text-[11px] text-foreground/50 leading-relaxed font-medium">Use this permanent link to invite others to join the community.</p>
                        <div className="relative group">
                          <input 
                            readOnly 
                            value={`${window.location.origin}/community/${communityId}`}
                            className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-xs font-mono text-foreground/60 pr-12 focus:border-primary transition-all cursor-default"
                          />
                          <button 
                            onClick={copyGeneralLink}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${copiedLink ? 'bg-green-500 text-white' : 'hover:bg-primary/20 text-primary'}`}
                          >
                            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Owner Card */}
                      {creator && (
                        <div className="glass rounded-[32px] p-6 border border-foreground/5 space-y-4">
                          <h3 className="text-xs font-black text-foreground/30 uppercase tracking-widest">Community Owner</h3>
                          <Link to={`/creators/${creator.id}`} className="flex items-center gap-4 p-2 rounded-2xl hover:bg-foreground/5 transition-all group">
                            <div className="w-12 h-12 rounded-full overflow-hidden border border-foreground/10 group-hover:border-primary transition-colors">
                          <img 
                            src={
                              (creator.user?.profileImage && creator.user.profileImage.trim() !== '') ? creator.user.profileImage : 
                              (creator.user?.photoURL && creator.user.photoURL.trim() !== '') ? creator.user.photoURL : 
                              `https://api.dicebear.com/7.x/avataaars/svg?seed=${creator.id}`
                            } 
                            alt="" 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate flex items-center gap-1">
                                  <span>{creator.user?.displayName || 'Anonymous Creator'}</span>
                                  <VerifiedBadge verified={creator.user?.verified} />
                                </p>
                                <p className="text-xs text-foreground/40 font-medium">@{creator.user?.username || 'creator'}</p>
                            </div>
                          </Link>
                        </div>
                      )}

                      {/* Social Links Card */}
                      <div className="glass rounded-[32px] p-6 border border-foreground/5 space-y-4">
                        <h3 className="text-xs font-black text-foreground/30 uppercase tracking-widest">Connect & Links</h3>
                        <div className="space-y-2">
                          {community.website && (
                            <a href={community.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all group">
                              <Globe size={16} className="text-primary" />
                              <span className="text-xs font-bold flex-1">Website</span>
                              <ExternalLink size={14} className="text-foreground/20 group-hover:text-primary" />
                            </a>
                          )}
                          {community.socials?.twitter && (
                            <a href={`https://twitter.com/${community.socials.twitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all group">
                              <Twitter size={16} className="text-sky-400" />
                              <span className="text-xs font-bold flex-1">Twitter</span>
                              <ExternalLink size={14} className="text-foreground/20 group-hover:text-sky-400" />
                            </a>
                          )}
                          {community.socials?.github && (
                            <a href={`https://github.com/${community.socials.github}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all group">
                              <Github size={16} className="text-foreground" />
                              <span className="text-xs font-bold flex-1">GitHub</span>
                              <ExternalLink size={14} className="text-foreground/20 group-hover:text-foreground" />
                            </a>
                          )}
                          {community.socials?.linkedin && (
                            <a href={`https://linkedin.com/in/${community.socials.linkedin}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all group">
                              <Linkedin size={16} className="text-blue-600" />
                              <span className="text-xs font-bold flex-1">LinkedIn</span>
                              <ExternalLink size={14} className="text-foreground/20 group-hover:text-blue-600" />
                            </a>
                          )}
                          {community.socials?.discord && (
                            <a href={community.socials.discord} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-all group">
                                <Users size={16} className="text-indigo-500" />
                                <span className="text-xs font-bold flex-1">Discord</span>
                                <ExternalLink size={14} className="text-foreground/20 group-hover:text-indigo-500" />
                            </a>
                          )}
                          {!community.website && !community.socials?.twitter && !community.socials?.github && !community.socials?.linkedin && !community.socials?.discord && (
                            <p className="text-[10px] text-foreground/30 text-center py-4 font-black uppercase tracking-widest italic">No external links linked</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'members' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">Members</h2>
                      <p className="text-sm text-foreground/40">{community.memberCount} total members connected</p>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" size={18} />
                      <input 
                        type="text"
                        placeholder="Search members..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="bg-foreground/5 border border-foreground/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-primary outline-none transition-all w-64 text-foreground mb-0 placeholder:text-foreground/20"
                      />
                    </div>
                  </div>

                  <div className="glass rounded-[2rem] overflow-hidden border border-foreground/5 shrink-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-foreground/5">
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-foreground/30">User</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-foreground/30">Roles</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-foreground/30">Joined</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-foreground/30 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-foreground/5">
                          {filteredMembers.map((member) => (
                            <tr key={member.id} className="group hover:bg-foreground/2 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <UserHoverCard userId={member.id}>
                                    <div className="w-10 h-10 rounded-full bg-foreground/10 overflow-hidden cursor-pointer border border-foreground/5 hover:border-primary/50 transition-all">
                                        <img 
                                          src={
                                          (member.user?.profileImage && member.user.profileImage.trim() !== '') ? member.user.profileImage : 
                                          (member.user?.photoURL && member.user.photoURL.trim() !== '') ? member.user.photoURL : 
                                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`
                                        } 
                                        alt="" 
                                        referrerPolicy="no-referrer" 
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  </UserHoverCard>
                                  <div>
                                    <p className="text-sm font-bold text-foreground flex items-center gap-1">
                                      <span>{member.user?.displayName || member.user?.username || 'Anonymous'}</span>
                                      <VerifiedBadge verified={member.user?.verified} />
                                    </p>
                                    <p className="text-[10px] text-foreground/40 font-medium">@{member.user?.username}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1.5">
                                  {/* Global Role */}
                                  <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                    member.role === 'owner' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                    member.role === 'admin' ? 'bg-red-400/10 text-red-400 border-red-400/20' :
                                    member.role === 'moderator' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20' :
                                    'bg-foreground/10 text-foreground/40 border-foreground/20'
                                  }`}>
                                    {member.role}
                                  </div>
                                  
                                  {/* Custom Roles */}
                                  {(member.customRoles || []).map((rid: string) => {
                                    const r = roles.find(role => role.id === rid);
                                    if (!r) return null;
                                    return (
                                      <div key={rid} className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border" style={{ backgroundColor: `${r.color}15`, color: r.color, borderColor: `${r.color}30` }}>{r.name}</div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-xs text-foreground/60 font-medium">
                                  {formatDate(member.joinedAt, 'MMM d, yyyy')}
                                </p>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isAdmin && member.id !== auth.currentUser?.uid && (
                                  <div className="relative inline-block text-left">
                                    <button 
                                      onClick={() => setActiveMemberMenu(activeMemberMenu === member.id ? null : member.id)}
                                      className="p-2 hover:bg-foreground/5 rounded-xl text-foreground/40 hover:text-foreground transition-all"
                                    >
                                      <MoreVertical size={16} />
                                    </button>
                                    <AnimatePresence>
                                      {activeMemberMenu === member.id && (
                                        <motion.div
                                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                          animate={{ opacity: 1, scale: 1, y: 0 }}
                                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                          className="absolute right-0 top-full mt-2 w-48 bg-background rounded-xl border border-foreground/10 shadow-2xl z-50 overflow-hidden"
                                        >
                                          {isOwner && (
                                            <>
                                              <button 
                                                onClick={() => updateMemberRole(member.id, 'admin')}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-xs text-foreground/70 hover:bg-foreground/5 transition-colors text-left"
                                              >
                                                Make Admin
                                              </button>
                                              <button 
                                                onClick={() => updateMemberRole(member.id, 'moderator')}
                                                className="w-full flex items-center gap-2 px-4 py-3 text-xs text-foreground/70 hover:bg-foreground/5 transition-colors text-left"
                                              >
                                                Make Moderator
                                              </button>
                                              <div className="h-[1px] bg-foreground/5" />
                                            </>
                                          )}
                                          <button 
                                            onClick={() => kickMember(member.id)}
                                            className="w-full flex items-center gap-2 px-4 py-3 text-xs text-red-400 hover:bg-red-400/10 transition-colors text-left"
                                          >
                                            Kick Member
                                          </button>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
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

        {/* Right Sidebar: Members (Discord-style) */}
        {activeTab === 'channels' && (
          <div className="w-60 flex flex-col border-l border-foreground/5 bg-background/5 overflow-y-auto p-4 space-y-6">
            {/* Admin Roles */}
            {['owner', 'admin', 'moderator'].map(role => {
              const roleMembers = groupedMembers[role] || [];
              if (roleMembers.length === 0) return null;

              return (
                <div key={role} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 px-2">
                    {roleLabels[role]} — {roleMembers.length}
                  </h3>
                  <div className="space-y-1">
                    {roleMembers.map(member => (
                      <UserHoverCard key={member.id} userId={member.id}>
                        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-all cursor-pointer group">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-foreground/10 overflow-hidden">
                              <img 
                                src={
                                  (member.user?.profileImage && member.user.profileImage.trim() !== '') ? member.user.profileImage :
                                  (member.user?.photoURL && member.user.photoURL.trim() !== '') ? member.user.photoURL : 
                                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`
                                } 
                                alt="" 
                              />
                            </div>
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-col">
                              <p className={`text-sm font-medium truncate ${
                                role === 'owner' ? 'text-yellow-500' : 
                                role === 'admin' ? 'text-red-400' : 
                                'text-foreground/70 group-hover:text-foreground'
                              }`} style={(() => {
                                 const memberRoles = (member.customRoles || []).map((rid: string) => roles.find(r => r.id === rid)).filter(Boolean);
                                 if (memberRoles.length > 0) {
                                   return { color: memberRoles[0].color };
                                 }
                                 return {};
                              })()}>
                                {member.user?.username || 'Anonymous'}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {(member.customRoles || []).map((rid: string) => {
                                  const r = roles.find(role => role.id === rid);
                                  if (!r) return null;
                                  return (
                                    <div key={rid} className="px-1 py-0.5 rounded-[4px] text-[7px] font-black uppercase" style={{ backgroundColor: `${r.color}15`, color: r.color }}>{r.name}</div>
                                  );
                                })}
                              </div>
                            </div>
                            {member.user?.status && (
                              <p className="text-[10px] text-foreground/40 truncate mt-1">{member.user.status}</p>
                            )}
                          </div>
                        </div>
                      </UserHoverCard>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Join Requests Section */}
            {isAdmin && pendingRequests.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary px-2 flex items-center justify-between">
                  Join Requests
                  <span className="bg-primary text-white text-[9px] px-1.5 rounded-full animate-pulse">{pendingRequests.length}</span>
                </h3>
                <div className="space-y-1 px-1">
                  {pendingRequests.map(req => (
                    <div 
                      key={req.id} 
                      onClick={() => {
                        setActiveTab('settings');
                        setSearchParams({ view: 'community', id: communityId, settings: 'members' });
                      }}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-all cursor-pointer group shadow-sm"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/20 overflow-hidden shrink-0 border border-primary/20">
                        <img 
                          src={(req.userPhoto && req.userPhoto.trim() !== '') ? req.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.userId}`} 
                          alt="" 
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
                          {req.userName || 'Anonymous'}
                        </p>
                        <p className="text-[9px] text-foreground/40 font-black uppercase tracking-tighter">Wants to join</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* General Members */}
            {(() => {
              const role = 'member';
              const roleMembers = groupedMembers[role] || [];
              if (roleMembers.length === 0) return null;

              return (
                <div key={role} className="space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 px-2">
                    {roleLabels[role]} — {roleMembers.length}
                  </h3>
                  <div className="space-y-1">
                    {roleMembers.map(member => (
                      <UserHoverCard key={member.id} userId={member.id}>
                        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-all cursor-pointer group">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-foreground/10 overflow-hidden">
                              <img 
                                src={
                                  (member.user?.profileImage && member.user.profileImage.trim() !== '') ? member.user.profileImage :
                                  (member.user?.photoURL && member.user.photoURL.trim() !== '') ? member.user.photoURL : 
                                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`
                                } 
                                alt="" 
                              />
                            </div>
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-col">
                              <p className="text-sm font-medium truncate text-foreground/70 group-hover:text-foreground" style={(() => {
                                 const memberRoles = (member.customRoles || []).map((rid: string) => roles.find(r => r.id === rid)).filter(Boolean);
                                 if (memberRoles.length > 0) {
                                   return { color: memberRoles[0].color };
                                 }
                                 return {};
                              })()}>
                                {member.user?.username || 'Anonymous'}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {(member.customRoles || []).map((rid: string) => {
                                  const r = roles.find(role => role.id === rid);
                                  if (!r) return null;
                                  return (
                                    <div key={rid} className="px-1 py-0.5 rounded-[4px] text-[7px] font-black uppercase" style={{ backgroundColor: `${r.color}15`, color: r.color }}>{r.name}</div>
                                  );
                                })}
                              </div>
                            </div>
                            {member.user?.status && (
                              <p className="text-[10px] text-foreground/40 truncate mt-1">{member.user.status}</p>
                            )}
                          </div>
                        </div>
                      </UserHoverCard>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
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
      />
    </div>
  );
}
