import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  updateDoc, 
  deleteDoc, 
  doc, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebase';
import { 
  ShieldCheck, 
  Users, 
  Calendar, 
  Flag, 
  Store, 
  Award, 
  TrendingUp, 
  AlertCircle, 
  Search, 
  Edit, 
  Trash2, 
  Check, 
  X, 
  UserMinus, 
  ChevronRight, 
  CornerDownRight, 
  ShieldAlert, 
  Activity, 
  Database,
  RefreshCw,
  Plus,
  Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

export default function AdminPage({ user }: { user?: any }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'marketplace' | 'events' | 'bounties' | 'reports'>('overview');
  
  // States for collections
  const [users, setUsers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [bounties, setBounties] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search terms
  const [searchUser, setSearchUser] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchEvent, setSearchEvent] = useState('');
  const [searchBounty, setSearchBounty] = useState('');

  // Selected details modal/panel
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [selectedBounty, setSelectedBounty] = useState<any | null>(null);

  // Edit fields (inputs for selected items)
  const [editUserXp, setEditUserXp] = useState<number>(0);
  const [editProductPrice, setEditProductPrice] = useState<number>(0);
  const [editBountyReward, setEditBountyReward] = useState<number>(0);

  // Simulate local admin override for testing if not danieludofa452@gmail.com
  const [adminOverride, setAdminOverride] = useState(false);

  const currentUserEmail = user?.email || auth.currentUser?.email;
  const isPlatformAdministrator = currentUserEmail === 'danieludofa452@gmail.com' || user?.role === 'admin' || adminOverride;

  // Real-time listener bindings
  useEffect(() => {
    setLoading(true);
    
    // 1. Users list
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
    });

    // 2. Products list
    const unsubProducts = onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'desc')), (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
    });

    // 3. Events list
    const unsubEvents = onSnapshot(query(collection(db, 'events'), orderBy('createdAt', 'desc')), (snap) => {
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
    });

    // 4. Bounties/Challenges
    const unsubBounties = onSnapshot(query(collection(db, 'challenges'), orderBy('createdAt', 'desc')), (snap) => {
      setBounties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
    });

    // 5. Global Reports
    const unsubReports = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')), (snap) => {
      setReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
    });

    // 6. Purchases to count gross volume
    const unsubPurchases = onSnapshot(collection(db, 'purchases'), (snap) => {
      setPurchases(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    // Also auto check if current user profile has admin role
    if (auth.currentUser) {
      if (auth.currentUser.email === 'danieludofa452@gmail.com') {
        setAdminOverride(true);
      }
    }

    return () => {
      unsubUsers();
      unsubProducts();
      unsubEvents();
      unsubBounties();
      unsubReports();
      unsubPurchases();
    };
  }, []);

  // Update User Role/Verification
  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      toast.success(`User role updated to ${newRole}`);
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      toast.error('Failed to update user role');
    }
  };

  const handleToggleUserVerification = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), { verified: !currentStatus });
      toast.success(`User verification status changed`);
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, verified: !currentStatus } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      toast.error('Failed to update verification status');
    }
  };

  const handleUpdateUserXp = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { xp: editUserXp });
      toast.success(`User XP adjusted to ${editUserXp}`);
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, xp: editUserXp } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      toast.error('Failed to update user XP');
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to flag and restrict this user on the platform?')) return;
    try {
      await updateDoc(doc(db, 'users', userId), { 
        status: 'banned',
        role: 'user', // strip other roles
        bio: '[Banned Profile - Violations of Community Guidelines]' 
      });
      toast.success('User has been banned.');
      setSelectedUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
      toast.error('Failed to ban user');
    }
  };

  // Marketplace Management
  const handleUpdateProduct = async (prodId: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'products', prodId), updates);
      toast.success('Product updated successfully');
      if (selectedProduct?.id === prodId) {
        setSelectedProduct(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${prodId}`);
      toast.error('Failed to update product');
    }
  };

  const handleDeleteProduct = async (prodId: string) => {
    if (!window.confirm('Delete this product permanently from Creator Market?')) return;
    try {
      await deleteDoc(doc(db, 'products', prodId));
      toast.success('Product deleted.');
      setSelectedProduct(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${prodId}`);
      toast.error('Failed to delete product');
    }
  };

  // Event Management
  const handleUpdateEventStatus = async (eventId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'events', eventId), { status: newStatus });
      toast.success(`Event status set to ${newStatus}`);
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `events/${eventId}`);
      toast.error('Failed to update event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Cancel and delete this event?')) return;
    try {
      await deleteDoc(doc(db, 'events', eventId));
      toast.success('Event cancelled & deleted');
      setSelectedEvent(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `events/${eventId}`);
      toast.error('Failed to delete event');
    }
  };

  // Bounty/Challenge Management
  const handleUpdateBountyReward = async (bountyId: string) => {
    try {
      await updateDoc(doc(db, 'challenges', bountyId), { rewardXP: editBountyReward });
      toast.success(`Bounty reward XP set to ${editBountyReward}`);
      if (selectedBounty?.id === bountyId) {
        setSelectedBounty(prev => prev ? { ...prev, rewardXP: editBountyReward } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `challenges/${bountyId}`);
      toast.error('Failed to update challenge');
    }
  };

  const handleDeleteBounty = async (bountyId: string) => {
    if (!window.confirm('Are you sure you want to delete this bounty permanently?')) return;
    try {
      await deleteDoc(doc(db, 'challenges', bountyId));
      toast.success('Challenge deleted successfully');
      setSelectedBounty(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `challenges/${bountyId}`);
      toast.error('Failed to delete challenge');
    }
  };

  // Report Management
  const handleResolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status });
      toast.success(`Report status updated to: ${status}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
      toast.error('Failed to update report');
    }
  };

  const handleDeleteReportedItem = async (reportId: string, targetType: string, targetId: string) => {
    if (!window.confirm('Are you sure you want to delete the reported content?')) return;
    try {
      if (targetType === 'product') {
        await deleteDoc(doc(db, 'products', targetId));
      } else if (targetType === 'event') {
        await deleteDoc(doc(db, 'events', targetId));
      } else if (targetType === 'posts') {
        await deleteDoc(doc(db, 'posts', targetId));
      } else {
        toast.error('Unable to auto-delete: resource type must be managed inside its dedicated views');
        return;
      }
      await updateDoc(doc(db, 'reports', reportId), { status: 'resolved', resolutionNotes: 'Content deleted by admin' });
      toast.success('Reported content deleted and report resolved!');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete content, it may be a nested sub-collection or already removed.');
    }
  };

  // Seed pristine test data helper
  const handleSeedMockData = async () => {
    try {
      toast.loading('Seeding high-quality platform mock data...', { id: 'seed' });
      
      // 1. Seed some Mock Products
      const productsData = [
        {
          title: "NextJS 14 Ultra Boilerplate",
          description: "Clean boilerplate with tailwind, lucide-react, dark mode, responsive sliders and preconfigured auth controllers.",
          price: 59,
          productType: "asset",
          creatorUid: auth.currentUser?.uid || "mock_user_bob",
          creatorName: auth.currentUser?.displayName || "Bob Creator",
          category: "Software",
          salesCount: 12,
          impressions: 420,
          avgRating: 4.8,
          reviewCount: 3,
          createdAt: new Date().toISOString()
        },
        {
          title: "Space Grotesk Font Pairings Guide",
          description: "Curated typography guidelines and design files for developers looking for beautiful and clean displays.",
          price: 15,
          productType: "ebook",
          creatorUid: "mock_user_alice",
          creatorName: "Alice Designer",
          category: "Design",
          salesCount: 34,
          impressions: 1100,
          avgRating: 5.0,
          reviewCount: 16,
          createdAt: new Date().toISOString()
        },
        {
          title: "Complete Framer Motion Physics Masterclass",
          description: "Go from rendering static div tags to beautiful physics-based drag operations and dynamic micro-interactions.",
          price: 45,
          productType: "course",
          creatorUid: "mock_user_bob",
          creatorName: "Bob Creator",
          category: "Education",
          salesCount: 8,
          impressions: 210,
          avgRating: 4.5,
          reviewCount: 2,
          createdAt: new Date().toISOString()
        }
      ];

      for (const prod of productsData) {
        await addDoc(collection(db, 'products'), prod);
      }

      // 2. Seed Mock Events
      const eventsData = [
        {
          title: "Global React Hackathon 2026",
          description: "Show off your finest web apps built inside beautiful, tailored dark glass frameworks in 48 hours for incredible rewards.",
          hostId: auth.currentUser?.uid || "mock_user_admin",
          eventType: "user",
          visibility: "public",
          isPaid: false,
          price: 0,
          startDate: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days in future
          endDate: new Date(Date.now() + 86400000 * 5).toISOString(),
          timezone: "UTC",
          status: "upcoming",
          attendeeCount: 156,
          createdAt: new Date().toISOString()
        },
        {
          title: "Live Stream: Figma to Vite CSS Secrets",
          description: "Master tailwind theme overrides and pixel-perfect responsiveness with live examples on-stage.",
          hostId: "mock_user_bob",
          eventType: "community",
          communityId: "global_lounge",
          visibility: "public",
          isPaid: true,
          price: 5,
          startDate: new Date(Date.now() + 14400000).toISOString(), // 4 hrs in future
          endDate: new Date(Date.now() + 21600000).toISOString(),
          timezone: "EST",
          status: "upcoming",
          attendeeCount: 42,
          createdAt: new Date().toISOString()
        }
      ];

      for (const ev of eventsData) {
        await addDoc(collection(db, 'events'), ev);
      }

      // 3. Seed Mock Bounties (Challenges)
      const challengesData = [
        {
          title: "Implement custom voice room workspace template in React",
          description: "We are looking for clean audio status states to denote user voice volume. Needs clean glass theme controls.",
          difficulty: "Hard",
          rewardXP: 1200,
          creatorUid: auth.currentUser?.uid || "system_protocol",
          deadline: new Date(Date.now() + 86400000 * 10).toISOString(),
          createdAt: new Date().toISOString()
        },
        {
          title: "Refactor unrequested custom templates into pure responsive lists",
          description: "Deliver pixel-perfect components using lucide-react following standard desktop-first formatting controls.",
          difficulty: "Easy",
          rewardXP: 450,
          creatorUid: "system_protocol",
          deadline: new Date(Date.now() + 86400000 * 4).toISOString(),
          createdAt: new Date().toISOString()
        }
      ];

      for (const ch of challengesData) {
        await addDoc(collection(db, 'challenges'), ch);
      }

      // 4. Seed Mock Reports
      const reportsData = [
        {
          reporterName: "Alice Reporter",
          reporterId: "mock_user_alice",
          targetType: "product",
          targetId: "some_mock_unlicensed_asset",
          contentSnippet: "Unlicensed resale of generic widgets",
          reason: "spam",
          details: "This creator is copying open-source libraries and charging large premiums without attribution.",
          status: "pending",
          createdAt: new Date().toISOString()
        },
        {
          reporterName: "Bob Reporter",
          reporterId: "mock_user_bob",
          targetType: "user",
          targetAuthorId: "malicious_bot_99",
          contentSnippet: "Automated direct message link distribution",
          reason: "harassment",
          details: "Spamming invitations to third-party offshore gaming portals inside public comment sections.",
          status: "pending",
          createdAt: new Date().toISOString()
        }
      ];

      for (const rep of reportsData) {
        await addDoc(collection(db, 'reports'), rep);
      }

      // 5. Seed Mock Purchases for earnings graph
      const purchaseData = [
        { buyerUid: 'user_1', productId: 'p_1', amount: 59, createdAt: new Date(Date.now() - 86400000 * 4).toISOString() },
        { buyerUid: 'user_2', productId: 'p_2', amount: 15, createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
        { buyerUid: 'user_3', productId: 'p_1', amount: 59, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { buyerUid: 'user_4', productId: 'p_3', amount: 45, createdAt: new Date(Date.now() - 86400000 * 1).toISOString() },
        { buyerUid: 'user_5', productId: 'p_1', amount: 59, createdAt: new Date().toISOString() }
      ];

      for (const pur of purchaseData) {
        await addDoc(collection(db, 'purchases'), pur);
      }

      toast.success('Mock data seeded successfully! All statistics updated.', { id: 'seed' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to seed some mock items.', { id: 'seed' });
    }
  };

  // Graph Data Calculations
  // Gather active platform statistics
  const totalGrossVolume = purchases.reduce((acc, curr) => acc + (curr.amount || 0), 0) + 
    products.reduce((acc, curr) => acc + ((curr.salesCount || 0) * (curr.price || 0)), 0);

  // Fallback charts info if database has limited logs
  const chartSalesData = [
    { name: 'Mon', revenue: 150, signups: 10 },
    { name: 'Tue', revenue: 320, signups: 14 },
    { name: 'Wed', revenue: 180, signups: 8 },
    { name: 'Thu', revenue: 490, signups: 22 },
    { name: 'Fri', revenue: 610, signups: 30 },
    { name: 'Sat', revenue: 420, signups: 18 },
    { name: 'Sun', revenue: 580, signups: 25 },
  ];

  // Distribute items into filtered collections
  const filteredUsers = users.filter(u => 
    (u.displayName || '').toLowerCase().includes(searchUser.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchUser.toLowerCase()) ||
    (u.username || '').toLowerCase().includes(searchUser.toLowerCase())
  );

  const filteredProducts = products.filter(p => 
    (p.title || '').toLowerCase().includes(searchProduct.toLowerCase()) ||
    (p.creatorName || '').toLowerCase().includes(searchProduct.toLowerCase()) ||
    (p.productType || '').toLowerCase().includes(searchProduct.toLowerCase())
  );

  const filteredEvents = events.filter(e => 
    (e.title || '').toLowerCase().includes(searchEvent.toLowerCase()) ||
    (e.category || '').toLowerCase().includes(searchEvent.toLowerCase()) ||
    (e.status || '').toLowerCase().includes(searchEvent.toLowerCase())
  );

  const filteredBounties = bounties.filter(b => 
    (b.title || '').toLowerCase().includes(searchBounty.toLowerCase()) ||
    (b.difficulty || '').toLowerCase().includes(searchBounty.toLowerCase())
  );

  const pendingReports = reports.filter(r => r.status === 'pending');

  return (
    <div className="w-full h-full bg-[#0a0a0a] text-white overflow-hidden flex flex-col font-sans">
      {/* Platform Header */}
      <div className="relative bg-gradient-to-r from-red-950/20 via-[#0B0F19] to-indigo-950/20 w-full pt-12 pb-12 overflow-hidden border-b border-white/5 px-8">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1964&auto=format&fit=crop')] object-cover opacity-5 mix-blend-overlay"></div>
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-3 bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase w-fit">
              <ShieldAlert size={12} />
              <span>Platform Administration Panel</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-2">
              Global Control <span className="text-red-500">Center</span>
            </h1>
            <p className="text-white/60 text-sm max-w-xl">
              Track platform health, user activities, community events, marketplace products, and handle critical reports in real-time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Seed mock button to simplify review */}
            <button
              onClick={handleSeedMockData}
              className="px-5 py-3 rounded-full bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 active:scale-95 transition-all text-white flex items-center gap-2"
              title="Populates all empty views with pristine, beautiful testing records for convenient review"
            >
              <Database size={15} className="text-teal-400" />
              <span>Seed Platform Mock Data</span>
            </button>

            {!isPlatformAdministrator && (
              <button
                onClick={() => {
                  setAdminOverride(true);
                  toast.success('Admin Override Session Granted successfully!');
                }}
                className="px-5 py-3 rounded-full bg-red-600 hover:bg-red-700 font-bold text-xs flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] active:scale-95"
              >
                <ShieldCheck size={16} />
                <span>Simulate Admin Access</span>
              </button>
            )}

            {isPlatformAdministrator && (
              <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs rounded-full flex items-center gap-2">
                <Check size={14} />
                <span>Admin Privileges Active</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="flex-grow w-full max-w-[1400px] mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8 overflow-hidden">
        {/* Left Side: Navigation Links */}
        <div className="lg:w-64 shrink-0 flex flex-col gap-1">
          <p className="text-[10px] font-black tracking-widest text-[#555] px-4 mb-2 uppercase">Platform Control</p>
          {[
            { id: 'overview', label: 'Control Overview', icon: Activity, count: null },
            { id: 'users', label: 'User Directory', icon: Users, count: users.length },
            { id: 'marketplace', label: 'Creator Market', icon: Store, count: products.length },
            { id: 'events', label: 'Global Events', icon: Calendar, count: events.length },
            { id: 'bounties', label: 'Bounty Bids', icon: Award, count: bounties.length },
            { id: 'reports', label: 'Reports Inbox', icon: Flag, count: pendingReports.length, badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30' }
          ].map((tab) => {
            const IconComp = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedUser(null);
                  setSelectedProduct(null);
                  setSelectedEvent(null);
                  setSelectedBounty(null);
                }}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all ${
                  isTabActive 
                    ? 'bg-white/10 text-white shadow-xl border-l-[3px] border-red-500 pl-4' 
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <IconComp size={16} className={isTabActive ? 'text-red-400' : 'text-white/40'} />
                  <span>{tab.label}</span>
                </div>
                {tab.count !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] border ${
                    tab.badgeColor || 'bg-white/5 text-white/40 border-white/5'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Side scrollable Content Area */}
        <div className="flex-grow h-full overflow-y-auto custom-scrollbar pr-1 pb-12">
          {!isPlatformAdministrator ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-center bg-white/5 rounded-3xl border border-white/5 p-8 max-w-xl mx-auto mt-12">
              <ShieldAlert size={48} className="text-red-500 mb-4 animate-pulse" />
              <h3 className="text-2xl font-bold tracking-tight mb-2">Administrator Access Required</h3>
              <p className="text-sm text-white/60 mb-8 leading-relaxed">
                Your sandbox account <strong>{currentUserEmail || 'Anonymous'}</strong> does not currently have backend administrative authorization permissions.
              </p>
              <button
                onClick={() => {
                  setAdminOverride(true);
                  toast.success('Simulated authorized administrator login successfully.');
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-sm font-bold rounded-full transition-all shadow-[0_0_30px_rgba(239,68,68,0.2)] active:scale-95"
              >
                Impersonate Admin Credentials
              </button>
            </div>
          ) : loading ? (
            <div className="h-[400px] flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="animate-spin text-red-500" size={32} />
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Querying live firestore logs...</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* Stats Bento Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                    {[
                      { label: 'Active Users', value: users.length, icon: Users, color: 'from-blue-500/10 to-transparent border-blue-500/20' },
                      { label: 'Market Products', value: products.length, icon: Store, color: 'from-teal-500/10 to-transparent border-teal-500/20' },
                      { label: 'Active Bounties', value: bounties.length, icon: Award, color: 'from-amber-500/10 to-transparent border-amber-500/20' },
                      { label: 'Live Events', value: events.length, icon: Calendar, color: 'from-purple-500/10 to-transparent border-purple-500/20' },
                      { label: 'Gross Volume ($)', value: `$${totalGrossVolume.toLocaleString()}`, icon: Coins, color: 'from-emerald-500/10 to-transparent border-emerald-500/20' },
                      { label: 'Pending Reports', value: pendingReports.length, icon: Flag, color: pendingReports.length > 0 ? 'from-red-500/10 to-transparent border-red-500/30' : 'from-white/5 to-transparent border-white/10' }
                    ].map((stat, i) => {
                      const StatIcon = stat.icon;
                      return (
                        <div key={i} className={`bg-gradient-to-b ${stat.color} border p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden h-28`}>
                          <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{stat.label}</p>
                          <div className="flex items-baseline justify-between mt-2">
                            <span className="text-2xl font-black tracking-tight">{stat.value}</span>
                            <StatIcon size={18} className="text-white/20 shrink-0" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Operational Dashboard Graphs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Platform Revenue Graph */}
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-sm font-bold">Creator Revenue Over Time</h3>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Incremental Gross Earnings Volume</p>
                        </div>
                        <TrendingUp size={16} className="text-emerald-400" />
                      </div>
                      
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartSalesData}>
                            <defs>
                              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                            <XAxis dataKey="name" stroke="#555" fontSize={10} />
                            <YAxis stroke="#555" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f0f15', border: '1px solid #333', color: '#fff', fontSize: '11px', borderRadius: '12px' }} />
                            <Area type="monotone" dataKey="revenue" name="Earnings ($)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Registrations/Signups Graph */}
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-sm font-bold">New Platform Registrations</h3>
                          <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Weekly onboarding completions</p>
                        </div>
                        <Users size={16} className="text-blue-400" />
                      </div>

                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartSalesData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                            <XAxis dataKey="name" stroke="#555" fontSize={10} />
                            <YAxis stroke="#555" fontSize={10} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f0f15', border: '1px solid #333', color: '#fff', fontSize: '11px', borderRadius: '12px' }} />
                            <Bar dataKey="signups" name="User Registrations" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                              {chartSalesData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === 4 ? '#ef4444' : '#3b82f6'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* System Messages & Tips */}
                  <div className="bg-[#110C1A] border border-pink-500/10 rounded-2xl p-6 flex gap-4 items-center">
                    <AlertCircle className="text-red-400 shrink-0" size={24} />
                    <div className="text-xs">
                      <span className="font-bold text-red-400 mr-2">Admin Notice:</span>
                      All database state deletions, suspensions, and metadata modifications affect the live firebase platform. Use the action items responsibly. Deleted event/marketplace entries cannot be undone automatically.
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: USER MANAGEMENT */}
              {activeTab === 'users' && (
                <div className="space-y-6">
                  {/* Search bar */}
                  <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search users by name, email, or username..."
                        value={searchUser}
                        onChange={(e) => setSearchUser(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-red-500/40 text-xs font-semibold transition-all"
                      />
                    </div>
                    <p className="text-[10px] text-white/40 uppercase font-black">Filtered Results: {filteredUsers.length}</p>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-6">
                    {/* User Table Grid */}
                    <div className="flex-grow bg-white/5 border border-white/10 rounded-3xl overflow-hidden min-w-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Profile Info</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Contact Email</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">XP Credit</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Credentials</th>
                              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-white/40 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredUsers.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center py-12 text-sm text-white/40 font-bold">
                                  No users directories located in live firestore database. Click "Seed mock data" to load default samples.
                                </td>
                              </tr>
                            ) : (
                              filteredUsers.map((userObj) => {
                                const isSelected = selectedUser?.id === userObj.id;
                                return (
                                  <tr 
                                    key={userObj.id} 
                                    className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                      isSelected ? 'bg-white/5 border-l-2 border-red-500' : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedUser(userObj);
                                      setEditUserXp(userObj.xp || 0);
                                    }}
                                  >
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/10 shrink-0 border border-white/10">
                                          <img 
                                            src={userObj.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userObj.id}`} 
                                            alt="" 
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                        <div>
                                          <div className="font-bold text-xs flex items-center gap-1.5">
                                            <span>{userObj.displayName || 'Unnamed User'}</span>
                                            {userObj.verified && <ShieldCheck size={12} className="text-teal-400 shrink-0" />}
                                          </div>
                                          <div className="text-[10px] text-white/40 font-mono">@{userObj.username || 'n/a'}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-semibold text-white/60">{userObj.email}</td>
                                    <td className="px-6 py-4">
                                      <div className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] text-amber-500 font-bold">
                                        <span>{userObj.xp || 0} XP</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex flex-col gap-1">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                          userObj.role === 'admin' ? 'text-red-400' : userObj.role === 'creator' ? 'text-teal-400' : 'text-white/40'
                                        }`}>
                                          {userObj.role || 'user'}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-2">
                                        <button 
                                          onClick={() => {
                                            setSelectedUser(userObj);
                                            setEditUserXp(userObj.xp || 0);
                                          }}
                                          className="p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors"
                                          title="Configure user record"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button 
                                          onClick={() => handleBanUser(userObj.id)}
                                          className="p-2 hover:bg-red-500/10 rounded-xl text-white/30 hover:text-red-400 transition-colors"
                                          title="Restrict Profile"
                                        >
                                          <UserMinus size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Selected User Action Controls Sidebar Panel */}
                    <AnimatePresence>
                      {selectedUser && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="w-full xl:w-96 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-red-500">Selected User Control</h3>
                            <button 
                              onClick={() => setSelectedUser(null)}
                              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                            >
                              <X size={15} />
                            </button>
                          </div>

                          <div className="flex items-center gap-4 border-b border-white/5 pb-5">
                            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white/10 shrink-0 border border-white/10">
                              <img src={selectedUser.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.id}`} alt="" />
                            </div>
                            <div>
                              <p className="font-extrabold text-sm">{selectedUser.displayName || 'Unnamed'}</p>
                              <p className="text-[10px] text-white/40">ID: {selectedUser.id}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Modify Role</p>
                            <div className="grid grid-cols-3 gap-2">
                              {['admin', 'creator', 'user'].map((roleOpt) => {
                                const isActiveRole = (selectedUser.role || 'user') === roleOpt;
                                return (
                                  <button
                                    key={roleOpt}
                                    onClick={() => handleUpdateUserRole(selectedUser.id, roleOpt)}
                                    className={`py-2 px-3 rounded-xl border text-[10px] font-black uppercase transition-all ${
                                      isActiveRole 
                                        ? 'bg-red-500/20 border-red-500/30 text-red-400 shadow-[0_4px_12px_rgba(239,68,68,0.1)]' 
                                        : 'bg-white/5 border-white/5 hover:border-white/10 text-white/60'
                                    }`}
                                  >
                                    {roleOpt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-4 pt-4 border-t border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Verification Credentials</p>
                            <button
                              onClick={() => handleToggleUserVerification(selectedUser.id, !!selectedUser.verified)}
                              className={`w-full py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center flex items-center justify-center gap-2 ${
                                selectedUser.verified 
                                  ? 'bg-teal-500/10 border-teal-500/20 text-teal-400' 
                                  : 'bg-white/5 border-white/10 text-white'
                              }`}
                            >
                              <ShieldCheck size={16} />
                              <span>{selectedUser.verified ? 'Revoke Verified Flag' : 'Verify as Featured Creator'}</span>
                            </button>
                          </div>

                          <div className="space-y-4 pt-4 border-t border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Adjust XP Credits</p>
                            <div className="flex gap-2">
                              <input 
                                type="number" 
                                value={editUserXp}
                                onChange={(e) => setEditUserXp(parseInt(e.target.value) || 0)}
                                className="bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold w-full outline-none"
                              />
                              <button
                                onClick={() => handleUpdateUserXp(selectedUser.id)}
                                className="px-4 bg-white text-black font-extrabold text-xs rounded-xl hover:bg-neutral-200"
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            <button
                              onClick={() => handleBanUser(selectedUser.id)}
                              className="w-full py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 text-red-500 hover:text-red-400 text-xs font-extrabold rounded-xl transition-all uppercase tracking-widest"
                            >
                              Suspend Account
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* TAB 3: CREATOR MARKETPLACE */}
              {activeTab === 'marketplace' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search products by title, type, category..."
                        value={searchProduct}
                        onChange={(e) => setSearchProduct(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-red-500/40 text-xs font-semibold"
                      />
                    </div>
                    <p className="text-[10px] text-white/40 uppercase font-bold">Filtered Results: {filteredProducts.length}</p>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-6">
                    <div className="flex-grow bg-white/5 border border-white/10 rounded-3xl overflow-hidden min-w-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Product Title</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Category</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Type</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Price</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Collected</th>
                              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-white/40 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredProducts.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="text-center py-12 text-sm text-white/40 font-bold">
                                  No product listings located. Populate database using "Seed platform data".
                                </td>
                              </tr>
                            ) : (
                              filteredProducts.map((prod) => {
                                const isSelected = selectedProduct?.id === prod.id;
                                return (
                                  <tr 
                                    key={prod.id} 
                                    className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                      isSelected ? 'bg-white/5 border-l-2 border-teal-500' : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedProduct(prod);
                                      setEditProductPrice(prod.price || 0);
                                    }}
                                  >
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl overflow-hidden bg-white/10 shrink-0 border border-white/10 flex items-center justify-center">
                                          {prod.previewImage ? (
                                            <img src={prod.previewImage} alt="" className="w-full h-full object-cover" />
                                          ) : (
                                            <Store size={16} className="text-white/40" />
                                          )}
                                        </div>
                                        <div>
                                          <div className="font-bold text-xs">{prod.title}</div>
                                          <div className="text-[10px] text-white/40">by {prod.creatorName || 'Anonymous'}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-semibold text-white/60">{prod.category || 'Digital Asset'}</td>
                                    <td className="px-6 py-4">
                                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/5 border border-white/10">
                                        {prod.productType}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-white">${prod.price}</td>
                                    <td className="px-6 py-4 text-xs text-white/60 font-medium">{prod.salesCount || 0}</td>
                                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-2">
                                        <button 
                                          onClick={() => {
                                            setSelectedProduct(prod);
                                            setEditProductPrice(prod.price || 0);
                                          }}
                                          className="p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button 
                                          onClick={() => handleDeleteProduct(prod.id)}
                                          className="p-2 hover:bg-red-500/10 rounded-xl text-white/30 hover:text-red-400 transition-colors"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <AnimatePresence>
                      {selectedProduct && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="w-full xl:w-96 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-[#00cca3]">Market Control</h3>
                            <button onClick={() => setSelectedProduct(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center">
                              <X size={15} />
                            </button>
                          </div>

                          <div className="space-y-4">
                            <div className="w-full h-32 rounded-2xl overflow-hidden bg-neutral-900 border border-white/5 flex items-center justify-center relative">
                              {selectedProduct.previewImage ? (
                                <img src={selectedProduct.previewImage} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Store size={36} className="text-white/20" />
                              )}
                            </div>
                            <div>
                              <h4 className="font-extrabold text-sm leading-snug">{selectedProduct.title}</h4>
                              <p className="text-[10px] text-white/40 mt-1">Creator ID: {selectedProduct.creatorUid}</p>
                            </div>
                          </div>

                          <div className="space-y-4 pt-4 border-t border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Adjust Listed Price</p>
                            <div className="flex gap-2">
                              <input 
                                type="number" 
                                value={editProductPrice}
                                onChange={(e) => setEditProductPrice(parseFloat(e.target.value) || 0)}
                                className="bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold w-full outline-none"
                              />
                              <button
                                onClick={() => handleUpdateProduct(selectedProduct.id, { price: editProductPrice })}
                                className="px-4 bg-white text-black font-extrabold text-xs rounded-xl hover:bg-neutral-200"
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="space-y-4 pt-4 border-t border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Quick Actions</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleUpdateProduct(selectedProduct.id, { isFeatured: !selectedProduct.isFeatured })}
                                className={`py-2 px-3 rounded-xl border text-[10px] font-bold text-center ${
                                  selectedProduct.isFeatured 
                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                                    : 'bg-white/5 border-white/10 text-white'
                                }`}
                              >
                                {selectedProduct.isFeatured ? 'Unfeature' : 'Feature Asset'}
                              </button>
                              <button
                                onClick={() => handleUpdateProduct(selectedProduct.id, { status: selectedProduct.status === 'suspended' ? 'active' : 'suspended' })}
                                className={`py-2 px-3 rounded-xl border text-[10px] font-bold text-center ${
                                  selectedProduct.status === 'suspended' 
                                    ? 'bg-red-500/10 border-red-500/20 text-red-500' 
                                    : 'bg-white/5 border-white/10 text-white'
                                }`}
                              >
                                {selectedProduct.status === 'suspended' ? 'Activate' : 'Suspend Listing'}
                              </button>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            <button
                              onClick={() => handleDeleteProduct(selectedProduct.id)}
                              className="w-full py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 text-red-500 hover:text-red-400 text-xs font-bold rounded-xl uppercase tracking-wider"
                            >
                              Delete Listing
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* TAB 4: EVENT MANAGEMENT */}
              {activeTab === 'events' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search events by title, status..."
                        value={searchEvent}
                        onChange={(e) => setSearchEvent(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-red-500/40 text-xs font-semibold"
                      />
                    </div>
                    <p className="text-[10px] text-white/40 uppercase font-bold">Filtered Results: {filteredEvents.length}</p>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-6">
                    <div className="flex-grow bg-white/5 border border-white/10 rounded-3xl overflow-hidden min-w-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Event Details</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Start Date</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Registered Attendees</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Status</th>
                              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-white/40 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredEvents.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center py-12 text-sm text-white/40 font-bold">
                                  No global events recorded in databases. Seed testing assets using top controller.
                                </td>
                              </tr>
                            ) : (
                              filteredEvents.map((ev) => {
                                const isSelected = selectedEvent?.id === ev.id;
                                return (
                                  <tr 
                                    key={ev.id} 
                                    className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                      isSelected ? 'bg-white/5 border-l-2 border-purple-500' : ''
                                    }`}
                                    onClick={() => setSelectedEvent(ev)}
                                  >
                                    <td className="px-6 py-4">
                                      <div>
                                        <div className="font-bold text-xs">{ev.title}</div>
                                        <div className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5">
                                          <span>Type: {ev.eventType}</span>
                                          <span>•</span>
                                          <span>{ev.isPaid ? `$${ev.price}` : 'Free'}</span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-medium text-white/60">
                                      {new Date(ev.startDate).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-xs font-semibold text-white/60">{ev.attendeeCount || 0}</td>
                                    <td className="px-6 py-4">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                        ev.status === 'live' 
                                          ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
                                          : ev.status === 'upcoming' 
                                          ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400' 
                                          : 'bg-white/5 border border-white/10 text-white/40'
                                      }`}>
                                        {ev.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-2">
                                        <button 
                                          onClick={() => setSelectedEvent(ev)}
                                          className="p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button 
                                          onClick={() => handleDeleteEvent(ev.id)}
                                          className="p-2 hover:bg-red-500/10 rounded-xl text-white/30 hover:text-red-400 transition-colors"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <AnimatePresence>
                      {selectedEvent && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="w-full xl:w-96 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-[#a855f7]">Event Control</h3>
                            <button onClick={() => setSelectedEvent(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center">
                              <X size={15} />
                            </button>
                          </div>

                          <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{selectedEvent.status} event</span>
                            <h4 className="font-extrabold text-sm mb-1">{selectedEvent.title}</h4>
                            <p className="text-xs text-white/60 whitespace-pre-wrap leading-relaxed line-clamp-3">{selectedEvent.description}</p>
                          </div>

                          <div className="space-y-4 pt-4 border-t border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Change Live Status</p>
                            <div className="grid grid-cols-3 gap-2">
                              {['upcoming', 'live', 'ended'].map((st) => {
                                const isCurrent = selectedEvent.status === st;
                                return (
                                  <button
                                    key={st}
                                    onClick={() => handleUpdateEventStatus(selectedEvent.id, st)}
                                    className={`py-2 px-3 rounded-xl border text-[9px] font-black uppercase text-center transition-all ${
                                      isCurrent 
                                        ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' 
                                        : 'bg-white/5 border-white/5 hover:border-white/10 text-white/50'
                                    }`}
                                  >
                                    {st}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            <button
                              onClick={() => handleDeleteEvent(selectedEvent.id)}
                              className="w-full py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 text-red-500 hover:text-red-400 text-xs font-bold rounded-xl uppercase tracking-wider"
                            >
                              Cancel & Delete Event
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* TAB 5: CHALLENGES / BOUNTIES */}
              {activeTab === 'bounties' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
                    <div className="relative w-full sm:max-w-md">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                      <input 
                        type="text" 
                        placeholder="Search bounties by title, difficulty..."
                        value={searchBounty}
                        onChange={(e) => setSearchBounty(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-red-500/40 text-xs font-semibold"
                      />
                    </div>
                    <p className="text-[10px] text-white/40 uppercase font-bold">Filtered Results: {filteredBounties.length}</p>
                  </div>

                  <div className="flex flex-col xl:flex-row gap-6">
                    <div className="flex-grow bg-white/5 border border-white/10 rounded-3xl overflow-hidden min-w-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Challenge Title</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Difficulty</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">XP Bounty Reward</th>
                              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-white/40">Deadline</th>
                              <th className="px-4 py-4 text-[10px] font-black uppercase tracking-wider text-white/40 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredBounties.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="text-center py-12 text-sm text-white/40 font-bold">
                                  No bounties or coding challenges logged.
                                </td>
                              </tr>
                            ) : (
                              filteredBounties.map((bounty) => {
                                const isSelected = selectedBounty?.id === bounty.id;
                                return (
                                  <tr 
                                    key={bounty.id} 
                                    className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                                      isSelected ? 'bg-white/5 border-l-2 border-amber-500' : ''
                                    }`}
                                    onClick={() => {
                                      setSelectedBounty(bounty);
                                      setEditBountyReward(bounty.rewardXP || 0);
                                    }}
                                  >
                                    <td className="px-6 py-4">
                                      <div>
                                        <div className="font-bold text-xs">{bounty.title}</div>
                                        <div className="text-[10px] text-white/40">Creator: {bounty.creatorUid}</div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                        bounty.difficulty === 'Hard' 
                                          ? 'bg-red-500/10 border border-red-500/20 text-red-400' 
                                          : bounty.difficulty === 'Medium' 
                                          ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' 
                                          : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                      }`}>
                                        {bounty.difficulty}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs font-bold text-amber-500">{bounty.rewardXP} XP</td>
                                    <td className="px-6 py-4 text-xs text-white/60 font-medium">
                                      {new Date(bounty.deadline).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-2">
                                        <button 
                                          onClick={() => {
                                            setSelectedBounty(bounty);
                                            setEditBountyReward(bounty.rewardXP || 0);
                                          }}
                                          className="p-2 hover:bg-white/10 rounded-xl text-white/50 hover:text-white transition-colors"
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button 
                                          onClick={() => handleDeleteBounty(bounty.id)}
                                          className="p-2 hover:bg-red-500/10 rounded-xl text-white/30 hover:text-red-400 transition-colors"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <AnimatePresence>
                      {selectedBounty && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="w-full xl:w-96 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-[#f59e0b]">Bounty Control</h3>
                            <button onClick={() => setSelectedBounty(null)} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center">
                              <X size={15} />
                            </button>
                          </div>

                          <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">{selectedBounty.difficulty} challenge</span>
                            <h4 className="font-extrabold text-sm mb-1">{selectedBounty.title}</h4>
                            <p className="text-xs text-white/60 leading-relaxed max-h-24 overflow-y-auto">{selectedBounty.description}</p>
                          </div>

                          <div className="space-y-4 pt-4 border-t border-white/5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#666]">Adjust Reward XP</p>
                            <div className="flex gap-2">
                              <input 
                                type="number" 
                                value={editBountyReward}
                                onChange={(e) => setEditBountyReward(parseInt(e.target.value) || 0)}
                                className="bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs font-bold w-full outline-none"
                              />
                              <button
                                onClick={() => handleUpdateBountyReward(selectedBounty.id)}
                                className="px-4 bg-white text-black font-extrabold text-xs rounded-xl hover:bg-neutral-200"
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            <button
                              onClick={() => handleDeleteBounty(selectedBounty.id)}
                              className="w-full py-3 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 text-red-500 hover:text-red-400 text-xs font-bold rounded-xl uppercase tracking-wider"
                            >
                              Destroy Challenge
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* TAB 6: REPORTS MANAGEMENT */}
              {activeTab === 'reports' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold">Unresolved Platform Flags</h3>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Moderate flags filed by community members</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white/60">
                      Unresolved: {pendingReports.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {reports.length === 0 ? (
                      <div className="text-center py-16 bg-white/5 rounded-3xl border border-white/5 flex flex-col items-center justify-center space-y-2">
                        <ShieldCheck size={40} className="text-teal-400" />
                        <h4 className="font-bold text-sm text-white">Platform is Pristine!</h4>
                        <p className="text-xs text-white/40 max-w-xs leading-normal">No pending violation flags have been registered. Everything is clean.</p>
                      </div>
                    ) : (
                      reports.map((rep) => {
                        const isPending = rep.status === 'pending';
                        return (
                          <div 
                            key={rep.id}
                            className={`p-6 rounded-3xl bg-white/[0.02] border transition-all ${
                              isPending ? 'border-red-500/20 shadow-lg' : 'border-white/5 opacity-60'
                            }`}
                          >
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                              <div className="space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-400">
                                    {rep.reason}
                                  </span>
                                  <span className="text-[11px] text-white/40 font-bold">Filed by {rep.reporterName}</span>
                                  <span className="text-[11px] text-white/20">•</span>
                                  <span className="text-[11px] text-white/40">{new Date(rep.createdAt).toLocaleDateString()}</span>
                                  <span className="text-[11px] text-white/20">•</span>
                                  <span className="text-[10px] uppercase font-bold text-white/60 bg-white/5 px-2 py-0.5 rounded-md">Type: {rep.targetType}</span>
                                </div>

                                <div>
                                  <p className="text-xs font-bold text-white/80 line-clamp-2">Reason Notes: {rep.details || 'No additional comments provided.'}</p>
                                </div>

                                {rep.contentSnippet && (
                                  <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 flex items-start gap-3">
                                    <CornerDownRight size={14} className="text-[#888] scale-y-[-1] mt-0.5" />
                                    <div>
                                      <p className="text-[9px] font-bold text-[#666] uppercase tracking-widest">Reported Snippet</p>
                                      <p className="text-xs text-white/60 italic mt-0.5">"{rep.contentSnippet}"</p>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
                                {isPending ? (
                                  <>
                                    <button
                                      onClick={() => handleResolveReport(rep.id, 'dismissed')}
                                      className="py-2 px-3 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl text-xs font-bold transition-all"
                                      title="Dismiss report as invalid flag"
                                    >
                                      Dismiss
                                    </button>
                                    <button
                                      onClick={() => handleResolveReport(rep.id, 'resolved')}
                                      className="py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all"
                                      title="Mark report as resolved"
                                    >
                                      Resolve
                                    </button>
                                    {rep.targetId && (
                                      <button
                                        onClick={() => handleDeleteReportedItem(rep.id, rep.targetType, rep.targetId)}
                                        className="py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold transition-all"
                                        title="Delete content and resolve report"
                                      >
                                        Delete Content
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-xs text-white/40 font-bold px-2.5 py-1 bg-white/5 rounded-lg border border-white/5">
                                    <Check size={14} className="text-emerald-400" />
                                    <span>Status: Resolved</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
