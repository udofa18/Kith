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
  ExternalLink, Link as LinkIcon, Flag, X, Smile, Layout
} from 'lucide-react';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import ReportModal from './ReportModal';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { 
  doc, onSnapshot, updateDoc, collection, query, 
  orderBy, getDocs, where, increment, serverTimestamp,
  addDoc, deleteDoc, writeBatch, limit, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'react-hot-toast';
import { formatDate } from '../lib/utils';
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
  | 'monetization'
  | 'events'
  | 'growth'
  | 'automation'
  | 'insights'
  | 'integrations'
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
    memberChange: '+0%',
    messageChange: '+0%',
    xpChange: '+0%'
  });
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  
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
        // Fallback to minimal data points if collection doesn't exist yet
        const fallbackStats = Array.from({ length: 7 }).map((_, i) => ({
          date: formatDate(new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000), 'MMM d'),
          active: Math.floor(Math.random() * 5) + 2,
          messages: 0,
          growth: 0
        }));
        setStats(fallbackStats);
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

          const calculateChange = (key: string) => {
            const currentSum = currentPeriod.reduce((acc, curr) => acc + (curr[key] || 0), 0);
            const previousSum = previousPeriod.reduce((acc, curr) => acc + (curr[key] || 0), 0);
            if (previousSum === 0) return currentSum > 0 ? '+100%' : '+0%';
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
      const storageRef = ref(storage, `communities/${communityId}/${type}_${Date.now()}`);
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

  const NavItem = ({ id, icon, label, badge }: { id: SettingsSection, icon: any, label: string, badge?: number }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
        activeTab === id 
          ? 'bg-primary/10 text-primary border-l-4 border-primary shadow-[4px_0_15px_-5px_rgba(139,92,246,0.3)]' 
          : 'text-foreground/40 hover:bg-foreground/5 hover:text-foreground'
      }`}
    >
      <div className="relative">
        {icon}
        {badge && badge > 0 && id !== activeTab && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
        )}
      </div>
      <span>{label}</span>
      {badge && badge > 0 && (
         <span className="ml-auto bg-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-primary/20 animate-in zoom-in duration-300">
           {badge}
         </span>
      )}
      {activeTab === id && !badge && (
        <motion.div layoutId="nav-pill" className="ml-auto">
          <ChevronRight size={14} />
        </motion.div>
      )}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background/30 backdrop-blur-3xl rounded-[40px] border border-white/5 shadow-2xl">
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <div className="w-72 border-r border-white/5 bg-white/2 backdrop-blur-md overflow-y-auto p-4 space-y-2">
            <div className="px-4 py-2 text-[10px] font-black text-foreground/20 uppercase tracking-[0.2em]">General</div>
            <NavItem id="dashboard" icon={<BarChart3 size={18} />} label="Overview" />
            <NavItem id="branding" icon={<ImageIcon size={18} />} label="Identity" />
            <NavItem id="channels" icon={<Layers size={18} />} label="Structure" />
            
            <div className="px-4 py-2 mt-4 text-[10px] font-black text-foreground/20 uppercase tracking-[0.15em]">Admin & Privacy</div>
            <NavItem id="members" icon={<Users size={18} />} label="Membership" />
            <NavItem id="roles" icon={<Shield size={18} />} label="Permissions" />
            <NavItem id="moderation" icon={<ShieldAlert size={18} />} label="Safety" />
            
            <div className="px-4 py-2 mt-4 text-[10px] font-black text-foreground/20 uppercase tracking-[0.15em]">Growth & Ops</div>
            <NavItem id="monetization" icon={<CreditCard size={18} />} label="Monetization" />
            <NavItem id="events" icon={<Calendar size={18} />} label="Live & Streams" />
            <NavItem id="growth" icon={<Rocket size={18} />} label="Growth tools" />
            <NavItem id="automation" icon={<Cpu size={18} />} label="Automation" />

            <div className="px-4 py-2 mt-4 text-[10px] font-black text-foreground/20 uppercase tracking-[0.15em]">Analytics</div>
            <NavItem id="insights" icon={<TrendingUp size={18} />} label="Insights" />
            <NavItem id="integrations" icon={<Sliders size={18} />} label="Integrations" />
            
            <div className="pt-4 mt-auto">
               <NavItem id="advanced" icon={<Settings2 size={18} />} label="System Settings" />
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-background/20 p-8 custom-scrollbar">
           <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-5xl mx-auto space-y-8 pb-12"
              >
                 {activeTab === 'dashboard' && (
                    <DashboardSection 
                      stats={stats} 
                      community={community} 
                      dashboardStats={dashboardStats}
                      topPerformers={topPerformers}
                      analyticsFilter={analyticsFilter}
                      setAnalyticsFilter={setAnalyticsFilter}
                    />
                 )}
                 {activeTab === 'branding' && <BrandingSection form={form} setForm={setForm} onSave={handleSave} avatarInputRef={avatarInputRef} bannerInputRef={bannerInputRef} handleFileUpload={handleFileUpload} isUploading={isUploading} />}
                 {activeTab === 'channels' && <StructureSection communityId={communityId} />}
                 {activeTab === 'members' && <MembershipSection communityId={communityId} form={form} setForm={setForm} onSave={handleSave} isSaving={isSaving} pendingRequestsCount={pendingRequestsCount} />}
                 {activeTab === 'roles' && <PermissionsSection communityId={communityId} />}
                 {activeTab === 'moderation' && <SafetySection communityId={communityId} />}
                 {activeTab === 'monetization' && <MonetizationSection communityId={communityId} form={form} setForm={setForm} onSave={handleSave} />}
                 {activeTab === 'events' && <LiveSection communityId={communityId} />}
                 {activeTab === 'growth' && <GrowthSection communityId={communityId} />}
                 {activeTab === 'automation' && <AutomationSection communityId={communityId} config={form.welcomeConfig} onSave={handleSave} />}
                 {activeTab === 'insights' && <InsightsSection stats={stats} />}
                 {activeTab === 'integrations' && <IntegrationsSection />}
                 {activeTab === 'advanced' && <AdvancedSection communityId={communityId} />}
              </motion.div>
           </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// --- Sub-sections ---

function DashboardSection({ 
    stats, 
    community, 
    dashboardStats, 
    topPerformers, 
    analyticsFilter, 
    setAnalyticsFilter 
}: { 
    stats: any[], 
    community: any, 
    dashboardStats: any, 
    topPerformers: any[],
    analyticsFilter: string, 
    setAnalyticsFilter: (val: string) => void 
}) {
    const formattedStats = (val: number) => {
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
        return val.toString();
    };

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Active Members', value: dashboardStats.memberCount, change: dashboardStats.memberChange, icon: <Users className="text-primary" /> },
                    { label: 'Chat messages', value: formattedStats(dashboardStats.messagesCount), change: dashboardStats.messageChange, icon: <MessageSquare className="text-blue-500" /> },
                    { label: 'XP Distributed', value: formattedStats(dashboardStats.totalXp), change: dashboardStats.xpChange, icon: <Zap className="text-yellow-500" /> }
                ].map((stat, i) => (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        key={stat.label}
                        className="bg-white/5 rounded-3xl p-6 border border-white/5 shadow-xl group hover:border-primary/20 transition-all cursor-pointer"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="p-3 bg-white/5 rounded-2xl">
                                {stat.icon}
                            </div>
                            <span className={`text-xs font-black px-2 py-1 rounded-lg ${stat.change.startsWith('+') ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
                                {stat.change}
                            </span>
                        </div>
                        <p className="text-foreground/40 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
                        <h3 className="text-4xl font-black mt-2">{stat.value}</h3>
                    </motion.div>
                ))}
            </div>

            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
                <div className="flex items-center justify-between mb-8">
                   <div>
                       <h3 className="text-xl font-black">Engagement Pulse</h3>
                       <p className="text-sm text-foreground/40 font-medium">Daily activity and community health</p>
                   </div>
                   <div className="flex items-center gap-2">
                      <select 
                        value={analyticsFilter}
                        onChange={(e) => setAnalyticsFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold outline-none cursor-pointer hover:border-primary/30 transition-all"
                      >
                          <option value="7d">Last 7 Days</option>
                          <option value="14d">Last 14 Days</option>
                          <option value="30d">Last 30 Days</option>
                          <option value="90d">Last 3 Months</option>
                      </select>
                   </div>
                </div>
                <div className="h-[300px] w-full">
                    {stats.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stats}>
                              <defs>
                                  <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700}} dy={10} />
                              <YAxis axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700}} />
                              <Tooltip 
                                  contentStyle={{backgroundColor: '#0F1219', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px'}}
                                  itemStyle={{color: '#fff', fontSize: '12px', fontWeight: 'bold'}}
                                  labelStyle={{color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginBottom: '4px', fontWeight: 'black', textTransform: 'uppercase'}}
                              />
                              <Area type="monotone" dataKey="active" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorActive)" />
                          </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-foreground/20 font-black uppercase tracking-widest text-xs">
                        Collecting analytic pulses...
                      </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                   <h4 className="text-sm font-black uppercase tracking-widest text-foreground/40 mb-6">Top Performers</h4>
                   <div className="space-y-4">
                      {topPerformers.length > 0 ? topPerformers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between p-3 bg-white/2 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group">
                           <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${u.rank === 1 ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-primary/10 text-primary'}`}>#{u.rank}</div>
                              <span className="text-sm font-bold truncate max-w-[120px]">{u.name}</span>
                           </div>
                           <span className="text-xs font-black text-primary group-hover:scale-110 transition-transform">{formattedStats(u.xp)} XP</span>
                        </div>
                      )) : (
                        <div className="text-center py-10 text-foreground/20 text-xs font-bold">No active performers yet</div>
                      )}
                   </div>
                </div>

                <div className="bg-white/5 rounded-3xl p-6 border border-white/5">
                   <h4 className="text-sm font-black uppercase tracking-widest text-foreground/40 mb-6">Milestones</h4>
                   <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
                         <div className="flex items-center gap-4">
                            <Trophy className="text-yellow-500" />
                            <div>
                               <p className="text-sm font-bold text-primary">10k Members Goal</p>
                               <p className="text-[10px] text-primary/60 font-black uppercase tracking-widest mt-1">84% Complete</p>
                            </div>
                         </div>
                         <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-[84%]" />
                         </div>
                      </div>
                   </div>
                </div>
            </div>
        </div>
    );
}

