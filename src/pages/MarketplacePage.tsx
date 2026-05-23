import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Search, Filter, SlidersHorizontal, Grid, List as ListIcon, Plus, Sparkles, ShoppingBag, TrendingUp, Info, ChevronDown, Flame, CheckCircle2 } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import ComponentSkeleton from '../components/ComponentSkeleton';
import Sidebar from '../components/Sidebar';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

const CATEGORIES = [
  { id: 'all', name: 'All Products', icon: <ShoppingBag size={18} /> },
  { id: 'ebook', name: 'E-Books', icon: <Sparkles size={18} /> },
  { id: 'course', name: 'Premium Courses', icon: <TrendingUp size={18} /> },
  { id: 'app', name: 'Apps & Tools', icon: <Grid size={18} /> },
  { id: 'asset', name: 'Design Assets', icon: <SlidersHorizontal size={18} /> },
  { id: 'music', name: 'Audio & Music', icon: <ListIcon size={18} /> },
  { id: 'video', name: 'Video Content', icon: <Info size={18} /> },
];

export default function MarketplacePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('new');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.productType === selectedCategory;
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    if (sortBy === 'trending') return (b.salesCount || 0) - (a.salesCount || 0);
    if (sortBy === 'top-rated') return (b.avgRating || 0) - (a.avgRating || 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const trendingProducts = [...products].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0)).slice(0, 3);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-white dark:bg-[#0a0a0a] text-black dark:text-white">
      {/* Top Banner Area (Hero Section) */}
      <div className="relative bg-gradient-to-r from-teal-950 via-indigo-900 to-[#0B0F19] w-full pt-16 pb-16 overflow-hidden border-b border-white/5 mb-8">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1964&auto=format&fit=crop')] object-cover opacity-10 mix-blend-overlay"></div>
        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">
                Creator <span className="text-teal-400">Market</span>
              </h1>
              <p className="text-white/80 text-lg max-w-xl leading-relaxed">
                Connect with world-class creators and acquire professional digital assets for your next project.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Link 
                to="/upload"
                className="flex items-center gap-2 bg-teal-500 text-white px-6 py-3 rounded-full font-bold hover:bg-teal-600 transition-all shadow-[0_0_20px_rgba(20,184,166,0.2)]"
              >
                <Plus size={20} />
                <span>Start Selling</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 pb-20">
        {/* Search and Filters Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={20} />
            <input 
              type="text"
              placeholder="Search assets, tools, courses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-teal-500 transition-all text-sm"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className="flex items-center justify-between gap-4 bg-black/5 dark:bg-white/5 text-xs font-bold border border-black/10 dark:border-white/10 rounded-2xl px-5 py-3 outline-none hover:border-teal-500 transition-all cursor-pointer min-w-[180px] text-black/60 dark:text-white/60"
              >
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-teal-500" />
                  <span>{sortBy === 'new' ? 'Latest' : sortBy === 'trending' ? 'Popular' : 'Rated'}</span>
                </div>
                <ChevronDown size={14} className={`text-black/20 dark:text-white/20 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {isSortDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsSortDropdownOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 5, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full w-full min-w-[200px] bg-white dark:bg-[#1a1a1a] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 py-1"
                    >
                      {[
                        { id: 'new', label: 'Latest Inventory' },
                        { id: 'trending', label: 'Most Popular' },
                        { id: 'top-rated', label: 'Highly Rated' }
                      ].map((s) => (
                        <button 
                          key={s.id}
                          onClick={() => { setSortBy(s.id); setIsSortDropdownOpen(false); }}
                          className={`w-full text-left px-5 py-3 text-xs font-bold transition-colors hover:bg-teal-500/10 ${sortBy === s.id ? 'text-teal-500 bg-teal-500/5' : 'text-black/60 dark:text-white/60'}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Category Navigation - Minimal & Elegant */}
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-6 mb-10 border-b border-black/5 dark:border-white/5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-xs font-bold transition-all whitespace-nowrap border ${
                selectedCategory === cat.id 
                  ? 'bg-teal-500 text-white border-teal-500 shadow-lg shadow-teal-500/20' 
                  : 'bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 border-transparent hover:border-black/10 dark:hover:border-white/10 hover:text-black dark:hover:text-white'
              }`}
            >
              <span className={selectedCategory === cat.id ? 'text-white' : 'text-teal-500'}>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mt-4">
          {/* Main Feed */}
          <div className="lg:col-span-9">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-1.5 h-6 bg-teal-500 rounded-full" />
              <h2 className="text-xl font-bold tracking-tight">
                {selectedCategory === 'all' ? 'Featured Assets' : CATEGORIES.find(c => c.id === selectedCategory)?.name}
                <span className="ml-3 text-sm font-medium text-black/20 dark:text-white/20 tracking-normal">/ {filteredProducts.length} items</span>
              </h2>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <ComponentSkeleton key={i} />
                ))}
              </div>
            ) : filteredProducts.length > 0 ? (
              <motion.div 
                layout
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8"
              >
                <AnimatePresence mode="popLayout">
                  {filteredProducts.map(product => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="text-center py-32 bg-black/5 dark:bg-[#0A0A0A] rounded-[48px] border border-black/5 dark:border-white/5 border-dashed">
                <div className="w-24 h-24 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8">
                  <Search size={40} className="text-black/20 dark:text-white/20" />
                </div>
                <h3 className="text-3xl font-bold mb-4">No results found</h3>
                <p className="text-black/40 dark:text-white/40 mb-10 max-w-sm mx-auto font-medium">We couldn't find any assets matching your filters. Try a different search term or category.</p>
                <button 
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('all');
                  }}
                  className="bg-black dark:bg-white text-white dark:text-black px-10 py-5 rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-3 space-y-10">
            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-[40px] p-8">
              <div className="flex items-center gap-3 mb-8">
                <Flame className="text-orange-500" size={24} />
                <h3 className="text-lg font-bold tracking-tight">Trending Assets</h3>
              </div>
              
              <div className="space-y-6">
                {trendingProducts.length > 0 ? trendingProducts.map((p, i) => (
                  <Link to={`/products/${p.id}`} key={p.id} className="flex items-start gap-4 group">
                    <span className="text-2xl font-black text-black/10 dark:text-white/10 group-hover:text-teal-500 transition-colors">0{i + 1}</span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm tracking-tight leading-snug line-clamp-2 group-hover:text-teal-500 transition-colors uppercase">{p.title}</h4>
                      <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{p.salesCount || 0} Sales · ${p.price}</p>
                    </div>
                  </Link>
                )) : (
                  <p className="text-xs text-white/30">No trending data yet.</p>
                )}
              </div>
            </div>

            <div className="bg-teal-500 rounded-[40px] p-10 text-white relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:rotate-12 transition-transform duration-700">
                <Plus size={80} />
              </div>
              <h3 className="text-3xl font-bold uppercase leading-[0.8] mb-6">Become a <br/> Seller</h3>
              <p className="text-sm font-medium mb-8 text-white/80 leading-relaxed uppercase tracking-tight">Monetize your creativity. Upload your digital assets and reach thousands of builders.</p>
              <Link 
                to="/upload" 
                className="inline-flex items-center gap-2 bg-white text-teal-600 px-6 py-3 rounded-full font-bold uppercase tracking-widest text-[10px] hover:scale-105 transition-transform"
              >
                 Start Selling <Sparkles size={14} />
              </Link>
            </div>
            
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <Info className="text-blue-500" size={24} />
                <h3 className="text-lg font-bold tracking-tight">Market Rules</h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Instant delivery on completion',
                  'Verified creator network',
                  'Secure escrow payments',
                  '24/7 priority support'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40">
                    <CheckCircle2 size={14} className="text-teal-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
