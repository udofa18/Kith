import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart3, Shield, Users, Settings, Hash, Globe, Lock, 
  Zap, Calendar, Megaphone, Activity, MessageSquare, 
  CreditCard, Share2, Plus, Trash2, Edit3, Save, 
  ChevronRight, AlertTriangle, CheckCircle2, Info,
  Image as ImageIcon, Upload, Eye, EyeOff, UserPlus,
  ShieldAlert, ShieldCheck, Heart, Star, Target,
  Cpu, Rocket, TrendingUp, Layers, Settings2, Sliders,
  Trophy, Clock, Github, GripVertical, Loader2, Copy,
  ExternalLink, Link as LinkIcon, Flag, X, Smile, Layout,
  ChevronUp, ChevronDown, ScrollText, Gavel
} from 'lucide-react';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import ReportModal from './ReportModal';
import ConfirmModal from './ConfirmModal';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { 
  doc, onSnapshot, updateDoc, collection, query, 
  orderBy, getDocs, where, increment, serverTimestamp,
  addDoc, deleteDoc, writeBatch, limit, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'react-hot-toast';
import { formatDate } from '../lib/utils';
import { addFeePayment, canAfford, feeFields, feeOf, formatFee, validateFee, type CommunityFee } from '../lib/communityPricing';
import FeeEditor from './community/FeeEditor';
import MemberActionModal from './community/MemberActionModal';
import BansPanel from './community/BansPanel';
import AuditLogSection from './community/AuditLogSection';
import MembershipSettings from './community/MembershipSettings';
import WelcomeSettings from './community/WelcomeSettings';
import OverviewSettings from './community/OverviewSettings';
import ProfileSettings from './community/ProfileSettings';
import ChannelSettings from './community/ChannelSettings';
import SafetySettings from './community/SafetySettings';
import JoiningFeeSettings from './community/JoiningFeeSettings';
import InviteSettings from './community/InviteSettings';
import InsightsSettings from './community/InsightsSettings';
import { useMembership, memberAccess, accessDiffers, queueAudit, RANK_NONE, type Membership } from '../lib/communityRoles';
import { Reorder } from 'motion/react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';

interface CommunitySettingsCenterProps {
  communityId: string;
  onClose?: () => void;
  initialSection?: SettingsSection;
}

type SettingsSection = 
  | 'dashboard'
  | 'branding'
  | 'channels'
  | 'members'
  | 'roles'
  | 'moderation'
  | 'audit'
  | 'monetization'
  | 'growth'
  | 'automation'
  | 'insights'
  | 'advanced';

export default function CommunitySettingsCenter({ communityId, onClose, initialSection }: CommunitySettingsCenterProps) {
  const [activeTab, setActiveTab] = useState<SettingsSection>(initialSection || 'dashboard');
  const [community, setCommunity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState<any[]>([]);
  const [analyticsFilter, setAnalyticsFilter] = useState('7d');
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState({
    memberCount: 0,
    messagesCount: 0,
    totalXp: 0,
    memberChange: null as string | null,
    messageChange: null as string | null,
    xpChange: null as string | null
  });
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  
  // The community doc changes constantly (message counters), so the form is filled once.
  const formLoaded = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Form states mirrored from community data
  const [form, setForm] = useState<any>({
    name: '',
    description: '',
    category: '',
    website: '',
    image: '',
    backdrop: '',
    isPrivate: false,
    isPaid: false,
    price: 0,
    welcomeConfig: {
      enabled: false,
      channelId: '',
      message: 'Welcome {username} to {community}! 🎉',
      buttons: []
    },
    membershipControl: {
        accessType: 'public',
        approvalRequired: false,
        onboardingQuestions: [],
        memberVerificationRequired: false,
        profileCompletionRequired: false,
        autoRoles: []
    },
    socials: {
        twitter: '',
        discord: '',
        github: '',
        linkedin: ''
    },
    rules: [],
    welcomeMessage: ''
  });

  useEffect(() => {
    if (!communityId) return;

    const unsubscribe = onSnapshot(doc(db, 'communities', communityId), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setCommunity({ id: doc.id, ...data });
        setDashboardStats(prev => ({
          ...prev,
          memberCount: data.memberCount || 0,
          messagesCount: data.stats?.messagesCount || 0,
          totalXp: data.stats?.totalXp || 0
        }));
        if (formLoaded.current) { setLoading(false); return; }
        formLoaded.current = true;
        setForm({
          name: data.name || '',
          description: data.description || '',
          category: data.category || '',
          website: data.website || '',
          image: data.image || '',
          backdrop: data.backdrop || '',
          isPrivate: data.isPrivate || false,
          isPaid: data.isPaid || false,
          price: data.price || 0,
          fee: data.fee ?? null,
          welcomeConfig: data.welcomeConfig || {
            enabled: false,
            channelId: '',
            message: 'Welcome {username} to {community}! 🎉',
            buttons: []
          },
          membershipControl: data.membershipControl || {
            accessType: 'public',
            approvalRequired: false,
            onboardingQuestions: [],
            memberVerificationRequired: false,
            profileCompletionRequired: false,
            autoRoles: []
          },
          socials: data.socials || {
            twitter: '',
            discord: '',
            github: '',
            linkedin: ''
          },
          rules: data.rules || [],
          welcomeMessage: data.welcomeMessage || ''
        });
        setLoading(false);
      }
    });

    // Fetch Top Performers
    const membersQuery = query(
      collection(db, 'communities', communityId, 'members'),
      orderBy('xp', 'desc'),
      limit(5)
    );
    const unsubMembers = onSnapshot(membersQuery, async (snap) => {
      const topData = await Promise.all(snap.docs.map(async (d, i) => {
        const userDoc = await getDoc(doc(db, 'users', d.id));
        return {
          id: d.id,
          name: userDoc.exists() ? userDoc.data().displayName : 'Anonymous',
          xp: d.data().xp || 0,
          rank: i + 1
        };
      }));
      setTopPerformers(topData);
    });

    // Fetch Daily Stats for Engagement Pulse with filter support
    let days = 7;
    if (analyticsFilter === '14d') days = 14;
    else if (analyticsFilter === '30d') days = 30;
    else if (analyticsFilter === '90d') days = 90;

    const statsQuery = query(
      collection(db, 'communities', communityId, 'dailyStats'),
      orderBy('date', 'desc'),
      limit(days * 2) // Fetch double to calculate trend
    );
    const unsubStats = onSnapshot(statsQuery, (snap) => {
      if (snap.empty) {
        // No activity recorded yet: show an empty chart rather than invented numbers.
        setStats([]);
      } else {
        const allFetchedStats = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          dateOriginal: d.data().date,
          date: formatDate(new Date(d.data().date), 'MMM d')
        }));
        
        // Use only the requested range for the chart
        const chartStats = allFetchedStats.slice(0, days).reverse();
        setStats(chartStats);

        // Trend calculation
        if (allFetchedStats.length >= 2) {
          const currentPeriod = allFetchedStats.slice(0, days);
          const previousPeriod = allFetchedStats.slice(days, days * 2);

          const calculateChange = (key: string): string | null => {
            const currentSum = currentPeriod.reduce((acc, curr) => acc + (curr[key] || 0), 0);
            const previousSum = previousPeriod.reduce((acc, curr) => acc + (curr[key] || 0), 0);
            // No earlier activity to compare against, so there is no meaningful percentage.
            if (previousSum === 0) return null;
            const change = ((currentSum - previousSum) / previousSum) * 100;
            return (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
          };

          setDashboardStats(prev => ({
            ...prev,
            memberChange: calculateChange('growth'),
            messageChange: calculateChange('newMessages'),
            xpChange: calculateChange('newXp') // We'd need to track newXp in dailyStats
          }));
        }
      }
    });

    // Listen for pending requests count for badge
    const requestsQ = query(
      collection(db, 'communities', communityId, 'joinRequests'),
      where('status', '==', 'pending')
    );
    const unsubRequests = onSnapshot(requestsQ, (snap) => {
      setPendingRequestsCount(snap.size);
    });

    return () => {
      unsubscribe();
      unsubRequests();
      unsubStats();
      unsubMembers();
    };
  }, [communityId, analyticsFilter]);

  const handleSave = async (updates: any) => {
    if (!communityId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'communities', communityId), updates);
      toast.success('Settings updated successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (file: File, type: 'image' | 'backdrop') => {
    if (!file || !auth.currentUser) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `communities/${auth.currentUser.uid}/${communityId}_${type}_${Date.now()}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      await handleSave({ [type]: url });
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center h-[600px]">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const groups: { title: string; items: { id: SettingsSection; icon: any; label: string; badge?: number }[] }[] = [
    { title: 'General', items: [
      { id: 'dashboard', icon: BarChart3, label: 'Overview' },
      { id: 'branding', icon: ImageIcon, label: 'Profile' },
      { id: 'channels', icon: Layers, label: 'Channels' },
    ] },
    { title: 'People', items: [
      { id: 'members', icon: Users, label: 'Joining & members', badge: pendingRequestsCount },
      { id: 'roles', icon: Shield, label: 'Roles & permissions' },
      { id: 'moderation', icon: ShieldAlert, label: 'Safety' },
      { id: 'audit', icon: ScrollText, label: 'Audit log' },
    ] },
    { title: 'Grow', items: [
      { id: 'growth', icon: Rocket, label: 'Invites' },
      { id: 'automation', icon: Cpu, label: 'Welcome message' },
      { id: 'monetization', icon: CreditCard, label: 'Joining fee' },
      { id: 'insights', icon: TrendingUp, label: 'Insights' },
    ] },
    { title: '', items: [{ id: 'advanced', icon: Settings2, label: 'Ownership & deletion' }] },
  ];
  const all = groups.flatMap(g => g.items);
  const current = all.find(i => i.id === activeTab) ?? all[0];

  return (
    <div className="flex-1 flex flex-col xl:flex-row h-full min-h-0 text-black dark:text-white">
      {/* Phones and tablets: a scrollable row of sections */}
      <nav aria-label="Settings sections" className="xl:hidden shrink-0 -mx-4 px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-foreground/10">
        {all.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === item.id ? 'bg-primary text-white' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'
            }`}
          >
            {item.label}
            {!!item.badge && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center ${activeTab === item.id ? 'bg-white/25' : 'bg-primary text-white'}`}>{item.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Wide screens: a sidebar */}
      <nav aria-label="Settings sections" className="hidden xl:block w-60 shrink-0 border-r border-foreground/10 overflow-y-auto py-2 pr-3">
        {groups.map(group => (
          <div key={group.title || 'end'} className={group.title ? 'mb-4' : 'mt-2 pt-3 border-t border-foreground/10'}>
            {group.title && <p className="px-3 pb-1 text-xs font-semibold text-foreground/45">{group.title}</p>}
            {group.items.map(({ id, icon: Icon, label, badge }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === id ? 'bg-primary/10 text-primary' : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground'
                } ${id === 'advanced' && activeTab !== id ? 'text-red-500/80' : ''}`}
              >
                <Icon size={17} />
                <span className="flex-1 text-left">{label}</span>
                {!!badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-semibold flex items-center justify-center">{badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex-1 min-w-0 overflow-y-auto pt-5 xl:pt-0 xl:pl-8">
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
          <h2 className="text-xl font-bold xl:hidden">{current.label}</h2>
          {activeTab === 'dashboard' && (
            <OverviewSettings
              stats={stats}
              community={community}
              dashboardStats={dashboardStats}
              topPerformers={topPerformers}
              analyticsFilter={analyticsFilter}
              setAnalyticsFilter={setAnalyticsFilter}
              pendingRequestsCount={pendingRequestsCount}
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === 'branding' && <ProfileSettings form={form} setForm={setForm} saved={community} isUploading={isUploading} onUpload={handleFileUpload} onRemoveImage={type => handleSave({ [type]: '' })} onSave={handleSave} />}
          {activeTab === 'channels' && <ChannelSettings communityId={communityId} welcomeChannelId={community?.welcomeConfig?.channelId} />}
          {activeTab === 'members' && <MembershipSection communityId={communityId} community={community} form={form} setForm={setForm} onSave={handleSave} isSaving={isSaving} pendingRequestsCount={pendingRequestsCount} />}
          {activeTab === 'roles' && <PermissionsSection communityId={communityId} />}
          {activeTab === 'moderation' && <SafetySettings communityId={communityId} onNavigate={setActiveTab} />}
          {activeTab === 'audit' && <AuditLogSection communityId={communityId} />}
          {activeTab === 'monetization' && <JoiningFeeSettings communityId={communityId} community={community} />}
          {activeTab === 'growth' && <InviteSettings communityId={communityId} community={community} />}
          {activeTab === 'automation' && <WelcomeSettings communityId={communityId} communityName={community?.name || ''} saved={community?.welcomeConfig} onSave={handleSave} />}
          {activeTab === 'insights' && <InsightsSettings communityId={communityId} stats={stats} analyticsFilter={analyticsFilter} setAnalyticsFilter={setAnalyticsFilter} />}
          {activeTab === 'advanced' && <AdvancedSection communityId={communityId} community={community} />}
        </div>
      </div>
    </div>
  );
}