function BrandingSection({ form, setForm, onSave, avatarInputRef, bannerInputRef, handleFileUpload, isUploading }: any) {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="space-y-6">
                <h3 className="text-xl font-black flex items-center gap-3">
                   <Edit3 size={20} className="text-primary" /> Visual Identity
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Community Icon */}
                    <div className="space-y-4">
                        <label className="text-xs font-black text-foreground/30 uppercase tracking-widest">Community Avatar</label>
                        <div className="relative group">
                            <div className="w-40 h-40 rounded-[3rem] overflow-hidden border-2 border-white/10 shadow-2xl relative">
                                <img 
                                    src={(form.image && form.image.trim() !== '') ? form.image : 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=400&fit=crop'} 
                                    className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" 
                                    alt="" 
                                />
                                <button 
                                    onClick={() => avatarInputRef.current?.click()}
                                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]"
                                >
                                    <Upload size={24} className="text-white" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Update Photo</span>
                                </button>
                                {isUploading && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <input 
                                type="file" 
                                ref={avatarInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, 'image');
                                }} 
                            />
                        </div>
                    </div>

                    {/* Community Banner */}
                    <div className="space-y-4">
                        <label className="text-xs font-black text-foreground/30 uppercase tracking-widest">Community Banner</label>
                        <div className="relative group h-40 w-full rounded-[2.5rem] overflow-hidden border-2 border-white/10 shadow-2xl">
                             <img 
                                src={(form.backdrop && form.backdrop.trim() !== '') ? form.backdrop : 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&h=400&fit=crop'} 
                                className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" 
                                alt="" 
                             />
                             <button 
                                onClick={() => bannerInputRef.current?.click()}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]"
                             >
                                <Upload size={24} className="text-white" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Update Banner</span>
                             </button>
                             <input 
                                type="file" 
                                ref={bannerInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file, 'backdrop');
                                }} 
                             />
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-foreground/40 uppercase tracking-widest">Community Name</label>
                        <input 
                           type="text"
                           value={form.name}
                           onChange={(e) => setForm({...form, name: e.target.value})}
                           className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-primary outline-none transition-all placeholder:text-white/10"
                           placeholder="Enter community name"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-foreground/40 uppercase tracking-widest">Tagline / Category</label>
                        <input 
                           type="text"
                           value={form.category}
                           onChange={(e) => setForm({...form, category: e.target.value})}
                           className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-primary outline-none transition-all placeholder:text-white/10"
                           placeholder="e.g. Technology & Code"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-black text-foreground/40 uppercase tracking-widest">Community Description</label>
                    <textarea 
                        value={form.description}
                        onChange={(e) => setForm({...form, description: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-3xl px-6 py-4 text-sm font-bold focus:border-primary outline-none transition-all min-h-[120px] resize-none"
                        placeholder="Tell the world what this community is about..."
                    />
                </div>

                <div className="flex justify-end">
                    <button 
                       onClick={() => onSave({ name: form.name, category: form.category, description: form.description })}
                       className="px-8 py-4 bg-primary text-white rounded-2xl font-black shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                    >
                        <Save size={18} /> Save Identity
                    </button>
                </div>
            </section>
        </div>
    );
}

function StructureSection({ communityId }: { communityId: string }) {
    const [channels, setChannels] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [editingChannel, setEditingChannel] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newType, setNewType] = useState('text');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!communityId) return;
        const q = query(collection(db, 'communities', communityId, 'channels'), orderBy('order', 'asc'));
        const unsubChannels = onSnapshot(q, (snap) => setChannels(snap.docs.map(d => ({id: d.id, ...d.data()}))));
        
        const unsubRoles = onSnapshot(collection(db, 'communities', communityId, 'roles'), (snap) => {
            setRoles(snap.docs.map(d => ({id: d.id, ...d.data()})));
        });

        return () => {
            unsubChannels();
            unsubRoles();
        };
    }, [communityId]);

    const handleCreateChannel = async () => {
        if (!newName.trim()) return toast.error('Name requested');
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'communities', communityId, 'channels'), {
                name: newName,
                type: newType,
                order: channels.length,
                isHidden: false,
                isLocked: false,
                isPremium: false,
                premiumRoles: [],
                createdAt: serverTimestamp()
            });
            setNewName('');
            setIsCreating(false);
            toast.success('Space initialized');
        } catch (error) {
            toast.error('Initialization failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReorder = async (newOrder: any[]) => {
        setChannels(newOrder);
        try {
            const updates = newOrder.map((channel, index) => {
                if (channel.order !== index) {
                    return updateDoc(doc(db, 'communities', communityId, 'channels', channel.id), { order: index });
                }
                return null;
            }).filter(Boolean);
            if (updates.length > 0) await Promise.all(updates);
        } catch (error) {
            toast.error('Failed to save order');
        }
    };

    const toggleSetting = async (channelId: string, setting: string, currentValue: any) => {
        try {
            await updateDoc(doc(db, 'communities', communityId, 'channels', channelId), {
                [setting]: !currentValue,
                updatedAt: serverTimestamp()
            });
            toast.success(`Channel ${setting} updated`);
        } catch (error) {
            toast.error('Update failed');
        }
    };

    const updatePremiumRoles = async (channelId: string, roleId: string, currentRoles: string[] = []) => {
        let newRoles = [...currentRoles];
        if (newRoles.includes(roleId)) {
            newRoles = newRoles.filter(r => r !== roleId);
        } else {
            newRoles.push(roleId);
        }
        
        try {
            await updateDoc(doc(db, 'communities', communityId, 'channels', channelId), {
                premiumRoles: newRoles,
                isPremium: newRoles.length > 0,
                updatedAt: serverTimestamp()
            });
        } catch (error) {
            toast.error('Failed to update access');
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
               <div>
                  <h3 className="text-xl font-black">Spaces & Channels</h3>
                  <p className="text-sm text-foreground/40 font-medium">Reorder structure or configure deep access controls.</p>
               </div>
               <button 
                  onClick={() => setIsCreating(true)}
                  className="px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-primary/20 transition-all shadow-[0_0_20px_rgba(139,92,246,0.1)]"
               >
                  <Plus size={16} /> New Asset
               </button>
            </div>

            {isCreating && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-8 bg-primary/5 border border-primary/20 rounded-[2.5rem] space-y-6 shadow-2xl"
                >
                    <div className="flex items-center justify-between">
                        <h4 className="font-black text-sm uppercase tracking-widest text-primary">Space Initialization</h4>
                        <button onClick={() => setIsCreating(false)} className="text-foreground/20 hover:text-foreground transition-colors"><Trash2 size={16} /></button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Name</label>
                           <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. General Hub" className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all" />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Type</label>
                           <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all">
                                <option value="text">Text Space</option>
                                <option value="voice">Audio Hub</option>
                                <option value="live">Global Stage</option>
                           </select>
                        </div>
                    </div>
                    <button disabled={isSubmitting} onClick={handleCreateChannel} className="w-full py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">{isSubmitting ? 'Initializing...' : 'Construct Space'}</button>
                </motion.div>
            )}

            <Reorder.Group axis="y" values={channels} onReorder={handleReorder} className="space-y-3">
                {channels.map((channel, i) => (
                    <Reorder.Item value={channel} key={channel.id} className="space-y-2">
                        <motion.div layout className={`group bg-white/5 border ${editingChannel === channel.id ? 'border-primary/50 bg-primary/5' : 'border-white/5 hover:border-primary/30'} rounded-[2rem] p-5 flex items-center justify-between transition-all`}>
                            <div className="flex items-center gap-5">
                               <div className="cursor-grab active:cursor-grabbing p-2 text-foreground/10 hover:text-primary transition-colors">
                                   <GripVertical size={20} />
                               </div>
                               <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-foreground/40 group-hover:text-primary transition-all shadow-inner">
                                  {channel.type === 'voice' ? <Activity size={24} /> : channel.type === 'live' ? <Rocket size={24} /> : channel.type === 'feed' ? <Layout size={24} /> : <Hash size={24} />}
                               </div>
                               <div>
                                  <div className="flex items-center gap-2">
                                     <h4 className="text-base font-black">{channel.name}</h4>
                                     {channel.isHidden && <div className="px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[8px] font-black uppercase rounded-md flex items-center gap-1">Hidden</div>}
                                     {channel.isLocked && <div className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[8px] font-black uppercase rounded-md flex items-center gap-1">Locked</div>}
                                     {channel.isPremium && <div className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 text-[8px] font-black uppercase rounded-md flex items-center gap-1">Premium</div>}
                                  </div>
                                  <p className="text-[10px] font-black text-foreground/20 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                                      {channel.type} Space 
                                      {channel.scheduledAt && (() => {
                                          try {
                                              const date = channel.scheduledAt.toDate ? channel.scheduledAt.toDate() : new Date(channel.scheduledAt);
                                              if (isNaN(date.getTime())) return null;
                                              return <span className="text-blue-500">• SCHED: {formatDate(date, 'MMM d, HH:mm')}</span>;
                                          } catch (e) {
                                              return null;
                                          }
                                      })()}
                                  </p>
                               </div>
                            </div>

                            <div className="flex items-center gap-1">
                                   <button 
                                      onClick={() => toggleSetting(channel.id, 'isHidden', channel.isHidden)}
                                      className={`p-2.5 rounded-xl transition-all ${channel.isHidden ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-white/5 text-foreground/20 hover:text-foreground'}`}
                                   >
                                      {channel.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                                   </button>
                                   <button 
                                      onClick={() => toggleSetting(channel.id, 'isLocked', channel.isLocked)}
                                      className={`p-2.5 rounded-xl transition-all ${channel.isLocked ? 'bg-red-500/20 text-red-500' : 'hover:bg-white/5 text-foreground/20 hover:text-foreground'}`}
                                   >
                                      <Lock size={18} />
                                   </button>
                                   <button 
                                      onClick={() => setEditingChannel(editingChannel === channel.id ? null : channel.id)}
                                      className={`p-3 rounded-xl transition-all ${editingChannel === channel.id ? 'bg-primary text-white scale-110 shadow-lg' : 'hover:bg-white/5 text-foreground/20 hover:text-primary'}`}
                                   >
                                      <Settings2 size={18} />
                                   </button>
                            </div>
                        </motion.div>

                        <AnimatePresence>
                            {editingChannel === channel.id && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-10">
                                    <div className="bg-white/2 border-x border-b border-white/5 rounded-b-[2.5rem] p-8 space-y-8">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black uppercase tracking-widest text-yellow-500/80">Premium Access Controls</span>
                                                <div className={`w-12 h-6 rounded-full p-1 relative cursor-pointer ${channel.isPremium ? 'bg-yellow-500' : 'bg-white/10'}`} onClick={() => toggleSetting(channel.id, 'isPremium', channel.isPremium)}>
                                                    <div className={`w-4 h-4 bg-white rounded-full ${channel.isPremium ? 'ml-6' : ''}`} />
                                                </div>
                                            </div>
                                            {channel.isPremium && (
                                                <div className="flex flex-wrap gap-2 pt-2 bg-white/5 p-4 rounded-2xl flex items-center justify-center">
                                                    {roles.map(role => (
                                                        <button key={role.id} onClick={() => updatePremiumRoles(channel.id, role.id, channel.premiumRoles)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${(channel.premiumRoles || []).includes(role.id) ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-white/5 border-white/10 text-foreground/30 hover:text-foreground'}`}>{role.name}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="space-y-4">
                                            <span className="text-xs font-black uppercase tracking-widest text-blue-500/80">Visibility Scheduling</span>
                                            <div className="flex items-center gap-4">
                                                <input 
                                                    type="datetime-local" 
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xs font-bold text-foreground outline-none focus:border-primary"
                                                    onChange={async (e) => {
                                                        const date = new Date(e.target.value);
                                                        await updateDoc(doc(db, 'communities', communityId, 'channels', channel.id), { scheduledAt: date, updatedAt: serverTimestamp() });
                                                    }}
                                                />
                                                <button onClick={() => updateDoc(doc(db, 'communities', communityId, 'channels', channel.id), { scheduledAt: null })} className="px-6 py-4 bg-white/5 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-2xl">Reset</button>
                                            </div>
                                        </div>
                                        <div className="flex justify-end pt-4 border-t border-white/5">
                                            <button onClick={() => deleteDoc(doc(db, 'communities', communityId, 'channels', channel.id))} className="text-[10px] font-black text-red-500/40 hover:text-red-500 uppercase tracking-widest transition-all">Permanent Demolition</button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Reorder.Item>
                ))}
            </Reorder.Group>
        </div>
    );
}

function MembershipSection({ communityId, form, setForm, onSave, isSaving, pendingRequestsCount }: any) {
    const [activeSubTab, setActiveSubTab] = useState<'settings' | 'requests' | 'directory'>('settings');
    const [requests, setRequests] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportTargetId, setReportTargetId] = useState('');
    const [reportContentSnippet, setReportContentSnippet] = useState('');

    const [showEmojiPickerWelcome, setShowEmojiPickerWelcome] = useState(false);
    const [showChannelSuggestionsWelcome, setShowChannelSuggestionsWelcome] = useState(false);
    const [channelsSub, setChannelsSub] = useState<any[]>([]);
    const [mentionFilterWelcome, setMentionFilterWelcome] = useState('');
    const [mentionCursorPosWelcome, setMentionCursorPosWelcome] = useState(0);
    const welcomeTextareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!communityId) return;
        const q = query(collection(db, 'communities', communityId, 'channels'), orderBy('order', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setChannelsSub(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [communityId]);

    const filteredChannelsWelcome = useMemo(() => {
        const filter = mentionFilterWelcome.toLowerCase();
        return channelsSub
            .filter(c => c.name.toLowerCase().includes(filter))
            .slice(0, 5);
    }, [channelsSub, mentionFilterWelcome]);

    const insertChannelMentionWelcome = (channelName: string) => {
        const value = form.welcomeMessage || '';
        const before = value.slice(0, mentionCursorPosWelcome);
        
        const spaceIndex = value.indexOf(' ', mentionCursorPosWelcome);
        const sliceEnd = spaceIndex === -1 ? value.length : spaceIndex;
        const finalAfter = value.slice(sliceEnd);

        const insertedText = `#${channelName} `;
        const updatedMessage = `${before}${insertedText}${finalAfter}`;
        setForm({ ...form, welcomeMessage: updatedMessage });
        setShowChannelSuggestionsWelcome(false);
        
        setTimeout(() => {
            if (welcomeTextareaRef.current) {
                welcomeTextareaRef.current.focus();
                const cursorPosition = before.length + insertedText.length;
                welcomeTextareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
            }
        }, 0);
    };

    const insertEmojiWelcome = (emoji: string) => {
        const value = form.welcomeMessage || '';
        const cursor = welcomeTextareaRef.current?.selectionStart || value.length;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        
        const updatedMessage = `${before}${emoji}${after}`;
        setForm({ ...form, welcomeMessage: updatedMessage });
        setShowEmojiPickerWelcome(false);
        
        setTimeout(() => {
            if (welcomeTextareaRef.current) {
                welcomeTextareaRef.current.focus();
                const newCursor = cursor + emoji.length;
                welcomeTextareaRef.current.setSelectionRange(newCursor, newCursor);
            }
        }, 0);
    };

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
        const newRoles = currentRoles.includes(roleId)
            ? currentRoles.filter(id => id !== roleId)
            : [...currentRoles, roleId];
        
        // Aggregate permissions from all roles
        const aggregatePermissions = new Set<string>();
        newRoles.forEach(rid => {
            const r = roles.find(role => role.id === rid);
            if (r && r.permissions) {
                r.permissions.forEach((p: string) => aggregatePermissions.add(p));
            }
        });
        
        try {
            await updateDoc(doc(db, 'communities', communityId, 'members', memberUserId), {
                customRoles: newRoles,
                permissions: Array.from(aggregatePermissions)
            });
            toast.success('Member roles updated');
        } catch (error) {
            toast.error('Failed to update member');
        }
    };

    useEffect(() => {
        if (!communityId) return;
        return onSnapshot(collection(db, 'communities', communityId, 'roles'), (snap) => {
            setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [communityId]);

    const handleUpdateControl = (field: string, value: any) => {
        const newControl = { ...form.membershipControl, [field]: value };
        setForm({ ...form, membershipControl: newControl });
    };

    const addQuestion = () => {
        const questions = [...(form.membershipControl.onboardingQuestions || [])];
        questions.push({
            id: Math.random().toString(36).substr(2, 9),
            question: '',
            type: 'text',
            required: true
        });
        handleUpdateControl('onboardingQuestions', questions);
    };

    const removeQuestion = (id: string) => {
        const questions = (form.membershipControl.onboardingQuestions || []).filter((q: any) => q.id !== id);
        handleUpdateControl('onboardingQuestions', questions);
    };

    const updateQuestion = (id: string, updates: any) => {
        const questions = (form.membershipControl.onboardingQuestions || []).map((q: any) => 
            q.id === id ? { ...q, ...updates } : q
        );
        handleUpdateControl('onboardingQuestions', questions);
    };

    const toggleAutoRole = (roleId: string) => {
        const autoRoles = [...(form.membershipControl.autoRoles || [])];
        if (autoRoles.includes(roleId)) {
            handleUpdateControl('autoRoles', autoRoles.filter(id => id !== roleId));
        } else {
            handleUpdateControl('autoRoles', [...autoRoles, roleId]);
        }
    };

    const handleApprove = async (request: any) => {
        try {
            const batch = writeBatch(db as any);
            
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
                permissions: Array.from(initialPermissions)
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
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveSubTab('settings')}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeSubTab === 'settings' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                >
                    Membership Settings
                </button>
                <button 
                    onClick={() => setActiveSubTab('requests')}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all relative ${activeSubTab === 'requests' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                >
                    Join Requests
                    {pendingRequestsCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center animate-pulse">
                            {pendingRequestsCount}
                        </span>
                    )}
                </button>
                <button 
                    onClick={() => setActiveSubTab('directory')}
                    className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${activeSubTab === 'directory' ? 'bg-primary text-white shadow-lg' : 'text-foreground/40 hover:text-foreground'}`}
                >
                    Member Directory
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeSubTab === 'settings' ? (
                    <motion.div 
                        key="settings"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="space-y-8"
                    >
                        {/* Access Control */}
                        <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                            <h3 className="text-xl font-black mb-6 flex items-center gap-3">
                                <Globe size={24} className="text-primary" /> Access Control
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { id: 'public', label: 'Public', desc: 'Anyone can see and join.', icon: <Globe size={18} /> },
                                    { id: 'private', label: 'Private', desc: 'Hidden from search, invite only.', icon: <EyeOff size={18} /> },
                                    { id: 'invite-only', label: 'Invite Only', desc: 'Visible, but requires an invite code.', icon: <Hash size={18} /> }
                                ].map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => handleUpdateControl('accessType', type.id)}
                                        className={`p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-3 ${
                                            form.membershipControl.accessType === type.id 
                                                ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(139,92,246,0.2)]' 
                                                : 'bg-white/2 border-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <div className={form.membershipControl.accessType === type.id ? 'text-primary' : 'text-foreground/40'}>
                                            {type.icon}
                                        </div>
                                        <div>
                                            <p className="font-black text-sm">{type.label}</p>
                                            <p className="text-[10px] text-foreground/40 mt-1 leading-relaxed">{type.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
                                <div className="flex items-center justify-between p-4 bg-white/2 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck size={20} className="text-green-500" />
                                        <div>
                                            <p className="text-sm font-black text-foreground">Manual Approval</p>
                                            <p className="text-[10px] text-foreground/40">Review every member before they join</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleUpdateControl('approvalRequired', !form.membershipControl.approvalRequired)}
                                        className={`w-12 h-6 rounded-full p-1 relative transition-all ${form.membershipControl.approvalRequired ? 'bg-green-500' : 'bg-white/10'}`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full transition-all ${form.membershipControl.approvalRequired ? 'ml-6' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Requirements */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white/5 rounded-3xl p-8 border border-white/5">
                                <h4 className="text-lg font-black mb-6 flex items-center gap-3 italic">
                                    <Shield size={20} className="text-blue-400" /> Security Gates
                                </h4>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between group">
                                        <div>
                                            <p className="text-sm font-bold">Email Verification</p>
                                            <p className="text-[10px] text-foreground/30 uppercase tracking-widest">Mandatory for all</p>
                                        </div>
                                        <CheckCircle2 size={18} className="text-green-500" />
                                    </div>
                                    <div className="flex items-center justify-between group cursor-pointer" onClick={() => handleUpdateControl('memberVerificationRequired', !form.membershipControl.memberVerificationRequired)}>
                                        <div>
                                            <p className="text-sm font-bold">Member Verification</p>
                                            <p className="text-[10px] text-foreground/30 uppercase tracking-widest">Require badge/ID check</p>
                                        </div>
                                        <div className={`w-10 h-5 rounded-full p-0.5 relative transition-all ${form.membershipControl.memberVerificationRequired ? 'bg-blue-500' : 'bg-white/10'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full ${form.membershipControl.memberVerificationRequired ? 'ml-5' : ''}`} />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between group cursor-pointer" onClick={() => handleUpdateControl('profileCompletionRequired', !form.membershipControl.profileCompletionRequired)}>
                                        <div>
                                            <p className="text-sm font-bold">Profile Completion</p>
                                            <p className="text-[10px] text-foreground/30 uppercase tracking-widest">Bio & Image required</p>
                                        </div>
                                        <div className={`w-10 h-5 rounded-full p-0.5 relative transition-all ${form.membershipControl.profileCompletionRequired ? 'bg-blue-500' : 'bg-white/10'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full ${form.membershipControl.profileCompletionRequired ? 'ml-5' : ''}`} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Auto Roles */}
                            <div className="bg-white/5 rounded-3xl p-8 border border-white/5">
                                <h4 className="text-lg font-black mb-6 flex items-center gap-3 italic">
                                    <Zap size={20} className="text-yellow-400" /> Auto-Roles
                                </h4>
                                <div className="space-y-3">
                                    {roles.length === 0 ? (
                                        <div className="text-center py-4 border-2 border-dashed border-white/5 rounded-2xl">
                                            <p className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">No roles created yet</p>
                                        </div>
                                    ) : (
                                        roles.map(role => (
                                            <button 
                                                key={role.id}
                                                onClick={() => toggleAutoRole(role.id)}
                                                className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all ${
                                                    (form.membershipControl.autoRoles || []).includes(role.id)
                                                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                                        : 'bg-white/5 border-white/5 text-foreground/40 hover:bg-white/10'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                                                    <span className="text-xs font-bold">{role.name}</span>
                                                </div>
                                                {(form.membershipControl.autoRoles || []).includes(role.id) && <CheckCircle2 size={14} />}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Onboarding Questionnaire */}
                        <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-xl font-black italic">Onboarding Questionnaire</h3>
                                    <p className="text-sm text-foreground/40 font-medium">Capture insights from members as they join.</p>
                                </div>
                                <button 
                                    onClick={addQuestion}
                                    className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
                                >
                                    + Add Question
                                </button>
                            </div>

                            <div className="space-y-4">
                                {(form.membershipControl.onboardingQuestions || []).map((q: any, i: number) => (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        key={q.id}
                                        className="bg-white/2 border border-white/5 rounded-3xl p-6 relative group"
                                    >
                                        <button 
                                            onClick={() => removeQuestion(q.id)}
                                            className="absolute -top-2 -right-2 w-8 h-8 bg-black border border-white/10 rounded-full flex items-center justify-center text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-xl"
                                        >
                                            <Plus size={16} className="rotate-45" />
                                        </button>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                            <div className="md:col-span-2 space-y-2">
                                                <label className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">Question {i + 1}</label>
                                                <input 
                                                    value={q.question}
                                                    onChange={e => updateQuestion(q.id, { question: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary transition-all" 
                                                    placeholder="What's your main goal here?"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">Type</label>
                                                <select 
                                                    value={q.type}
                                                    onChange={e => updateQuestion(q.id, { type: e.target.value })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary transition-all"
                                                >
                                                    <option value="text">Text Response</option>
                                                    <option value="multiple-choice">Multiple Choice</option>
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-4 mt-6">
                                                <div 
                                                    onClick={() => updateQuestion(q.id, { required: !q.required })}
                                                    className="flex items-center gap-2 cursor-pointer group"
                                                >
                                                    <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${q.required ? 'bg-primary border-primary' : 'border-white/20 group-hover:border-white/40'}`}>
                                                        {q.required && <CheckCircle2 size={10} className="text-white" />}
                                                    </div>
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${q.required ? 'text-primary' : 'text-foreground/20'}`}>Required</span>
                                                </div>
                                            </div>
                                        </div>

                                        {q.type === 'multiple-choice' && (
                                            <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
                                                <label className="text-[10px] font-black text-foreground/20 uppercase tracking-widest block">Options (comma separated)</label>
                                                <input 
                                                    value={(q.options || []).join(', ')}
                                                    onChange={e => updateQuestion(q.id, { options: e.target.value.split(',').map((o: string) => o.trim()) })}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-primary transition-all" 
                                                    placeholder="Option 1, Option 2, Option 3"
                                                />
                                            </div>
                                        )}
                                    </motion.div>
                                ))}

                                {(form.membershipControl.onboardingQuestions || []).length === 0 && (
                                    <div className="py-12 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-3">
                                        <Info size={32} className="text-foreground/10" />
                                        <p className="text-xs font-black text-foreground/20 uppercase tracking-widest">No active questions</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Welcome Message */}
                        <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black italic">Welcome Flow</h3>
                                <div className="flex gap-2">
                                    {['username', 'community', 'channel:general'].map(tag => (
                                        <button 
                                            key={tag}
                                            onClick={() => setForm({ ...form, welcomeMessage: (form.welcomeMessage || '') + ` {${tag}}` })}
                                            className="text-[9px] font-black text-primary hover:underline"
                                        >
                                            +{tag}
                                        </button>
                                    ))}
                                    <div className="relative">
                                        <button 
                                            type="button"
                                            onClick={() => setShowEmojiPickerWelcome(!showEmojiPickerWelcome)}
                                            className="text-primary hover:text-primary/70 transition-colors"
                                        >
                                            <Smile size={14} />
                                        </button>
                                        <AnimatePresence>
                                            {showEmojiPickerWelcome && (
                                                <div className="absolute bottom-full right-0 mb-4 z-50">
                                                    <div className="fixed inset-0" onClick={() => setShowEmojiPickerWelcome(false)} />
                                                    <div className="relative z-10 shadow-2xl">
                                                        <EmojiPicker 
                                                            theme={typeof window !== 'undefined' && document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
                                                            onEmojiClick={(emojiData) => insertEmojiWelcome(emojiData.emoji)}
                                                            lazyLoadEmojis={true}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">Auto-Welcome Message</label>
                                <div className="relative">
                                    <AnimatePresence>
                                        {showChannelSuggestionsWelcome && filteredChannelsWelcome.length > 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 10 }}
                                                className="absolute bottom-full left-0 mb-2 w-64 bg-background border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                                            >
                                                <div className="p-2 border-b border-white/5 bg-white/5">
                                                    <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest px-2">Mention Channel</p>
                                                </div>
                                                <div className="max-h-48 overflow-y-auto p-1">
                                                    {filteredChannelsWelcome.map((c) => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => insertChannelMentionWelcome(c.name)}
                                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 text-left transition-all group"
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                                                                <Hash size={14} className="text-primary" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                                                    #{c.name}
                                                                </p>
                                                                {c.description && <p className="text-[10px] text-foreground/40 truncate">{c.description}</p>}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <textarea 
                                        value={form.welcomeMessage}
                                        ref={welcomeTextareaRef}
                                        onChange={e => {
                                            const value = e.target.value;
                                            const cursor = e.target.selectionStart || 0;
                                            setForm({ ...form, welcomeMessage: value });

                                            const lastHash = value.lastIndexOf('#', cursor - 1);
                                            if (lastHash !== -1) {
                                                const textAfterHash = value.slice(lastHash + 1, cursor);
                                                const charBeforeHash = lastHash === 0 ? '' : value[lastHash - 1];
                                                const isValidTrigger = !charBeforeHash || /\s/.test(charBeforeHash);

                                                if (isValidTrigger && !/\s/.test(textAfterHash)) {
                                                    setMentionFilterWelcome(textAfterHash);
                                                    setMentionCursorPosWelcome(lastHash);
                                                    setShowChannelSuggestionsWelcome(true);
                                                    return;
                                                }
                                            }
                                            setShowChannelSuggestionsWelcome(false);
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && showChannelSuggestionsWelcome && filteredChannelsWelcome.length > 0) {
                                                e.preventDefault();
                                                insertChannelMentionWelcome(filteredChannelsWelcome[0].name);
                                            } else if (e.key === 'Escape' && showChannelSuggestionsWelcome) {
                                                setShowChannelSuggestionsWelcome(false);
                                            }
                                        }}
                                        className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-sm font-bold min-h-[120px] outline-none focus:border-primary transition-all resize-none"
                                        placeholder="Welcome to the future of coding! Tell us about yourself in #general..."
                                    />
                                </div>
                                <p className="text-[10px] text-foreground/20 italic">Sent automatically to members upon joining/approval.</p>
                            </div>
                        </div>

                        <div className="flex justify-end pt-8">
                            <button 
                                onClick={() => onSave({ 
                                    isPrivate: form.membershipControl.accessType === 'private',
                                    membershipControl: form.membershipControl,
                                    welcomeMessage: form.welcomeMessage || ''
                                })}
                                disabled={isSaving}
                                className="px-10 py-5 bg-primary text-white rounded-[2rem] font-black shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                            >
                                <Save size={20} /> Deploy Policy
                            </button>
                        </div>
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
                            <div className="py-32 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[3rem] border border-white/5">
                                <Users size={48} className="text-foreground/5" />
                                <p className="text-xs font-black text-foreground/20 uppercase tracking-widest">No pending join requests</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {requests.map(req => (
                                    <div key={req.id} className="bg-white/5 border border-white/5 rounded-[2rem] p-6 flex items-center justify-between group hover:border-primary/30 transition-all">
                                        <div className="flex items-center gap-6">
                                            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/10">
                                                <img src={(req.userPhoto && req.userPhoto.trim() !== '') ? req.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.userId}`} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-lg">{req.userName || 'Anonymous User'}</h4>
                                                <p className="text-[10px] font-black text-foreground/20 uppercase tracking-widest mt-1">
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
                                                    <div className="mt-3 flex gap-2">
                                                        <button className="text-[10px] font-black px-3 py-1 bg-primary/10 text-primary rounded-lg border border-primary/20">View Answers</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => handleReject(req.id)}
                                                className="px-6 py-3 bg-red-500/10 text-red-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg"
                                            >
                                                Reject
                                            </button>
                                            <button 
                                                onClick={() => handleApprove(req)}
                                                className="px-6 py-3 bg-green-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
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
                         <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4">
                             <Users size={20} className="text-foreground/20" />
                             <input 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search members by hand..."
                                className="bg-transparent border-none outline-none text-sm font-bold w-full"
                             />
                         </div>

                         <div className="bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden">
                            <div className="grid grid-cols-12 gap-4 px-8 py-4 border-b border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest text-foreground/40">
                                <div className="col-span-5">Member</div>
                                <div className="col-span-3">Roles</div>
                                <div className="col-span-4 text-right">Settings</div>
                            </div>
                            <div className="divide-y divide-white/5">
                                {members.filter(m => (m.name || '').toLowerCase().includes(searchQuery.toLowerCase())).map(member => (
                                    <div key={member.id} className="grid grid-cols-12 gap-4 px-8 py-5 items-center hover:bg-white/2 transition-colors group">
                                        <div className="col-span-5 flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-2xl border border-white/10 overflow-hidden shadow-lg flex-shrink-0">
                                                <img src={(member.avatar && member.avatar.trim() !== '') ? member.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-black text-sm truncate">{member.name}</h4>
                                                <p className="text-[10px] font-bold text-foreground/20 uppercase tracking-widest mt-0.5">{member.role}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-3">
                                            <div className="flex gap-1 flex-wrap">
                                                {(member.customRoles || []).map((rid: string) => {
                                                    const r = roles.find(r => r.id === rid);
                                                    if (!r) return null;
                                                    return (
                                                        <div key={rid} className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase whitespace-nowrap" style={{ backgroundColor: `${r.color}20`, color: r.color }}>
                                                            {r.name}
                                                        </div>
                                                    );
                                                })}
                                                {(member.customRoles || []).length === 0 && (
                                                    <span className="text-[10px] font-bold text-foreground/10 uppercase tracking-widest italic">No roles</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="col-span-4 flex justify-end items-center gap-2">
                                            <div className="flex flex-wrap gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                {roles.slice(0, 3).map(role => (
                                                    <button 
                                                        key={role.id}
                                                        onClick={() => handleAssignRole(member.id, role.id, member.customRoles || [])}
                                                        className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${
                                                            (member.customRoles || []).includes(role.id)
                                                                ? 'bg-primary text-white border-primary shadow-lg'
                                                                : 'bg-white/5 border-white/10 text-foreground/40 hover:text-foreground'
                                                        }`}
                                                    >
                                                        {role.name}
                                                    </button>
                                                ))}
                                                {roles.length > 3 && (
                                                    <button className="px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-foreground/40 hover:text-foreground">
                                                        +{roles.length - 3} More
                                                    </button>
                                                )}
                                            </div>
                                            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-foreground/20 hover:text-primary transition-colors cursor-pointer ml-2">
                                                <Settings size={14} />
                                            </div>
                                            {member.id !== auth.currentUser?.uid && (
                                                <div 
                                                    onClick={() => {
                                                        setReportTargetId(member.id);
                                                        setReportContentSnippet(member.name);
                                                        setIsReportModalOpen(true);
                                                    }}
                                                    className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-foreground/20 hover:text-red-500 transition-colors cursor-pointer"
                                                >
                                                    <Flag size={14} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {members.length === 0 && (
                                    <div className="py-20 text-center text-foreground/20 font-black uppercase tracking-widest text-xs">
                                        No members found in the matrix
                                    </div>
                                )}
                            </div>
                         </div>
                    </motion.div>
                )}
            </AnimatePresence>

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

function PermissionsSection({ communityId }: { communityId: string }) {
    const [roles, setRoles] = useState<any[]>([]);
    const [activeRole, setActiveRole] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingRole, setIsAddingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');

    const permissionGroups = [
        {
            title: 'Messaging',
            icon: <MessageSquare size={16} />,
            permissions: [
                { id: 'post_messages', label: 'Post Messages', desc: 'Allow members to send messages in text channels' },
                { id: 'create_threads', label: 'Create Threads', desc: 'Allow members to create new threads' },
                { id: 'upload_files', label: 'Upload Files', desc: 'Allow members to upload images and files' },
            ]
        },
        {
            title: 'Live & Audio',
            icon: <Activity size={16} />,
            permissions: [
                { id: 'start_voice', label: 'Start Voice', desc: 'Allow members to start voice calls' },
                { id: 'host_stream', label: 'Host Stream', desc: 'Allow members to go live on the stage' },
            ]
        },
        {
            title: 'Management',
            icon: <Shield size={16} />,
            permissions: [
                { id: 'moderate_chat', label: 'Moderate Chat', desc: 'Delete messages and timeout users' },
                { id: 'invite_users', label: 'Invite Users', desc: 'Create invite links for others' },
                { id: 'create_event', label: 'Create Events', desc: 'Schedule and host community events' },
                { id: 'create_marketplace', label: 'Create Marketplace Items', desc: 'List items in the community shop' },
            ]
        }
    ];

    useEffect(() => {
        if (!communityId) return;
        const q = query(collection(db, 'communities', communityId, 'roles'), orderBy('order', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            const rolesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setRoles(rolesData);
            if (!activeRole && rolesData.length > 0) {
                setActiveRole(rolesData[0]);
            }
        });
        return () => unsub();
    }, [communityId]);

    const handleTogglePermission = (permissionId: string) => {
        if (!activeRole) return;
        const currentPermissions = activeRole.permissions || [];
        const newPermissions = currentPermissions.includes(permissionId)
            ? currentPermissions.filter((p: string) => p !== permissionId)
            : [...currentPermissions, permissionId];
        
        setActiveRole({ ...activeRole, permissions: newPermissions });
    };

    const handleSaveRole = async () => {
        if (!activeRole) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'communities', communityId, 'roles', activeRole.id), {
                ...activeRole,
                updatedAt: serverTimestamp()
            });
            toast.success('Role permissions updated');
        } catch (error) {
            toast.error('Failed to save role');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddRole = async () => {
        if (!newRoleName.trim()) return;
        try {
            const roleData = {
                name: newRoleName,
                color: '#8B5CF6',
                permissions: [],
                order: roles.length,
                isSystem: false,
                createdAt: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'communities', communityId, 'roles'), roleData);
            setNewRoleName('');
            setIsAddingRole(false);
            setActiveRole({ id: docRef.id, ...roleData });
            toast.success('New role created');
        } catch (error) {
            toast.error('Failed to create role');
        }
    };

    const deleteRole = async (roleId: string) => {
        if (confirm('Are you sure you want to delete this role?')) {
            try {
                await deleteDoc(doc(db, 'communities', communityId, 'roles', roleId));
                if (activeRole?.id === roleId) setActiveRole(roles.find(r => r.id !== roleId) || null);
                toast.success('Role removed');
            } catch (error) {
                toast.error('Deletion failed');
            }
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-black">Role Architect</h3>
                    <p className="text-sm text-foreground/40 font-medium">Design custom roles and map granular permissions.</p>
                </div>
                <button 
                    onClick={() => setIsAddingRole(true)}
                    className="px-5 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-primary/20 transition-all"
                >
                    <Plus size={16} /> New Role
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 min-h-[600px]">
                {/* Role List */}
                <div className="w-full lg:w-64 space-y-2">
                    <div className="px-2 py-2 text-[10px] font-black text-foreground/20 uppercase tracking-widest">Roles Hierarchy</div>
                    {roles.map((role) => (
                        <button
                            key={role.id}
                            onClick={() => setActiveRole(role)}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-4 rounded-2xl text-left transition-all ${
                                activeRole?.id === role.id 
                                    ? 'bg-white/10 ring-1 ring-white/10 shadow-xl' 
                                    : 'hover:bg-white/5 opacity-60 hover:opacity-100'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: role.color || '#fff' }} 
                                />
                                <span className={`text-sm font-black ${activeRole?.id === role.id ? 'text-white' : 'text-foreground/60'}`}>
                                    {role.name}
                                </span>
                            </div>
                            {activeRole?.id === role.id && !role.isSystem && (
                                <Trash2 
                                    size={14} 
                                    className="text-red-500/40 hover:text-red-500 cursor-pointer" 
                                    onClick={(e) => { e.stopPropagation(); deleteRole(role.id); }} 
                                />
                            )}
                        </button>
                    ))}

                    {isAddingRole && (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3"
                        >
                            <input 
                                autoFocus
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddRole()}
                                placeholder="Role Name..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setIsAddingRole(false)} className="flex-1 py-2 text-[10px] font-black uppercase text-foreground/20 hover:text-white transition-all">Cancel</button>
                                <button onClick={handleAddRole} className="flex-1 py-2 bg-primary text-white rounded-lg text-[10px] font-black uppercase shadow-lg">Create</button>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Permissions Matrix */}
                <div className="flex-1 space-y-8">
                    {activeRole ? (
                        <div className="bg-white/5 rounded-[2.5rem] border border-white/5 overflow-hidden">
                            <div className="px-8 py-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div 
                                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xl"
                                        style={{ backgroundColor: activeRole.color || '#8B5CF6' }}
                                    >
                                        <Shield size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                value={activeRole.name}
                                                onChange={e => setActiveRole({...activeRole, name: e.target.value})}
                                                className="bg-transparent border-none text-lg font-black outline-none w-48 focus:ring-1 ring-primary/20 rounded-lg px-2"
                                            />
                                            {activeRole.isSystem && <span className="px-2 py-0.5 bg-white/10 rounded text-[8px] font-black uppercase tracking-widest text-foreground/40">Default</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-black text-foreground/20 uppercase tracking-[0.15em]">Badge Color:</span>
                                            <input 
                                                type="color" 
                                                value={activeRole.color || '#8B5CF6'}
                                                onChange={e => setActiveRole({...activeRole, color: e.target.value})}
                                                className="w-4 h-4 rounded-full bg-transparent border-none cursor-pointer p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSaveRole}
                                    disabled={isSaving}
                                    className="px-6 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl shadow-primary/20"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                                    Update Role
                                </button>
                            </div>

                            <div className="p-8 space-y-12">
                                {permissionGroups.map((group) => (
                                    <div key={group.title} className="space-y-6">
                                        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                            <div className="p-2 bg-white/5 rounded-lg text-primary">
                                                {group.icon}
                                            </div>
                                            <h4 className="text-sm font-black uppercase tracking-[0.15em] text-foreground/40">{group.title}</h4>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {group.permissions.map((perm) => {
                                                const isEnabled = (activeRole.permissions || []).includes(perm.id);
                                                return (
                                                    <div 
                                                        key={perm.id}
                                                        onClick={() => handleTogglePermission(perm.id)}
                                                        className={`group p-6 rounded-3xl border transition-all cursor-pointer flex items-center justify-between ${
                                                            isEnabled 
                                                                ? 'bg-primary/5 border-primary/30 shadow-[0_0_20px_rgba(139,92,246,0.05)]' 
                                                                : 'bg-white/2 border-white/5 hover:border-white/10'
                                                        }`}
                                                    >
                                                        <div className="flex-1 pr-4">
                                                            <p className={`text-sm font-black transition-colors ${isEnabled ? 'text-white' : 'text-foreground/60 group-hover:text-foreground'}`}>
                                                                {perm.label}
                                                            </p>
                                                            <p className="text-[10px] font-medium text-foreground/30 mt-1 leading-relaxed">
                                                                {perm.desc}
                                                            </p>
                                                        </div>
                                                        <div className={`w-10 h-6 rounded-full p-1 transition-colors relative ${isEnabled ? 'bg-primary' : 'bg-white/10 group-hover:bg-white/20'}`}>
                                                            <motion.div 
                                                                animate={{ x: isEnabled ? 16 : 0 }}
                                                                className="w-4 h-4 bg-white rounded-full shadow-lg" 
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white/2 rounded-[2.5rem] border border-white/5 opacity-40">
                            <ShieldAlert size={48} />
                            <p className="text-sm font-black uppercase tracking-widest">Select a role to design</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SafetySection({ communityId }: { communityId: string }) {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'pending' | 'resolved' | 'dismissed' | 'all'>('pending');

    useEffect(() => {
        if (!communityId) return;

        const q = query(
            collection(db, 'communities', communityId, 'reports'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reportsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setReports(reportsData);
            setLoading(false);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, `communities/${communityId}/reports`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [communityId]);

    const handleAction = async (reportId: string, status: 'resolved' | 'dismissed', report: any) => {
        try {
            // 1. Update the report status
            await updateDoc(doc(db, 'communities', communityId, 'reports', reportId), {
                status,
                updatedAt: serverTimestamp(),
                resolvedBy: auth.currentUser?.uid,
                resolvedByName: auth.currentUser?.displayName
            });

            // 2. If resolving a message report, delete the content
            if (status === 'resolved' && report.targetType === 'message' && report.channelId) {
                try {
                    await deleteDoc(doc(db, 'communities', communityId, 'channels', report.channelId, 'messages', report.targetId));
                    toast.success('Content removed and report resolved');
                } catch (delError) {
                    console.error('Error deleting reported content:', delError);
                    toast.error('Report resolved, but failed to delete content (permissions?)');
                }
            } else {
                toast.success(`Report ${status}`);
            }
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/reports/${reportId}`);
        }
    };

    const stats = {
        pending: reports.filter(r => r.status === 'pending').length,
        resolved: reports.filter(r => r.status === 'resolved').length,
        dismissed: reports.filter(r => r.status === 'dismissed').length
    };

    const filteredReports = reports.filter(r => filter === 'all' ? true : r.status === filter);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/5 rounded-3xl p-6 border border-white/5 shadow-xl">
                    <p className="text-xs font-black text-foreground/40 uppercase tracking-widest">Pending Reports</p>
                    <h3 className="text-3xl font-black mt-2">{stats.pending}</h3>
                </div>
                <div className="bg-white/5 rounded-3xl p-6 border border-white/5 shadow-xl">
                    <p className="text-xs font-black text-foreground/40 uppercase tracking-widest">Resolved</p>
                    <h3 className="text-3xl font-black mt-2 text-primary">{stats.resolved}</h3>
                </div>
                <div className="bg-white/5 rounded-3xl p-6 border border-white/5 shadow-xl">
                   <p className="text-xs font-black text-foreground/40 uppercase tracking-widest">Dismissed</p>
                   <h3 className="text-3xl font-black mt-2 text-foreground/20">{stats.dismissed}</h3>
                </div>
            </div>

            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5 shadow-2xl">
                 <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-xl font-black">Community Safety Reports</h3>
                        <p className="text-xs text-foreground/40 font-medium">Review and moderate reported content</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {(['pending', 'resolved', 'dismissed', 'all'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                    filter === f ? 'bg-primary text-white' : 'bg-white/5 text-foreground/40 hover:bg-white/10'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                 </div>

                 <div className="space-y-4">
                     {filteredReports.map((report) => (
                         <div key={report.id} className="p-6 bg-white/2 rounded-[2rem] border border-white/5 flex items-center justify-between group hover:border-primary/20 transition-all">
                             <div className="flex items-center gap-5">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                    report.status === 'pending' ? 'bg-red-500/10 text-red-500' : 
                                    report.status === 'resolved' ? 'bg-primary/10 text-primary' : 'bg-white/5 text-foreground/20'
                                }`}>
                                   <ShieldAlert size={24} />
                                </div>
                                <div>
                                   <div className="flex items-center gap-3">
                                       <p className="text-base font-black capitalize">{report.reason}</p>
                                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                           report.status === 'pending' ? 'bg-red-500/10 text-red-500' : 
                                           report.status === 'resolved' ? 'bg-primary/10 text-primary' : 'bg-white/5 text-foreground/40'
                                       }`}>
                                           {report.status}
                                       </span>
                                   </div>
                                   <div className="flex items-center gap-2 mt-1">
                                       <p className="text-[10px] text-foreground/40 font-bold">Reported by @{report.reporterName || 'unknown'}</p>
                                       <span className="text-foreground/10 text-xs">•</span>
                                       <p className="text-[10px] text-foreground/40 font-bold">{formatDate(report.createdAt?.toDate ? report.createdAt.toDate() : new Date(report.createdAt), 'MMM d, HH:mm')}</p>
                                   </div>
                                   {report.contentSnippet && (
                                       <div className="mt-3 p-3 bg-black/20 rounded-xl border border-white/5 text-xs text-foreground/60 italic overflow-hidden max-w-md line-clamp-2">
                                           "{report.contentSnippet}"
                                       </div>
                                   )}
                                   {report.details && (
                                       <p className="mt-2 text-xs text-foreground/80 font-medium">Details: {report.details}</p>
                                   )}
                                </div>
                             </div>
                             
                             {report.status === 'pending' && (
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                   <button 
                                      onClick={() => handleAction(report.id, 'dismissed', report)}
                                      className="px-6 py-3 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                                   >
                                       Dismiss
                                   </button>
                                   <button 
                                      onClick={() => handleAction(report.id, 'resolved', report)}
                                      className="px-6 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                                   >
                                       Resolve
                                   </button>
                                </div>
                             )}
                         </div>
                     ))}
                     
                     {filteredReports.length === 0 && (
                         <div className="text-center py-20 bg-white/2 rounded-[2rem] border border-dashed border-white/10">
                             <ShieldCheck size={48} className="mx-auto text-foreground/10 mb-4" />
                             <p className="text-foreground/40 font-bold uppercase tracking-widest text-[10px]">All clear</p>
                             <p className="text-foreground/20 text-xs mt-1">No reports found for this filter</p>
                         </div>
                     )}
                 </div>
            </div>
        </div>
    );
}

function MonetizationSection({ communityId, form, setForm, onSave }: any) {
    return (
        <div className="space-y-8">
            <div className="bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-[3rem] p-10 border border-primary/20 relative overflow-hidden">
                <div className="relative z-10">
                   <h3 className="text-3xl font-black mb-4 flex items-center gap-4 text-white">
                      <CreditCard size={32} /> Monetize Your Vision
                   </h3>
                   <p className="text-white/60 text-lg max-w-xl font-medium leading-relaxed">
                      Enable subscription tiers, sell premium event access, or accept digital gifts from your community members.
                   </p>
                   <button className="mt-8 px-8 py-4 bg-white text-primary rounded-2xl font-black shadow-2xl hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-widest">
                      Connect Payout Wallet
                   </button>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5 space-y-6">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xl font-black">Paid Access</h4>
                        <div className={`w-12 h-6 rounded-full p-1 relative cursor-pointer transition-all ${form.isPaid ? 'bg-primary' : 'bg-white/10'}`} onClick={() => setForm({...form, isPaid: !form.isPaid})}>
                            <motion.div animate={{ x: form.isPaid ? 24 : 0 }} className="w-4 h-4 bg-white rounded-full shadow-lg" />
                        </div>
                    </div>
                    {form.isPaid && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1 block">Monthly Subscription Price ($)</label>
                                <input 
                                   type="number"
                                   value={form.price}
                                   onChange={(e) => setForm({...form, price: Number(e.target.value)})}
                                   className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-primary outline-none"
                                />
                            </div>
                            <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl text-xs text-primary font-bold">
                               Platform fee: 2.5% per transaction
                            </div>
                        </motion.div>
                    )}
                    <button 
                       onClick={() => onSave({ isPaid: form.isPaid, price: form.price })}
                       className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                    >
                        Save Pricing
                    </button>
                </div>

                <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                   <h4 className="text-xl font-black mb-6">Subscription Tiers</h4>
                   <div className="space-y-4 mb-6">
                      <div className="p-4 bg-white/2 rounded-2xl border border-white/5 flex items-center justify-between opacity-40">
                         <div className="flex items-center gap-3">
                            <Star className="text-yellow-500" />
                            <span className="font-bold">Elite Tier</span>
                         </div>
                         <span className="text-xs font-black text-primary">$19.99/mo</span>
                      </div>
                   </div>
                   <button className="w-full py-4 border-2 border-dashed border-white/5 rounded-2xl text-[10px] font-black text-foreground/20 uppercase tracking-[0.2em] hover:border-primary/40 hover:text-primary transition-all">
                      + Create Tier (Premium Only)
                   </button>
                </div>
            </div>
        </div>
    );
}

function LiveSection({ communityId }: { communityId: string }) {
    return (
        <div className="space-y-8">
            <h3 className="text-xl font-black">Live & Broadcast Permissions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                    { label: 'Everyone can go live', icon: <Globe size={20} />, enabled: false },
                    { label: 'Only verified hosts', icon: <ShieldCheck size={20} />, enabled: true },
                    { label: 'Auto-record all sessions', icon: <Activity size={20} />, enabled: true },
                    { label: 'Enable stage requests', icon: <UserPlus size={20} />, enabled: true }
                ].map((item, i) => (
                    <div key={i} className="p-6 bg-white/5 border border-white/5 rounded-3xl flex items-center justify-between group hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-foreground/40 group-hover:text-primary transition-colors">
                                {item.icon}
                            </div>
                            <span className="text-sm font-bold">{item.label}</span>
                        </div>
                        <div className={`w-10 h-5 rounded-full p-1 relative ${item.enabled ? 'bg-primary' : 'bg-white/10'}`}>
                           <div className={`w-3 h-3 bg-white rounded-full ${item.enabled ? 'ml-auto' : ''}`} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function GrowthSection({ communityId }: { communityId: string }) {
    const [invites, setInvites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newInvite, setNewInvite] = useState({
        code: '',
        rewardXp: 100,
        maxUses: 0,
        expiresInDays: 7
    });

    useEffect(() => {
        if (!communityId) return;
        const q = query(
            collection(db, 'communityInvites'), 
            where('communityId', '==', communityId),
            orderBy('createdAt', 'desc')
        );
        return onSnapshot(q, (snap) => {
            setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
    }, [communityId]);

    const handleCreateInvite = async () => {
        if (!auth.currentUser) return;
        
        const code = newInvite.code.trim() || Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // Expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + newInvite.expiresInDays);

        try {
            await addDoc(collection(db, 'communityInvites'), {
                communityId,
                creatorId: auth.currentUser.uid,
                code,
                rewardXp: Number(newInvite.rewardXp),
                maxUses: Number(newInvite.maxUses),
                uses: 0,
                createdAt: serverTimestamp(),
                expiresAt: expiresAt.toISOString()
            });
            setIsCreating(false);
            setNewInvite({
                code: '',
                rewardXp: 100,
                maxUses: 0,
                expiresInDays: 7
            });
            toast.success('Invite link generated');
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'communityInvites');
        }
    };

    const deleteInvite = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'communityInvites', id));
            toast.success('Invite link revoked');
        } catch (error) {
            toast.error('Failed to revoke invite');
        }
    };

    const copyToClipboard = (code: string) => {
        const url = `${window.location.origin}/feed?invite=${code}`;
        navigator.clipboard.writeText(url);
        toast.success('Invite link copied to clipboard');
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-primary" />
        </div>
    );

    const totalUses = invites.reduce((acc, curr) => acc + (curr.uses || 0), 0);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-xl font-black flex items-center gap-3">
                            <Share2 size={24} className="text-primary" /> Growth & Referrals
                        </h3>
                        <p className="text-sm text-foreground/40 font-medium">Generate invite links and track community growth statistics.</p>
                    </div>
                    <button 
                        onClick={() => setIsCreating(!isCreating)}
                        className="px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-primary/20 transition-all shadow-xl shadow-primary/5"
                    >
                        {isCreating ? <Trash2 size={16} /> : <Plus size={16} />}
                        {isCreating ? 'Cancel' : 'Generate Link'}
                    </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                   <div className="p-6 bg-white/2 border border-white/5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-foreground/20 uppercase tracking-widest mb-1">Active Links</p>
                      <p className="text-3xl font-black">{invites.length}</p>
                   </div>
                   <div className="p-6 bg-white/2 border border-white/5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-foreground/20 uppercase tracking-widest mb-1">Total Conversions</p>
                      <p className="text-3xl font-black text-green-500">{totalUses}</p>
                   </div>
                   <div className="p-6 bg-white/2 border border-white/5 rounded-3xl text-center">
                      <p className="text-[10px] font-black text-foreground/20 uppercase tracking-widest mb-1">Avg. Reward</p>
                      <p className="text-3xl font-black text-primary">
                         {invites.length > 0 ? Math.round(invites.reduce((acc, c) => acc + c.rewardXp, 0) / invites.length) : 0} XP
                      </p>
                   </div>
                </div>

                {isCreating && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8 p-8 bg-primary/5 border border-primary/20 rounded-[2.5rem] space-y-6 shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-3xl rounded-full" />
                        <h4 className="font-black text-sm uppercase tracking-widest text-primary relative">New Invite Configuration</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Custom Code (Optional)</label>
                                <input 
                                    value={newInvite.code}
                                    onChange={e => setNewInvite({...newInvite, code: e.target.value.toUpperCase()})}
                                    placeholder="RANDOM"
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">User XP Reward</label>
                                <input 
                                    type="number"
                                    value={newInvite.rewardXp}
                                    onChange={e => setNewInvite({...newInvite, rewardXp: Number(e.target.value)})}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Max Uses (0 = Infinity)</label>
                                <input 
                                    type="number"
                                    value={newInvite.maxUses}
                                    onChange={e => setNewInvite({...newInvite, maxUses: Number(e.target.value)})}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Expires In (Days)</label>
                                <input 
                                    type="number"
                                    value={newInvite.expiresInDays}
                                    onChange={e => setNewInvite({...newInvite, expiresInDays: Number(e.target.value)})}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all"
                                />
                            </div>
                        </div>
                        <button 
                            onClick={handleCreateInvite}
                            className="w-full py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            Generate Growth Catalyst
                        </button>
                    </motion.div>
                )}

                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-foreground/20 uppercase tracking-[0.2em] mb-4">Active Invite Links</h4>
                    {invites.length === 0 ? (
                        <div className="py-12 text-center bg-white/2 rounded-[2rem] border border-dashed border-white/5">
                            <p className="text-foreground/20 font-medium italic">No active invite links found.</p>
                        </div>
                    ) : (
                        invites.map((invite) => (
                            <div key={invite.id} className="p-6 bg-white/2 border border-white/5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 group hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-6">
                                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary relative overflow-hidden group-hover:scale-110 transition-all">
                                        <LinkIcon size={24} />
                                        <div className="absolute inset-0 bg-primary/10 animate-pulse" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h5 className="text-lg font-black tracking-tighter">{invite.code}</h5>
                                            <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[8px] font-black uppercase rounded shadow-sm">Active</span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-black text-foreground/40 uppercase tracking-widest">
                                                <Zap size={10} className="text-yellow-500" /> {invite.rewardXp} XP
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-black text-foreground/40 uppercase tracking-widest">
                                                <Users size={10} className="text-primary" /> {invite.uses} / {invite.maxUses === 0 ? '∞' : invite.maxUses} Uses
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-black text-foreground/40 uppercase tracking-widest">
                                                <Clock size={10} /> Exp: {formatDate(invite.expiresAt, 'MMM d')}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => copyToClipboard(invite.code)}
                                        className="px-6 py-3 bg-white/5 hover:bg-primary text-foreground/60 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 group/btn"
                                    >
                                        <Copy size={14} className="group-hover/btn:rotate-12 transition-transform" /> Copy Link
                                    </button>
                                    <button 
                                        onClick={() => deleteInvite(invite.id)}
                                        className="p-3 bg-white/5 hover:bg-red-500/10 text-foreground/20 hover:text-red-500 rounded-2xl transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function AutomationSection({ communityId, config, onSave }: { communityId: string, config: any, onSave: (updates: any) => void }) {
    const [welcomeConfig, setWelcomeConfig] = useState(config);
    const [channels, setChannels] = useState<any[]>([]);
    const [isSavingLocal, setIsSavingLocal] = useState(false);
    const [showChannelSuggestions, setShowChannelSuggestions] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [mentionCursorPos, setMentionCursorPos] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const filteredChannels = useMemo(() => {
        const filter = mentionFilter.toLowerCase();
        return channels
            .filter(c => c.name.toLowerCase().includes(filter))
            .slice(0, 5);
    }, [channels, mentionFilter]);

    const insertChannelMention = (channelName: string) => {
        const value = welcomeConfig.message || '';
        const before = value.slice(0, mentionCursorPos);
        const after = value.slice(textareaRef.current?.selectionStart || mentionCursorPos);
        
        const spaceIndex = value.indexOf(' ', mentionCursorPos);
        const sliceEnd = spaceIndex === -1 ? value.length : spaceIndex;
        const finalAfter = value.slice(sliceEnd);

        const insertedText = `#${channelName} `;
        const updatedMessage = `${before}${insertedText}${finalAfter}`;
        setWelcomeConfig({ ...welcomeConfig, message: updatedMessage });
        setShowChannelSuggestions(false);
        
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const cursorPosition = before.length + insertedText.length;
                textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
            }
        }, 0);
    };

    const insertEmoji = (emoji: string) => {
        const value = welcomeConfig.message || '';
        const cursor = textareaRef.current?.selectionStart || value.length;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        
        const updatedMessage = `${before}${emoji}${after}`;
        setWelcomeConfig({ ...welcomeConfig, message: updatedMessage });
        setShowEmojiPicker(false);
        
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newCursor = cursor + emoji.length;
                textareaRef.current.setSelectionRange(newCursor, newCursor);
            }
        }, 0);
    };

    useEffect(() => {
        if (!communityId) return;
        const q = query(collection(db, 'communities', communityId, 'channels'), orderBy('order', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [communityId]);

    const handleSaveWelcome = async () => {
        setIsSavingLocal(true);
        try {
            await onSave({ welcomeConfig });
        } finally {
            setIsSavingLocal(false);
        }
    };

    const addToggleButton = () => {
        setWelcomeConfig({
            ...welcomeConfig,
            buttons: [...(welcomeConfig.buttons || []), { label: 'Visit Website', url: 'https://' }]
        });
    };

    const removeButton = (index: number) => {
        const newButtons = [...welcomeConfig.buttons];
        newButtons.splice(index, 1);
        setWelcomeConfig({ ...welcomeConfig, buttons: newButtons });
    };

    const updateButton = (index: number, updates: any) => {
        const newButtons = [...welcomeConfig.buttons];
        newButtons[index] = { ...newButtons[index], ...updates };
        setWelcomeConfig({ ...welcomeConfig, buttons: newButtons });
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Welcome Message Configuration */}
            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5 shadow-2xl space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <Heart size={24} />
                        </div>
                        <div>
                            <h4 className="text-base font-black">Auto Welcome Message</h4>
                            <p className="text-xs text-foreground/40">Greet new members automatically when they join</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setWelcomeConfig({ ...welcomeConfig, enabled: !welcomeConfig.enabled })}
                        className={`w-14 h-7 rounded-full p-1 transition-all ${welcomeConfig.enabled ? 'bg-primary' : 'bg-white/10'}`}
                    >
                        <motion.div 
                            animate={{ x: welcomeConfig.enabled ? 28 : 0 }}
                            className="w-5 h-5 bg-white rounded-full shadow-lg"
                        />
                    </button>
                </div>

                <div className={`space-y-6 transition-all ${welcomeConfig.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">Target Channel</label>
                            <select 
                                value={welcomeConfig.channelId}
                                onChange={(e) => setWelcomeConfig({ ...welcomeConfig, channelId: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all"
                            >
                                <option value="">Select a channel...</option>
                                {channels.map(c => (
                                    <option key={c.id} value={c.id}>#{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Message Template</label>
                            <div className="flex gap-2">
                                {['username', 'community', 'channel:general'].map(tag => (
                                    <button 
                                        key={tag}
                                        onClick={() => setWelcomeConfig({ ...welcomeConfig, message: (welcomeConfig.message || '') + ` {${tag}}` })}
                                        className="text-[9px] font-black text-primary hover:underline"
                                    >
                                        +{tag}
                                    </button>
                                ))}
                                <div className="relative">
                                    <button 
                                        type="button"
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className="text-primary hover:text-primary/70 transition-colors"
                                    >
                                        <Smile size={14} />
                                    </button>
                                    <AnimatePresence>
                                        {showEmojiPicker && (
                                            <div className="absolute bottom-full right-0 mb-4 z-50">
                                                <div className="fixed inset-0" onClick={() => setShowEmojiPicker(false)} />
                                                <div className="relative z-10 shadow-2xl">
                                                    <EmojiPicker 
                                                        theme={typeof window !== 'undefined' && document.documentElement.classList.contains('dark') ? Theme.DARK : Theme.LIGHT}
                                                        onEmojiClick={(emojiData) => insertEmoji(emojiData.emoji)}
                                                        lazyLoadEmojis={true}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>
                        <div className="relative">
                            <AnimatePresence>
                                {showChannelSuggestions && filteredChannels.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-full left-0 mb-2 w-64 bg-background border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                                    >
                                        <div className="p-2 border-b border-white/5 bg-white/5">
                                            <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest px-2">Mention Channel</p>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto p-1">
                                            {filteredChannels.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => insertChannelMention(c.name)}
                                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 text-left transition-all group"
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                                                        <Hash size={14} className="text-primary" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                                            #{c.name}
                                                        </p>
                                                        {c.description && <p className="text-[10px] text-foreground/40 truncate">{c.description}</p>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <textarea 
                                value={welcomeConfig.message}
                                ref={textareaRef}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    const cursor = e.target.selectionStart || 0;
                                    setWelcomeConfig({ ...welcomeConfig, message: value });

                                    const lastHash = value.lastIndexOf('#', cursor - 1);
                                    if (lastHash !== -1) {
                                        const textAfterHash = value.slice(lastHash + 1, cursor);
                                        const charBeforeHash = lastHash === 0 ? '' : value[lastHash - 1];
                                        const isValidTrigger = !charBeforeHash || /\s/.test(charBeforeHash);

                                        if (isValidTrigger && !/\s/.test(textAfterHash)) {
                                            setMentionFilter(textAfterHash);
                                            setMentionCursorPos(lastHash);
                                            setShowChannelSuggestions(true);
                                            return;
                                        }
                                    }
                                    setShowChannelSuggestions(false);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && showChannelSuggestions && filteredChannels.length > 0) {
                                        e.preventDefault();
                                        insertChannelMention(filteredChannels[0].name);
                                    } else if (e.key === 'Escape' && showChannelSuggestions) {
                                        setShowChannelSuggestions(false);
                                    }
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded-[2rem] px-6 py-5 text-sm font-medium focus:border-primary outline-none transition-all min-h-[120px] resize-none"
                                placeholder="Welcome {username} to {community}!"
                            />
                        </div>
                        <p className="text-[10px] text-foreground/20 italic">Tip: Use #channel-name to mention channels directly.</p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest px-1">Action Buttons</label>
                            <button 
                                onClick={addToggleButton}
                                className="text-[10px] font-black text-primary flex items-center gap-1 hover:underline"
                            >
                                <Plus size={12} /> Add Button
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {welcomeConfig.buttons?.map((btn: any, idx: number) => (
                                <div key={idx} className="p-4 bg-white/2 border border-white/5 rounded-2xl flex flex-col gap-3 group relative">
                                    <button 
                                        onClick={() => removeButton(idx)}
                                        className="absolute top-2 right-2 text-foreground/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <X size={14} />
                                    </button>
                                    <input 
                                        type="text" 
                                        value={btn.label}
                                        onChange={(e) => updateButton(idx, { label: e.target.value })}
                                        placeholder="Button Label"
                                        className="bg-transparent border-b border-white/10 text-xs font-bold outline-none focus:border-primary pb-1"
                                    />
                                    <input 
                                        type="text" 
                                        value={btn.url}
                                        onChange={(e) => updateButton(idx, { url: e.target.value })}
                                        placeholder="URL (https://...)"
                                        className="bg-transparent text-[10px] text-foreground/40 outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        onClick={handleSaveWelcome}
                        disabled={isSavingLocal}
                        className="px-10 py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSavingLocal ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        Save Automation
                    </button>
                </div>
            </div>

            {/* Other automation placeholders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-white/2 border border-dashed border-white/10 rounded-[2rem] opacity-50">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4">
                        <Zap size={20} className="text-yellow-500" />
                    </div>
                    <h5 className="font-black text-sm mb-1">XP Level Up Announcer</h5>
                    <p className="text-[10px] text-foreground/40">Coming soon: Automatically shout out members when they rank up.</p>
                </div>
                <div className="p-6 bg-white/2 border border-dashed border-white/10 rounded-[2rem] opacity-50">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-4">
                        <Users size={20} className="text-blue-500" />
                    </div>
                    <h5 className="font-black text-sm mb-1">Member Milestones</h5>
                    <p className="text-[10px] text-foreground/40">Coming soon: Celebrate reaching 100, 1k, or 10k members.</p>
                </div>
            </div>
        </div>
    );
}

function InsightsSection({ stats }: { stats: any[] }) {
    return (
        <div className="space-y-8 h-full">
            <h3 className="text-xl font-black">Advanced Community Insights</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground/40 mb-8">Daily Message Volume</h4>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700}} />
                                <Tooltip 
                                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                    contentStyle={{backgroundColor: '#0F1219', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px'}}
                                    itemStyle={{color: '#fff', fontSize: '12px', fontWeight: 'bold'}}
                                    labelStyle={{color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginBottom: '4px', fontWeight: 'black', textTransform: 'uppercase'}}
                                />
                                <Bar dataKey="messages" radius={[10, 10, 0, 0]}>
                                    {stats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === stats.length - 1 ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                 </div>

                 <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground/40 mb-8">Growth Rate (%)</h4>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={stats}>
                                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700}} dy={10} />
                                <YAxis hide />
                                <Tooltip 
                                    contentStyle={{backgroundColor: '#0F1219', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px'}}
                                />
                                <Area type="stepAfter" dataKey="growth" stroke="#10b981" fill="#10b98133" strokeWidth={4} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                 </div>
            </div>

            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                <div className="flex items-center justify-between mb-8">
                   <h4 className="text-xl font-black">Retention Funnel</h4>
                   <span className="text-xs font-black text-green-500 bg-green-500/10 px-3 py-1 rounded-full uppercase tracking-widest">Healthy</span>
                </div>
                <div className="space-y-6">
                    {[
                        { step: 'Landing & Invited', value: '100%', progress: 100 },
                        { step: 'Joined & Authenticated', value: '74%', progress: 74 },
                        { step: 'Posted First Message', value: '62%', progress: 62 },
                        { step: 'Recurring Weekly User', value: '45%', progress: 45 }
                    ].map((row, i) => (
                        <div key={i} className="space-y-2">
                           <div className="flex justify-between text-xs font-black">
                              <span className="text-foreground/40">{row.step}</span>
                              <span className="text-foreground">{row.value}</span>
                           </div>
                           <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${row.progress}%` }}
                                 className="h-full bg-primary/40 rounded-full"
                              />
                           </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function IntegrationsSection() {
    return (
        <div className="space-y-8">
            <h3 className="text-xl font-black">Third-party Ecosystem</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                    { name: 'Discord Synchronization', desc: 'Sync roles and messages with Discord', icon: <MessageSquare className="text-[#5865F2]" />, connected: false },
                    { name: 'GitHub Webhooks', desc: 'Auto-post repo updates to #code', icon: <Github className="text-white" />, connected: true },
                    { name: 'Stripe Connect', desc: 'Manage payouts and payouts', icon: <CreditCard className="text-[#635BFF]" />, connected: false },
                    { name: 'Google Calendar', desc: 'Sync community events with GCal', icon: <Calendar className="text-[#4285F4]" />, connected: false }
                ].map((item, i) => (
                    <div key={i} className="p-6 bg-white/5 border border-white/5 rounded-[2.5rem] flex items-center justify-between group hover:border-white/20 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shadow-xl">
                                {item.icon}
                            </div>
                            <div>
                                <h5 className="font-black text-sm">{item.name}</h5>
                                <p className="text-[11px] text-foreground/40 mt-0.5">{item.desc}</p>
                            </div>
                        </div>
                        <button className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${item.connected ? 'bg-green-500/10 text-green-500' : 'bg-white/5 hover:bg-white/10 text-foreground/40 hover:text-foreground'}`}>
                            {item.connected ? 'Connected' : 'Connect'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AdvancedSection({ communityId }: { communityId: string }) {
    return (
        <div className="space-y-8">
            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                <h4 className="text-xl font-black mb-6 text-red-500 flex items-center gap-3">
                   <AlertTriangle size={24} /> Danger Zone
                </h4>
                <p className="text-sm font-medium text-foreground/40 mb-8 max-w-xl">
                    Once you delete a community, all data, channels, messages and member records will be permanently erased. This action is irreversible.
                </p>
                <div className="flex flex-col md:flex-row gap-4">
                    <button className="px-8 py-4 bg-red-500/10 text-red-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                       Archive Community
                    </button>
                    <button className="px-8 py-4 bg-red-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:scale-105 active:scale-95 transition-all">
                       Delete Community Permanently
                    </button>
                </div>
            </div>

            <div className="bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                <h4 className="text-xl font-black mb-6">Ownership Transfer</h4>
                <p className="text-sm font-medium text-foreground/40 mb-8">
                   Transfer the full ownership of this community to another member. You will become a moderator.
                </p>
                <div className="flex gap-4">
                    <input 
                       type="text"
                       placeholder="Enter member username..."
                       className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-bold focus:border-primary outline-none"
                    />
                    <button className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                       Transfer
                    </button>
                </div>
            </div>
        </div>
    );
}
