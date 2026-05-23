import { motion } from 'motion/react';
import { Eye, Smartphone, Monitor, Star, Zap } from 'lucide-react';
import { useState } from 'react';

export default function ProductLivePreview({ product }: { product: any }) {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-black/40 dark:text-white/40">Marketplace Preview</span>
        </div>
        
        <div className="flex bg-black/5 dark:bg-white/5 rounded-2xl p-1 border border-black/10 dark:border-white/10 backdrop-blur-xl">
          <button 
            onClick={() => setViewMode('desktop')}
            className={`p-2.5 rounded-xl transition-all duration-300 ${viewMode === 'desktop' ? 'bg-primary text-white shadow-lg' : 'text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white'}`}
          >
            <Monitor size={18} />
          </button>
          <button 
            onClick={() => setViewMode('mobile')}
            className={`p-2.5 rounded-xl transition-all duration-300 ${viewMode === 'mobile' ? 'bg-primary text-white shadow-lg' : 'text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white'}`}
          >
            <Smartphone size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-black/5 dark:bg-[#030303] rounded-[48px] border border-black/5 dark:border-white/5 overflow-hidden relative group p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.03)_0%,transparent_100%)]" />
        
        <motion.div 
          animate={{ 
            width: viewMode === 'desktop' ? '100%' : '340px',
            scale: viewMode === 'desktop' ? 0.95 : 1
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 120 }}
          className="max-w-[420px] w-full"
        >
          <div className="relative overflow-hidden rounded-[40px] shadow-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0A0A0A]">
            <div className="bg-white dark:bg-[#0A0A0A] overflow-hidden group/card transition-all duration-500">
              <div className="aspect-[4/5] bg-black/5 dark:bg-white/5 relative overflow-hidden">
                {product.previewImage && product.previewImage.trim() !== '' ? (
                  <motion.img 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    src={product.previewImage} 
                    alt="" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-black/[0.02] dark:bg-white/[0.02]">
                    <Eye size={64} className="text-black/5 dark:text-white/5 mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-black/10 dark:text-white/10">No Artwork Yet</p>
                  </div>
                )}
                <div className="absolute top-6 right-6">
                   <div className="bg-white/80 dark:bg-black/80 px-4 py-2 rounded-2xl border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-widest backdrop-blur-3xl shadow-2xl text-black dark:text-white">
                     {product.productType || 'Asset'}
                   </div>
                </div>
              </div>
              <div className="p-8 text-black dark:text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1.5">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs font-bold text-black dark:text-white">5.0</span>
                    <span className="text-[10px] text-black/20 dark:text-white/20">(0 reviews)</span>
                  </div>
                  <span className="text-3xl font-black text-black dark:text-white tracking-tighter">${product.price || 0}</span>
                </div>
                <h3 className="text-2xl font-bold mb-3 truncate text-black dark:text-white tracking-tight">{product.title || 'Product Title'}</h3>
                <p className="text-sm text-black/40 dark:text-white/40 line-clamp-2 min-h-[40px] mb-8 font-medium leading-relaxed">{product.description || 'Give your product a compelling description...'}</p>
                
                <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-6">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center">
                         <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-black dark:text-white/80">Kith Creator</span>
                        <span className="text-[9px] font-black text-primary uppercase tracking-tighter">Verified</span>
                      </div>
                   </div>
                   <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center border border-black/5 dark:border-white/5 shadow-inner">
                      <Zap size={20} className="text-black/10 dark:text-white/20" />
                   </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="p-6 bg-black/5 dark:bg-white/5 rounded-[32px] border border-black/5 dark:border-white/5 flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-black/20 dark:text-white/20">Metadata Quality</span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-black dark:text-white">{Math.min(100, Math.round(((product.title?.length || 0) + (product.description?.length || 0) / 10) * 2))}%</span>
            <div className="flex-1 h-1 bg-black/10 dark:bg-white/5 rounded-full overflow-hidden">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${Math.min(100, Math.round(((product.title?.length || 0) + (product.description?.length || 0) / 10) * 2))}%` }}
                 className="h-full bg-primary"
               />
            </div>
          </div>
        </div>
        <div className="p-6 bg-teal-500/10 rounded-[32px] border border-teal-500/20 flex flex-col justify-center items-end">
          <span className="text-[10px] font-black uppercase tracking-widest text-teal-600/40 dark:text-white/20 mb-1">Estimated Payout</span>
          <span className="text-2xl font-black text-teal-700 dark:text-primary">${(product.price * 0.9).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