// --- Sub-sections ---

function MembershipSection({ communityId, community, form, setForm, onSave, isSaving, pendingRequestsCount }: any) {
    const me = useMembership(communityId);
    const [moderating, setModerating] = useState<any>(null);
    const [openAnswers, setOpenAnswers] = useState<string | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'settings' | 'requests' | 'directory' | 'bans'>('settings');
    const [requests, setRequests] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportTargetId, setReportTargetId] = useState('');
    const [reportContentSnippet, setReportContentSnippet] = useState('');


    useEffect(() => {
        if (!communityId) return;
        if (activeSubTab === 'requests') {
            const q = query(
                collection(db, 'communities', communityId, 'joinRequests'),
                where('status', '==', 'pending'),
                orderBy('createdAt', 'desc')
            );
            return onSnapshot(q, (snap) => {
                setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        } else if (activeSubTab === 'directory') {
            const q = query(
                collection(db, 'communities', communityId, 'members'),
                orderBy('joinedAt', 'desc'),
                limit(50)
            );
            return onSnapshot(q, async (snap) => {
                const enriched = await Promise.all(snap.docs.map(async (d) => {
                    const data = d.data();
                    const userDoc = await getDoc(doc(db, 'users', d.id));
                    const userData = userDoc.exists() ? userDoc.data() : {};
                    return {
                        id: d.id,
                        ...data,
                        name: userData.displayName || 'Anonymous',
                        avatar: userData.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${d.id}`
                    };
                }));
                setMembers(enriched);
            });
        }
    }, [communityId, activeSubTab]);

    const handleAssignRole = async (memberUserId: string, roleId: string, currentRoles: string[] = []) => {
        const role = roles.find(r => r.id === roleId);
        const has = currentRoles.includes(roleId);
        const newRoles = has ? currentRoles.filter(id => id !== roleId) : [...currentRoles, roleId];
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'communities', communityId, 'members', memberUserId), memberAccess(newRoles, roles));
            queueAudit(batch, communityId, {
                action: 'member.roles', targetId: memberUserId,
                targetName: members.find(m => m.id === memberUserId)?.name,
                details: `${has ? 'removed' : 'added'} ${role?.name || roleId}`,
            });
            await batch.commit();
            toast.success('Member roles updated');
        } catch (error) {
            toast.error("Couldn't update this member");
        }
    };

    useEffect(() => {
        if (!communityId) return;
        return onSnapshot(collection(db, 'communities', communityId, 'roles'), (snap) => {
            setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [communityId]);

    const handleApprove = async (request: any) => {
        try {
            const batch = writeBatch(db as any);

            // Paid communities charge the applicant now (requests aren't charged up front).
            const latest = (await getDoc(doc(db, 'communities', communityId))).data();
            const fee = feeOf(latest);
            if (fee && request.userId !== latest?.creatorId) {
                if (!(await canAfford(request.userId, fee))) {
                    toast.error(`${request.userName || 'This person'} doesn't have ${formatFee(fee)} yet, so they can't be approved.`);
                    return;
                }
                addFeePayment(batch, fee, request.userId, latest?.creatorId);
            }
            
            // Compute initial permissions from auto-roles
            const autoRoles = form.membershipControl.autoRoles || [];
            const initialPermissions = new Set<string>();
            autoRoles.forEach(rid => {
                const r = roles.find(role => role.id === rid);
                if (r && r.permissions) {
                    r.permissions.forEach((p: string) => initialPermissions.add(p));
                }
            });

            // Add as member
            const memberRef = doc(db, 'communities', communityId, 'members', request.userId);
            batch.set(memberRef, {
                userId: request.userId,
                role: 'member',
                status: 'active',
                joinedAt: serverTimestamp(),
                onboardingAnswers: request.answers || {},
                customRoles: autoRoles,
                permissions: Array.from(initialPermissions),
                // Moderators can't set rank (the rules reject it), so only admins record it.
                ...(me.isAdmin ? { rank: memberAccess(autoRoles, roles).rank } : {})
            });

            // Update request status
            const requestRef = doc(db, 'communities', communityId, 'joinRequests', request.id);
            batch.update(requestRef, { status: 'approved' });

            // Increment member count
            const communityRef = doc(db, 'communities', communityId);
            batch.update(communityRef, { memberCount: increment(1) });

            // Send join notification if welcome message exists or just first join
            try {
                const welcomeConfig = form.welcomeConfig;
                if (welcomeConfig?.enabled) {
                    const targetChannelId = welcomeConfig.channelId;
                    if (targetChannelId) {
                        const messagesRef = collection(db, 'communities', communityId, 'channels', targetChannelId, 'messages');
                        
                        // Parse variable in message
                        let welcomeText = welcomeConfig.message || `{username} joined {community}!`;
                        welcomeText = welcomeText
                            .replace(/\{username\}/g, `${request.userName || 'A new user'}`)
                            .replace(/\{community\}/g, form.name || 'the community');

                        await addDoc(messagesRef, {
                            content: welcomeText,
                            authorUid: 'system-bot',
                            authorName: 'System Bot',
                            authorPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=system-bot',
                            createdAt: serverTimestamp(),
                            type: 'welcome',
                            isBot: true,
                            buttons: welcomeConfig.buttons || []
                        });
                        
                        await updateDoc(doc(db, 'communities', communityId, 'channels', targetChannelId), {
                            lastMessage: `${request.userName || 'A new user'} joined`,
                            lastMessageAt: serverTimestamp(),
                            messageCount: increment(1)
                        });
                    }
                } else {
                    const channelsRef = collection(db, 'communities', communityId, 'channels');
                    const qc = query(channelsRef, where('name', '==', 'general'), limit(1));
                    const channelSnap = await getDocs(qc);
                    
                    if (!channelSnap.empty) {
                        const generalChannel = channelSnap.docs[0];
                        const messagesRef = collection(db, 'communities', communityId, 'channels', generalChannel.id, 'messages');
                        const welcomeText = `${request.userName || 'A new user'} just joined the community!`;
                        
                        await addDoc(messagesRef, {
                            content: welcomeText,
                            authorUid: 'system-bot',
                            authorName: 'System Bot',
                            authorPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=system-bot',
                            createdAt: serverTimestamp(),
                            type: 'welcome',
                            isBot: true
                        });

                        await updateDoc(doc(db, 'communities', communityId, 'channels', generalChannel.id), {
                            lastMessage: `${request.userName || 'A new user'} joined`,
                            lastMessageAt: serverTimestamp(),
                            messageCount: increment(1)
                        });
                    }
                }
            } catch (err) {
                console.error("Error sending welcome notification:", err);
            }

            await batch.commit();
            toast.success('Member approved');
        } catch (error) {
            toast.error('Failed to approve member');
        }
    };

    const handleReject = async (requestId: string) => {
        try {
            await updateDoc(doc(db, 'communities', communityId, 'joinRequests', requestId), {
                status: 'rejected'
            });
            toast.success('Request rejected');
        } catch (error) {
            toast.error('Failed to reject request');
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-1 bg-foreground/[0.04] p-1 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveSubTab('settings')}
                    className={`px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeSubTab === 'settings' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                >
                    Membership Settings
                </button>
                <button 
                    onClick={() => setActiveSubTab('requests')}
                    className={`px-6 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${activeSubTab === 'requests' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                >
                    Join Requests
                    {pendingRequestsCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                            {pendingRequestsCount}
                        </span>
                    )}
                </button>
                <button 
                    onClick={() => setActiveSubTab('directory')}
                    className={`px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeSubTab === 'directory' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                >
                    Member Directory
                </button>
                {me.can('manage_members') && (
                    <button 
                        onClick={() => setActiveSubTab('bans')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeSubTab === 'bans' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                    >
                        Bans
                    </button>
                )}
            </div>

            <AnimatePresence mode="wait">
                {activeSubTab === 'settings' ? (
                    <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <MembershipSettings form={form} setForm={setForm} saved={community} roles={roles} onSave={onSave} isSaving={isSaving} />
                    </motion.div>
                ) : activeSubTab === 'bans' ? (
                    <motion.div key="bans" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        <BansPanel communityId={communityId} me={me} />
                    </motion.div>
                ) : activeSubTab === 'requests' ? (
                    <motion.div 
                        key="requests"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        {requests.length === 0 ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-4 bg-foreground/[0.04] rounded-2xl border border-foreground/10">
                                <Users size={48} className="text-foreground/5" />
                                <p className="text-xs font-semibold text-foreground/20">No pending join requests</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {requests.map(req => (
                                    <div key={req.id} className="bg-foreground/[0.04] border border-foreground/10 rounded-2xl p-6 flex items-center justify-between group hover:border-primary/30 transition-all">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-foreground/10">
                                                <img src={(req.userPhoto && req.userPhoto.trim() !== '') ? req.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.userId}`} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-lg">{req.userName || 'Anonymous User'}</h4>
                                                <p className="text-xs font-semibold text-foreground/20 mt-1">
                                                    Requested {req.createdAt ? (
                                                        (() => {
                                                            try {
                                                                const date = req.createdAt.toDate ? req.createdAt.toDate() : new Date(req.createdAt);
                                                                if (!date || isNaN(date.getTime())) return 'Recently';
                                                                return formatDate(date, 'MMM d, HH:mm');
                                                            } catch (e) {
                                                                return 'Recently';
                                                            }
                                                        })()
                                                    ) : 'Recently'}
                                                </p>
                                                {req.answers && Object.keys(req.answers).length > 0 && (
                                                    <div className="mt-3">
                                                        <button
                                                            onClick={() => setOpenAnswers(open => open === req.id ? null : req.id)}
                                                            aria-expanded={openAnswers === req.id}
                                                            className="text-sm font-medium text-primary hover:underline"
                                                        >
                                                            {openAnswers === req.id ? 'Hide answers' : 'View answers'}
                                                        </button>
                                                        {openAnswers === req.id && (
                                                            <dl className="mt-2 space-y-2 text-sm">
                                                                {Object.entries(req.answers).map(([qid, answer]) => (
                                                                    <div key={qid}>
                                                                        <dt className="text-foreground/55">{(form.membershipControl?.onboardingQuestions || []).find((q: any) => q.id === qid)?.question || 'Question removed'}</dt>
                                                                        <dd className="font-medium break-words">{String(answer) || '—'}</dd>
                                                                    </div>
                                                                ))}
                                                            </dl>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => handleReject(req.id)}
                                                className="px-6 py-3 bg-red-500/10 text-red-500 rounded-xl text-xs font-semibold hover:bg-red-500 hover:text-white transition-all shadow-lg"
                                            >
                                                Reject
                                            </button>
                                            <button 
                                                onClick={() => handleApprove(req)}
                                                className="px-6 py-3 bg-green-500 text-white rounded-xl text-xs font-semibold hover:scale-105 active:scale-95 transition-all shadow-xl"
                                            >
                                                Approve
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div 
                        key="directory"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-6"
                    >
                         <div className="bg-foreground/[0.04] border border-foreground/10 rounded-2xl px-6 py-4 flex items-center gap-4">
                             <Users size={20} className="text-foreground/20" />
                             <input 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search members by hand..."
                                className="bg-transparent border-none outline-none text-sm font-bold w-full"
                             />
                         </div>

                         <div className="bg-foreground/[0.04] border border-foreground/10 rounded-2xl overflow-hidden">
                            <div className="grid grid-cols-12 gap-4 px-8 py-4 border-b border-foreground/10 bg-foreground/[0.04] text-xs font-semibold text-foreground/40">
                                <div className="col-span-5">Member</div>
                                <div className="col-span-3">Roles</div>
                                <div className="col-span-4 text-right">Settings</div>
                            </div>
                            <div className="divide-y divide-white/5">
                                {members.filter(m => (m.name || '').toLowerCase().includes(searchQuery.toLowerCase())).map(member => (
                                    <div key={member.id} className="grid grid-cols-12 gap-4 px-8 py-5 items-center hover:bg-foreground/[0.02] transition-colors group">
                                        <div className="col-span-5 flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-2xl border border-foreground/10 overflow-hidden shadow-lg flex-shrink-0">
                                                <img src={(member.avatar && member.avatar.trim() !== '') ? member.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-semibold text-sm truncate">{member.name}</h4>
                                                <p className="text-xs font-bold text-foreground/20 mt-0.5">
                                                    {member.role}
                                                    {(member.timeoutUntil?.toMillis?.() ?? 0) > Date.now() && <span className="text-amber-500 font-semibold"> · timed out</span>}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-3">
                                            <div className="flex gap-1 flex-wrap">
                                                {(member.customRoles || []).map((rid: string) => {
                                                    const r = roles.find(r => r.id === rid);
                                                    if (!r) return null;
                                                    return (
                                                        <div key={rid} className="px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: `${r.color}20`, color: r.color }}>
                                                            {r.name}
                                                        </div>
                                                    );
                                                })}
                                                {(member.customRoles || []).length === 0 && (
                                                    <span className="text-xs font-bold text-foreground/10">No roles</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="col-span-4 flex justify-end items-center gap-2">
                                            <div className="flex flex-wrap gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                {me.outranks(member) && roles.filter(r => me.canManageRole(r)).slice(0, 3).map(role => (
                                                    <button 
                                                        key={role.id}
                                                        onClick={() => handleAssignRole(member.id, role.id, member.customRoles || [])}
                                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold   border transition-all ${
                                                            (member.customRoles || []).includes(role.id)
                                                                ? 'bg-primary text-white border-primary shadow-lg'
                                                                : 'bg-foreground/[0.04] border-foreground/10 text-foreground/40 hover:text-foreground'
                                                        }`}
                                                    >
                                                        {role.name}
                                                    </button>
                                                ))}
                                            </div>
                                            {me.outranks(member) && (me.can('moderate_chat') || me.can('manage_members')) && (
                                                <button
                                                    onClick={() => setModerating(member)}
                                                    title="Timeout, remove or ban"
                                                    aria-label={`Moderate ${member.name}`}
                                                    className="w-8 h-8 rounded-xl bg-foreground/[0.04] flex items-center justify-center text-foreground/40 hover:text-primary transition-colors ml-2"
                                                >
                                                    <Gavel size={14} />
                                                </button>
                                            )}
                                            {member.id !== auth.currentUser?.uid && (
                                                <div 
                                                    onClick={() => {
                                                        setReportTargetId(member.id);
                                                        setReportContentSnippet(member.name);
                                                        setIsReportModalOpen(true);
                                                    }}
                                                    className="w-8 h-8 rounded-xl bg-foreground/[0.04] flex items-center justify-center text-foreground/20 hover:text-red-500 transition-colors cursor-pointer"
                                                >
                                                    <Flag size={14} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {members.length === 0 && (
                                    <div className="py-20 text-center text-foreground/20 font-semibold text-xs">
                                        No members found in the matrix
                                    </div>
                                )}
                            </div>
                         </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {moderating && <MemberActionModal communityId={communityId} member={moderating} me={me} onClose={() => setModerating(null)} />}

            <ReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                communityId={communityId}
                targetId={reportTargetId}
                targetType="user"
                contentSnippet={reportContentSnippet}
            />
        </div>
    );
}

const PERMISSION_GROUPS = [
    {
        title: 'Messaging',
        icon: <MessageSquare size={16} />,
        permissions: [
            { id: 'post_messages', label: 'Post messages', desc: 'Send messages in text channels' },
            { id: 'create_threads', label: 'Create threads', desc: 'Start new threads' },
            { id: 'upload_files', label: 'Upload files', desc: 'Share images and files' },
        ]
    },
    {
        title: 'Live & audio',
        icon: <Activity size={16} />,
        permissions: [
            { id: 'start_voice', label: 'Start voice', desc: 'Start voice calls' },
            { id: 'host_stream', label: 'Host stream', desc: 'Go live on the stage' },
        ]
    },
    {
        title: 'Management',
        icon: <Shield size={16} />,
        permissions: [
            { id: 'moderate_chat', label: 'Moderate chat', desc: 'Delete messages, handle reports and time out members ranked below them' },
            { id: 'manage_members', label: 'Manage members', desc: 'Remove and ban members ranked below them', warn: 'Can remove and ban members ranked below this role.' },
            { id: 'manage_roles', label: 'Manage roles', desc: 'Edit and assign roles ranked below their own', warn: 'Can edit and assign roles ranked below this role, using permissions they hold.' },
            { id: 'create_channels', label: 'Create channels', desc: 'Add channels and categories' },
            { id: 'invite_users', label: 'Invite users', desc: 'Create invite links for others' },
            { id: 'create_event', label: 'Create events', desc: 'Schedule and host community events' },
            { id: 'create_marketplace', label: 'Create marketplace items', desc: 'List items in the community shop' },
        ]
    }
];

const ROLE_COLORS = ['#8B5CF6', '#3B82F6', '#06B6D4', '#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#94A3B8'];

const pickRole = (r: any) => ({
    name: r?.name || '', description: r?.description || '', color: r?.color || '#8B5CF6',
    mentionable: !!r?.mentionable, hoisted: !!r?.hoisted, permissions: [...(r?.permissions || [])].sort()
});

async function commitInChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
    for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach(op => op(batch));
        await batch.commit();
    }
}

const BASIC_PERMISSIONS = ['post_messages', 'create_threads', 'upload_files', 'start_voice'];

function PermissionsSection({ communityId }: { communityId: string }) {
    const me = useMembership(communityId);
    const [roles, setRoles] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState<any>(null);
    const [tab, setTab] = useState<'permissions' | 'display' | 'members'>('permissions');
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingRole, setIsAddingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [memberSearch, setMemberSearch] = useState('');
    const [pendingDelete, setPendingDelete] = useState<any>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!communityId) return;
        const unsubRoles = onSnapshot(query(collection(db, 'communities', communityId, 'roles'), orderBy('order', 'asc')), snap => {
            setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        const unsubMembers = onSnapshot(query(collection(db, 'communities', communityId, 'members'), limit(500)), snap => {
            setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsubRoles(); unsubMembers(); };
    }, [communityId]);

    const selected = roles.find(r => r.id === selectedId) || null;

    useEffect(() => {
        if (!selectedId && roles.length > 0) setSelectedId(roles[0].id);
        if (selectedId && roles.length > 0 && !roles.some(r => r.id === selectedId)) setSelectedId(roles[0].id);
    }, [roles, selectedId]);

    // Reset the draft when switching roles, or when the saved role changes underneath an untouched draft.
    const selectedKey = selected ? JSON.stringify(pickRole(selected)) : '';
    useEffect(() => {
        setDraft(selected ? pickRole(selected) : null);
    }, [selectedId, selectedKey]);

    const isDirty = !!draft && !!selected && JSON.stringify({ ...draft, permissions: [...draft.permissions].sort() }) !== selectedKey;
    const memberCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        members.forEach(m => (m.customRoles || []).forEach((rid: string) => { counts[rid] = (counts[rid] || 0) + 1; }));
        return counts;
    }, [members]);

    const togglePermissions = (ids: string[], on: boolean) => {
        const next = new Set<string>(draft.permissions);
        ids.forEach(id => on ? next.add(id) : next.delete(id));
        setDraft({ ...draft, permissions: Array.from(next) });
    };

    const uid = auth.currentUser?.uid;
    const canManage = me.isAdmin || me.can('manage_roles');
    const grantable = (p: string) => me.isAdmin || me.permissions.includes(p) || BASIC_PERMISSIONS.includes(p);
    const outranksRole = !!selected && me.canManageRole(selected);
    const holdsAll = !!selected && (selected.permissions || []).every(grantable);
    const canEdit = outranksRole && holdsAll;
    const readOnlyReason = !selected || canEdit ? '' :
        !canManage ? "You don't have permission to manage roles."
            : !outranksRole ? "This role ranks at or above yours, so you can't change it."
                : "This role includes permissions you don't hold, so you can't change it.";

    /** Member docs carry denormalised permissions and rank, so rewrite any that fall out of step with the roles. */
    const memberSyncOps = (nextRoles: any[], skipIds: string[] = []) => members
        .filter(m => !skipIds.includes(m.id) && me.outranks(m))
        .flatMap(m => {
            const next = memberAccess(m.customRoles || [], nextRoles);
            if (!accessDiffers(m, next)) return [];
            if (!me.isAdmin && next.permissions.some((p: string) => !me.permissions.includes(p) && !BASIC_PERMISSIONS.includes(p))) return [];
            return [(b: ReturnType<typeof writeBatch>) => b.update(doc(db, 'communities', communityId, 'members', m.id), next)];
        });

    const handleSaveRole = async () => {
        if (!selected || !draft || !canEdit) return;
        if (!draft.name.trim()) {
            toast.error('Role name is required');
            return;
        }
        setIsSaving(true);
        try {
            const { name, description, color, mentionable, hoisted, permissions } = draft;
            const before = pickRole(selected);
            const added = permissions.filter((p: string) => !before.permissions.includes(p));
            const removed = before.permissions.filter((p: string) => !permissions.includes(p));
            const changes = [
                before.name !== name.trim() && `renamed from "${before.name}"`,
                added.length > 0 && `granted ${added.join(', ')}`,
                removed.length > 0 && `revoked ${removed.join(', ')}`,
                (before.color !== color || before.hoisted !== hoisted || before.mentionable !== mentionable || before.description !== description.trim()) && 'display settings',
            ].filter(Boolean).join('; ');
            const nextRoles = roles.map(r => r.id === selected.id ? { ...r, permissions } : r);
            await commitInChunks([
                b => {
                    b.update(doc(db, 'communities', communityId, 'roles', selected.id), { name: name.trim(), description: description.trim(), color, mentionable, hoisted, permissions, updatedAt: serverTimestamp() });
                    queueAudit(b, communityId, { action: 'role.update', targetName: name.trim(), details: changes });
                },
                ...memberSyncOps(nextRoles),
            ]);
            const affected = members.filter(m => (m.customRoles || []).includes(selected.id)).length;
            toast.success(affected ? `Role saved and applied to ${affected} member${affected === 1 ? '' : 's'}` : 'Role saved');
        } catch (error) {
            toast.error('Failed to save role');
        } finally {
            setIsSaving(false);
        }
    };

    const createRole = async (data: { name: string; color: string; permissions: string[]; description?: string; mentionable?: boolean; hoisted?: boolean }) => {
        const order = roles.reduce((max, r) => Math.max(max, (r.order ?? 0) + 1), 0);
        const ref = doc(collection(db, 'communities', communityId, 'roles'));
        const batch = writeBatch(db);
        batch.set(ref, { ...data, order, isSystem: false, createdAt: serverTimestamp() });
        queueAudit(batch, communityId, { action: 'role.create', targetName: data.name });
        await batch.commit();
        setSelectedId(ref.id);
    };

    const handleAddRole = async () => {
        if (!newRoleName.trim()) return;
        try {
            await createRole({ name: newRoleName.trim(), color: ROLE_COLORS[roles.length % ROLE_COLORS.length], permissions: [] });
            setNewRoleName('');
            setIsAddingRole(false);
            toast.success('Role created');
        } catch (error) {
            toast.error('Failed to create role');
        }
    };

    const duplicateRole = async (role: any) => {
        try {
            await createRole({
                name: `${role.name} copy`, color: role.color || '#8B5CF6', permissions: role.permissions || [],
                description: role.description || '', mentionable: !!role.mentionable, hoisted: !!role.hoisted,
            });
            toast.success('Role duplicated');
        } catch (error) {
            toast.error("Couldn't duplicate this role. You can only copy permissions you hold yourself.");
        }
    };

    const moveRole = async (roleId: string, dir: -1 | 1) => {
        const from = roles.findIndex(r => r.id === roleId);
        const to = from + dir;
        if (from < 0 || to < 0 || to >= roles.length) return;
        const next = [...roles];
        [next[from], next[to]] = [next[to], next[from]];
        const reordered = next.map((r, i) => ({ ...r, order: i }));
        const changed = reordered.filter((r, i) => roles.find(o => o.id === r.id)?.order !== i);
        try {
            await commitInChunks([
                b => {
                    changed.forEach(r => b.update(doc(db, 'communities', communityId, 'roles', r.id), { order: r.order }));
                    queueAudit(b, communityId, { action: 'role.reorder', details: `${roles[from].name} ${dir < 0 ? 'moved above' : 'moved below'} ${roles[to].name}` });
                },
                ...memberSyncOps(reordered),
            ]);
        } catch (error) {
            toast.error('Failed to reorder roles');
        }
    };

    const confirmDeleteRole = async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        try {
            const remaining = roles.filter(r => r.id !== pendingDelete.id);
            const holders = members.filter(m => (m.customRoles || []).includes(pendingDelete.id));
            await commitInChunks([
                b => {
                    b.delete(doc(db, 'communities', communityId, 'roles', pendingDelete.id));
                    queueAudit(b, communityId, { action: 'role.delete', targetName: pendingDelete.name, details: `${holders.length} member(s) lost it` });
                },
                ...holders.filter(m => me.outranks(m)).map(m => (b: ReturnType<typeof writeBatch>) =>
                    b.update(doc(db, 'communities', communityId, 'members', m.id), memberAccess((m.customRoles || []).filter((id: string) => id !== pendingDelete.id), remaining))),
            ]);
            toast.success('Role removed');
            setPendingDelete(null);
        } catch (error) {
            toast.error('Deletion failed');
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleMemberRole = async (member: any) => {
        if (!selected) return;
        const has = (member.customRoles || []).includes(selected.id);
        const customRoles = has ? member.customRoles.filter((id: string) => id !== selected.id) : [...(member.customRoles || []), selected.id];
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'communities', communityId, 'members', member.id), memberAccess(customRoles, roles));
            queueAudit(batch, communityId, { action: 'member.roles', targetId: member.id, targetName: member.name, details: `${has ? 'removed' : 'added'} ${selected.name}` });
            await batch.commit();
        } catch (error) {
            toast.error("Couldn't update this member");
        }
    };

    const filteredMembers = members
        .filter(m => (m.name || '').toLowerCase().includes(memberSearch.toLowerCase()))
        .sort((a, b) => Number((b.customRoles || []).includes(selectedId)) - Number((a.customRoles || []).includes(selectedId)) || (a.name || '').localeCompare(b.name || ''))
        .slice(0, 100);

    const tabs = [
        { id: 'permissions', label: 'Permissions' },
        { id: 'display', label: 'Display' },
        { id: 'members', label: `Members${selected ? ` (${memberCounts[selected.id] || 0})` : ''}` },
    ] as const;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold">Roles & permissions</h3>
                    <p className="text-sm text-foreground/50">Roles higher in the list are shown first. A member's permissions are the union of all their roles.</p>
                </div>
                <button
                    onClick={() => setIsAddingRole(true)}
                    disabled={!canManage}
                    className="px-4 py-2 disabled:opacity-40 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-primary/20 transition-colors"
                >
                    <Plus size={16} /> New role
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 min-h-[560px]">
                <div className="w-full lg:w-72 space-y-1">
                    {roles.map((role, i) => (
                        <div
                            key={role.id}
                            className={`group flex items-center gap-1 rounded-xl transition-colors ${selectedId === role.id ? 'bg-foreground/10' : 'hover:bg-foreground/[0.04]'}`}
                        >
                            <button onClick={() => setSelectedId(role.id)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color || '#94A3B8' }} />
                                <span className="text-sm font-medium truncate">{role.name}</span>
                                <span className="ml-auto text-xs text-foreground/40 flex items-center gap-1"><Users size={12} />{memberCounts[role.id] || 0}</span>
                            </button>
                            <div className="flex flex-col pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button aria-label="Move up" disabled={i === 0 || !me.canManageRole(role) || !me.canManageRole(roles[i - 1])} onClick={() => moveRole(role.id, -1)} className="p-0.5 text-foreground/40 hover:text-foreground disabled:opacity-20"><ChevronUp size={14} /></button>
                                <button aria-label="Move down" disabled={i === roles.length - 1 || !me.canManageRole(role) || !me.canManageRole(roles[i + 1])} onClick={() => moveRole(role.id, 1)} className="p-0.5 text-foreground/40 hover:text-foreground disabled:opacity-20"><ChevronDown size={14} /></button>
                            </div>
                        </div>
                    ))}
                    {roles.length === 0 && <p className="px-3 py-4 text-sm text-foreground/40">No roles yet. Create one to get started.</p>}

                    {isAddingRole && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
                            <input
                                autoFocus
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddRole(); if (e.key === 'Escape') setIsAddingRole(false); }}
                                placeholder="Role name"
                                className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => { setIsAddingRole(false); setNewRoleName(''); }} className="flex-1 py-2 text-sm text-foreground/50 hover:text-foreground">Cancel</button>
                                <button onClick={handleAddRole} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium">Create</button>
                            </div>
                        </motion.div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    {selected && draft ? (
                        <div className="bg-foreground/[0.04] rounded-2xl border border-foreground/10 overflow-hidden">
                            <div className="px-6 py-4 border-b border-foreground/10 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: draft.color }}>
                                        <Shield size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold truncate">{draft.name || 'Untitled role'}</p>
                                        <p className="text-xs text-foreground/40">
                                            {draft.permissions.length} permission{draft.permissions.length === 1 ? '' : 's'}
                                            {selected.isSystem && ' · Default role'}
                                            {isDirty && <span className="text-amber-500"> · Unsaved changes</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => duplicateRole(selected)} disabled={!canManage} title="Duplicate role" className="p-2 disabled:opacity-30 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/10"><Copy size={16} /></button>
                                    {!selected.isSystem && outranksRole && (
                                        <button onClick={() => setPendingDelete(selected)} title="Delete role" className="p-2 rounded-lg text-red-500/60 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>
                                    )}
                                    {isDirty && (
                                        <button onClick={() => setDraft(pickRole(selected))} className="px-3 py-2 text-sm text-foreground/50 hover:text-foreground">Discard</button>
                                    )}
                                    <button
                                        onClick={handleSaveRole}
                                        disabled={isSaving || !isDirty || !canEdit}
                                        className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-40"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                                        Save
                                    </button>
                                </div>
                            </div>

                            {readOnlyReason && (
                                <p className="px-6 py-2.5 text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400 border-b border-foreground/10">{readOnlyReason}</p>
                            )}

                            <div className="px-6 flex gap-6 border-b border-foreground/10">
                                {tabs.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-foreground/40 hover:text-foreground'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <div className="p-6">
                                {tab === 'permissions' && (
                                    <div className="space-y-8">
                                        {PERMISSION_GROUPS.map(group => {
                                            const ids = group.permissions.map(p => p.id);
                                            const allOn = ids.every(id => draft.permissions.includes(id));
                                            return (
                                                <div key={group.title} className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                                                            <span className="text-primary">{group.icon}</span>{group.title}
                                                        </div>
                                                        <button disabled={!canEdit} onClick={() => togglePermissions(ids.filter(grantable), !allOn)} className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline">
                                                            {allOn ? 'Clear all' : 'Allow all'}
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {group.permissions.map((perm: any) => {
                                                            const on = draft.permissions.includes(perm.id);
                                                            return (
                                                                <button
                                                                    key={perm.id}
                                                                    role="switch"
                                                                    aria-checked={on}
                                                                    disabled={!canEdit || (!on && !grantable(perm.id))}
                                                                    title={!grantable(perm.id) ? "You can only grant permissions you hold" : undefined}
                                                                    onClick={() => togglePermissions([perm.id], !on)}
                                                                    className={`text-left p-4 rounded-xl border transition-colors flex items-center justify-between gap-4 disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-primary/5 border-primary/30' : 'bg-foreground/[0.02] border-foreground/10 hover:border-foreground/20'}`}
                                                                >
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-medium">{perm.label}</p>
                                                                        <p className="text-xs text-foreground/50 mt-0.5">{perm.desc}</p>
                                                                        {on && perm.warn && (
                                                                            <p className="text-xs text-amber-500 mt-1.5 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{perm.warn}</p>
                                                                        )}
                                                                    </div>
                                                                    <span className={`w-9 h-5 rounded-full p-0.5 flex-shrink-0 transition-colors ${on ? 'bg-primary' : 'bg-foreground/15'}`}>
                                                                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {tab === 'display' && (
                                    <fieldset disabled={!canEdit} className="space-y-6 max-w-xl disabled:opacity-60">
                                        <label className="block space-y-1.5">
                                            <span className="text-sm font-medium">Role name</span>
                                            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={40}
                                                className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/40" />
                                        </label>
                                        <label className="block space-y-1.5">
                                            <span className="text-sm font-medium">Description</span>
                                            <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={200} rows={2}
                                                placeholder="What is this role for?"
                                                className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/40 resize-none" />
                                        </label>
                                        <div className="space-y-2">
                                            <span className="text-sm font-medium">Colour</span>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {ROLE_COLORS.map(c => (
                                                    <button key={c} aria-label={c} onClick={() => setDraft({ ...draft, color: c })}
                                                        className={`w-7 h-7 rounded-full ring-offset-2 ring-offset-background transition-shadow ${draft.color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-foreground/60' : ''}`}
                                                        style={{ backgroundColor: c }} />
                                                ))}
                                                <input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} className="w-7 h-7 rounded-full bg-transparent border-none cursor-pointer p-0" />
                                            </div>
                                        </div>
                                        {[
                                            { key: 'hoisted', label: 'Show members separately', desc: 'List members with this role in their own group in the member list.' },
                                            { key: 'mentionable', label: 'Allow anyone to mention this role', desc: 'Members can @mention the role to notify everyone who has it.' },
                                        ].map(opt => (
                                            <button key={opt.key} role="switch" aria-checked={draft[opt.key]} onClick={() => setDraft({ ...draft, [opt.key]: !draft[opt.key] })}
                                                className="w-full flex items-center justify-between gap-4 text-left">
                                                <div>
                                                    <p className="text-sm font-medium">{opt.label}</p>
                                                    <p className="text-xs text-foreground/50 mt-0.5">{opt.desc}</p>
                                                </div>
                                                <span className={`w-9 h-5 rounded-full p-0.5 flex-shrink-0 transition-colors ${draft[opt.key] ? 'bg-primary' : 'bg-foreground/15'}`}>
                                                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform ${draft[opt.key] ? 'translate-x-4' : ''}`} />
                                                </span>
                                            </button>
                                        ))}
                                    </fieldset>
                                )}

                                {tab === 'members' && (
                                    <div className="space-y-4">
                                        <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members"
                                            className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/40" />
                                        <div className="divide-y divide-foreground/5">
                                            {filteredMembers.map(m => {
                                                const has = (m.customRoles || []).includes(selected.id);
                                                return (
                                                    <div key={m.id} className="flex items-center gap-3 py-2.5">
                                                        <img src={m.avatar?.trim() ? m.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.id}`} className="w-8 h-8 rounded-full object-cover" alt="" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium truncate">{m.name || 'Member'}</p>
                                                            <p className="text-xs text-foreground/40 capitalize">{m.role}</p>
                                                        </div>
                                                        <button onClick={() => toggleMemberRole(m)}
                                                            disabled={!canEdit || !me.outranks(m)}
                                                            title={!me.outranks(m) ? "This member ranks at or above you" : undefined}
                                                            className={`disabled:opacity-40 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${has ? 'bg-foreground/10 text-foreground/70 hover:bg-red-500/10 hover:text-red-500' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}>
                                                            {has ? 'Remove' : 'Add'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {filteredMembers.length === 0 && <p className="py-6 text-sm text-center text-foreground/40">No members found.</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-3 rounded-2xl border border-foreground/10 text-foreground/40">
                            <ShieldAlert size={36} />
                            <p className="text-sm">Select a role to edit</p>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                onConfirm={confirmDeleteRole}
                loading={isDeleting}
                title={`Delete "${pendingDelete?.name}"?`}
                message={`This removes the role from ${memberCounts[pendingDelete?.id] || 0} member(s) and revokes the permissions it granted. This can't be undone.`}
                confirmText="Delete role"
            />
        </div>
    );
}

function AdvancedSection({ communityId, community }: { communityId: string; community: any }) {
    const me = auth.currentUser?.uid;
    const isCreator = community?.creatorId === me;
    const [members, setMembers] = useState<any[]>([]);
    const [target, setTarget] = useState('');
    const [confirmTransfer, setConfirmTransfer] = useState(false);
    const [deleteText, setDeleteText] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!isCreator) return;
        getDocs(collection(db, 'communities', communityId, 'members')).then(async snap => {
            const rows = await Promise.all(snap.docs.filter(d => d.id !== me).map(async d => {
                const u = (await getDoc(doc(db, 'users', d.id)).catch(() => null))?.data();
                return { id: d.id, role: d.data().role, name: u?.displayName || u?.username || 'Member', username: u?.username || '' };
            }));
            setMembers(rows.sort((x, y) => (x.role === 'admin' ? -1 : 0) - (y.role === 'admin' ? -1 : 0) || x.name.localeCompare(y.name)));
        }).catch(() => setMembers([]));
    }, [communityId, isCreator]);

    if (!isCreator) {
        return (
            <div className="p-5 rounded-2xl border border-foreground/10 text-sm text-foreground/60">
                Only the community's owner can transfer ownership or delete the community.
            </div>
        );
    }

    const transfer = async () => {
        setConfirmTransfer(false);
        if (!target || !me) return;
        setBusy(true);
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, 'communities', communityId, 'members', target), { role: 'owner' });
            batch.update(doc(db, 'communities', communityId, 'members', me), { role: 'admin' });
            batch.update(doc(db, 'communities', communityId), { creatorId: target, updatedAt: serverTimestamp() });
            queueAudit(batch, communityId, { action: 'community.transfer', targetId: target, targetName: members.find(m => m.id === target)?.name });
            await batch.commit();
            toast.success('Ownership transferred. You are now an admin.');
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}`);
            toast.error("Couldn't transfer ownership");
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (deleteText.trim() !== community?.name) return;
        setBusy(true);
        try {
            await deleteDoc(doc(db, 'communities', communityId));
            toast.success(`${community.name} was deleted`);
            window.location.assign('/feed?view=communities');
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}`);
            toast.error("Couldn't delete the community");
            setBusy(false);
        }
    };

    const targetName = members.find(m => m.id === target)?.name;

    return (
        <div className="space-y-6">
            <section className="p-5 rounded-2xl border border-foreground/10">
                <h3 className="font-semibold">Transfer ownership</h3>
                <p className="mt-1 text-sm text-foreground/60">Hand the community to another member. They become the owner and you become an admin.</p>
                {members.length === 0 ? (
                    <p className="mt-4 text-sm text-foreground/50">There are no other members yet.</p>
                ) : (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        <select value={target} onChange={e => setTarget(e.target.value)} className="flex-1 px-4 py-2.5 rounded-xl bg-foreground/5 border border-foreground/10 outline-none focus:border-primary text-sm">
                            <option value="">Choose a member…</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.username ? ` (@${m.username})` : ''}{m.role === 'admin' ? ' · admin' : ''}</option>)}
                        </select>
                        <button onClick={() => setConfirmTransfer(true)} disabled={!target || busy} className="px-5 py-2.5 rounded-full border border-foreground/15 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-40">Transfer</button>
                    </div>
                )}
            </section>

            <section className="p-5 rounded-2xl border border-red-500/30 bg-red-500/[0.03]">
                <h3 className="font-semibold text-red-500 flex items-center gap-2"><AlertTriangle size={18} /> Delete community</h3>
                <p className="mt-1 text-sm text-foreground/60">This removes {community?.name} for everyone. Channels, messages and members go with it, and it can't be undone.</p>
                <label className="block mt-4 text-sm">Type <span className="font-semibold">{community?.name}</span> to confirm</label>
                <div className="mt-1.5 flex flex-col sm:flex-row gap-2">
                    <input value={deleteText} onChange={e => setDeleteText(e.target.value)} className="flex-1 px-4 py-2.5 rounded-xl bg-foreground/5 border border-foreground/10 outline-none focus:border-red-500 text-sm" />
                    <button onClick={remove} disabled={busy || deleteText.trim() !== community?.name} className="px-5 py-2.5 rounded-full bg-red-500 text-sm font-semibold disabled:opacity-40 hover:bg-red-600" style={{ color: '#fff' }}>Delete forever</button>
                </div>
            </section>

            <ConfirmModal
                isOpen={confirmTransfer}
                onClose={() => setConfirmTransfer(false)}
                onConfirm={transfer}
                title={`Make ${targetName} the owner?`}
                message="They'll have full control, including deleting the community. You'll become an admin."
                confirmText="Transfer ownership"
            />
        </div>
    );
}
