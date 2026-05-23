import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, OperationType, handleFirestoreError } from '../firebase';
import { 
  BarChart3, 
  Camera,
  Check,
  CreditCard, 
  Download, 
  Eye, 
  Github,
  Globe,
  Layout, 
  MapPin,
  Package, 
  Plus, 
  Settings, 
  TrendingUp, 
  Users,
  Zap
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import ProductCard from '../components/ProductCard';
import Sidebar from '../components/Sidebar';

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [myProducts, setMyProducts] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalImpressions: 0,
    totalRevenue: 0
  });
  const [migrating, setMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<string | null>(null);

  const runMigration = async () => {
    if (!auth.currentUser || auth.currentUser.email !== 'danieludofa452@gmail.com') return;
    setMigrating(true);
    setMigrationResults(null);
    try {
      let postsCount = 0;
      let eventsCount = 0;

      // Update Posts
      const postsSnap = await getDocs(collection(db, 'posts'));
      for (const d of postsSnap.docs) {
        const data = d.data();
        if (!data.visibility) {
          const visibility = data.communityId ? 'community' : 'public';
          await updateDoc(doc(db, 'posts', d.id), { visibility });
          postsCount++;
        }
      }

      // Update Events
      const eventsSnap = await getDocs(collection(db, 'events'));
      for (const d of eventsSnap.docs) {
        const data = d.data();
        if (!data.visibility) {
          const visibility = data.communityId ? 'community' : 'public';
          await updateDoc(doc(db, 'events', d.id), { visibility });
          eventsCount++;
        }
      }

      setMigrationResults(`Successfully updated ${postsCount} posts and ${eventsCount} events.`);
    } catch (err) {
      console.error("Migration error:", err);
      setMigrationResults(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMigrating(false);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    const productsQuery = query(
      collection(db, 'products'), 
      where('creatorUid', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMyProducts(docs);
      
      const totalImp = docs.reduce((acc, curr: any) => acc + (curr.impressions || 0), 0);
      const totalSalesCount = docs.reduce((acc, curr: any) => acc + (curr.salesCount || 0), 0);
      const totalRev = docs.reduce((acc, curr: any) => acc + ((curr.salesCount || 0) * (curr.price || 0)), 0);
      
      setStats(prev => ({ 
        ...prev, 
        totalImpressions: totalImp,
        totalSales: totalSalesCount,
        totalRevenue: totalRev
      }));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'products');
    });

    const purchasesQuery = query(
      collection(db, 'purchases'),
      where('buyerUid', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePurchases = onSnapshot(purchasesQuery, async (snapshot) => {
      const purchaseList = [];
      for (const d of snapshot.docs) {
        const purchaseData = d.data();
        const productSnap = await getDoc(doc(db, 'products', purchaseData.productId));
        purchaseList.push({
          id: d.id,
          ...purchaseData,
          product: productSnap.exists() ? productSnap.data() : null
        });
      }
      setPurchases(purchaseList);
    });

    const unsubscribeProfile = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setProfile(doc.data());
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${auth.currentUser?.uid}`);
    });

    return () => {
      unsubscribeProducts();
      unsubscribePurchases();
      unsubscribeProfile();
    };
  }, []);

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full max-w-[1600px] mx-auto px-2 overflow-hidden w-full">
        <div className="flex-1 h-full overflow-y-auto custom-scrollbar pt-4 px-4 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2 uppercase italic tracking-tighter">Creator_Dashboard</h1>
              <p className="text-white/30 text-xs font-mono">ANALYTICS // CONTENT_MANAGEMENT // SYSTEM_STATS</p>
            </div>
            <div className="flex items-center gap-4">
               <Link 
                  to="/settings" 
                  className="px-6 py-3 glass rounded-xl font-bold text-xs uppercase tracking-widest border border-white/10 hover:bg-white/5 transition-all flex items-center gap-2"
                >
                  <Settings size={16} /> Account Setup
                </Link>
            </div>
          </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Total Sales', value: stats.totalSales, icon: <CreditCard className="text-green-400" />, trend: '+12%' },
          { label: 'Impressions', value: stats.totalImpressions, icon: <Eye className="text-blue-400" />, trend: '+24%' },
          { label: 'Revenue', value: `$${stats.totalRevenue}`, icon: <TrendingUp className="text-purple-400" />, trend: '+8%' },
          { label: 'Experience (XP)', value: profile?.xp || 0, icon: <Zap className="text-yellow-400" />, trend: 'Level 1' }
        ].map((stat, i) => (
          <div key={i} className="glass rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              {stat.icon}
            </div>
            <div className="text-white/50 text-sm font-medium mb-2 uppercase tracking-widest">{stat.label}</div>
            <div className="text-3xl font-bold mb-4">{stat.value}</div>
            <div className="text-xs font-mono text-green-400 flex items-center gap-1">
              {stat.trend} <span className="text-white/20">vs last month</span>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-8 border-b border-white/5 mb-12">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 size={18} /> },
          { id: 'products', label: 'My Products', icon: <Package size={18} /> },
          { id: 'purchases', label: 'Downloads', icon: <Download size={18} /> },
          ...(auth.currentUser?.email === 'danieludofa452@gmail.com' ? [{ id: 'maintenance', label: 'Maintenance', icon: <Zap size={18} /> }] : [])
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-4 text-sm font-medium transition-all relative ${
              activeTab === tab.id ? 'text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {tab.icon} {tab.label}
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTab" 
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary neon-glow" 
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-12">
            <div className="glass rounded-[40px] p-12 text-center">
              <div className="w-20 h-20 glass rounded-2xl flex items-center justify-center mx-auto mb-8">
                <BarChart3 className="text-primary" size={40} />
              </div>
              <h3 className="text-2xl font-bold mb-4">Analytics coming soon</h3>
              <p className="text-white/50 max-w-md mx-auto">
                We're building a comprehensive analytics suite to help you understand your audience better.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {myProducts.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
            {myProducts.length === 0 && (
              <div className="col-span-full py-20 text-center glass rounded-3xl">
                <p className="text-white/50 mb-6">You haven't published any products yet.</p>
                <Link to="/upload" className="text-primary hover:underline font-bold">
                  Publish your first product
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'purchases' && (
          <div className="glass rounded-[40px] overflow-hidden border border-white/5 shadow-2xl">
            <table className="w-full text-left">
              <thead className="bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                <tr>
                  <th className="px-8 py-6">Product</th>
                  <th className="px-8 py-6">Purchase Date</th>
                  <th className="px-8 py-6">Amount</th>
                  <th className="px-8 py-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {purchases.map(purchase => (
                  <tr key={purchase.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/5 overflow-hidden border border-white/10 group-hover:border-primary/50 transition-all flex items-center justify-center">
                          {purchase.product?.previewImage && purchase.product.previewImage.trim() !== '' ? (
                            <img src={purchase.product.previewImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package size={20} className="text-white/20" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-white group-hover:text-primary transition-colors">{purchase.product?.title || 'Unknown Product'}</p>
                          <p className="text-xs text-white/30 uppercase font-black">{purchase.product?.productType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-white/50">{new Date(purchase.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-8 py-6 text-sm font-black text-white/80">
                      ${purchase.amount}
                    </td>
                    <td className="px-8 py-6">
                      <Link 
                        to={`/products/${purchase.productId}`}
                        className="px-6 py-2 bg-white/5 hover:bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                      >
                        Download Files
                      </Link>
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr className="text-sm text-white/50 italic">
                    <td colSpan={4} className="px-8 py-20 text-center">
                       <div className="flex flex-col items-center gap-4">
                          <Download size={48} className="text-white/10" />
                          <p>You haven't purchased any assets yet.</p>
                          <Link to="/explore" className="text-primary hover:underline font-black uppercase tracking-widest">Start Exploring</Link>
                       </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'maintenance' && auth.currentUser?.email === 'danieludofa452@gmail.com' && (
          <div className="space-y-8">
            <div className="glass rounded-[40px] p-12">
              <h3 className="text-2xl font-bold mb-4">Data Migration & Maintenance</h3>
              <p className="text-white/50 mb-8 max-w-2xl">
                Use these tools to fix data inconsistencies caused by schema updates. 
                This will update all legacy posts and events to have the required "visibility" field.
              </p>

              <div className="flex flex-col gap-4">
                <button
                  onClick={runMigration}
                  disabled={migrating}
                  className="w-fit px-8 py-4 bg-primary text-white rounded-2xl font-bold neon-glow flex items-center gap-2 disabled:opacity-50"
                >
                  {migrating ? 'Migrating...' : 'Fix Legacy Posts & Events'} <Zap size={20} />
                </button>

                {migrationResults && (
                  <div className={`p-4 rounded-xl ${migrationResults.includes('failed') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                    {migrationResults}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
