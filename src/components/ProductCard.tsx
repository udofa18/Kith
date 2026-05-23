import { Link } from 'react-router-dom';
import { Edit3, Eye, Heart, Star, BookOpen, Music, Video, Zap, Layers, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../firebase';

export default function ProductCard({ product }: { product: any }) {
  const isOwner = auth.currentUser?.uid === product.creatorUid;

  const getIcon = (type: string) => {
    switch (type) {
      case 'ebook': return <BookOpen size={14} className="text-blue-400" />;
      case 'music': return <Music size={14} className="text-pink-400" />;
      case 'video': return <Video size={14} className="text-red-400" />;
      case 'course': return <Zap size={14} className="text-yellow-400" />;
      case 'asset': return <Layers size={14} className="text-teal-400" />;
      case 'app': return <Globe size={14} className="text-primary" />;
      default: return <Layers size={14} className="text-white/40" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="group bg-white dark:bg-[#0A0A0A] rounded-[32px] overflow-hidden border border-black/5 dark:border-white/5 hover:border-teal-500/30 dark:hover:border-teal-500/30 transition-all duration-500 relative flex flex-col h-full shadow-sm hover:shadow-2xl hover:shadow-teal-500/5 group"
    >
      {isOwner && (
        <Link 
          to={`/upload?edit=${product.id}`}
          className="absolute top-4 left-4 z-20 p-2.5 bg-black/80 hover:bg-teal-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all backdrop-blur-xl border border-white/10 shadow-xl"
        >
          <Edit3 size={16} />
        </Link>
      )}

      <Link to={`/products/${product.id}`} className="block relative aspect-[4/3] overflow-hidden bg-black/5 dark:bg-white/5">
        <img 
          src={(product.previewImage && product.previewImage.trim() !== '') ? product.previewImage : (product.previewImages?.length > 0 && product.previewImages[0].trim() !== '') ? product.previewImages[0] : `https://picsum.photos/seed/${product.id}/800/600`} 
          alt={product.title} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
          referrerPolicy="no-referrer"
        />
        
        {/* Type Badge */}
        <div className="absolute top-4 right-4 z-10">
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-xl flex items-center gap-2 group-hover:bg-teal-500 transition-colors">
            {getIcon(product.productType)}
            <span className="text-[9px] font-black uppercase tracking-widest text-white">
              {product.productType || 'Asset'}
            </span>
          </div>
        </div>

        {/* Hover Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      </Link>
      
      <div className="p-6 flex flex-col flex-grow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-[10px] font-black text-black/40 dark:text-white/40 uppercase tracking-widest">
            <Star size={12} className="text-teal-500 fill-teal-500" />
            <span className="text-black dark:text-white">{product.avgRating || 5.0}</span>
            <span className="opacity-50">({product.reviewCount || 0})</span>
          </div>
          <span className="text-sm font-bold text-teal-500 tracking-tight">
            {product.salesCount || 0}+ Collected
          </span>
        </div>

        <Link to={`/products/${product.id}`} className="group/title">
          <h3 className="text-xl font-bold mb-2 leading-tight text-black dark:text-white group-hover/title:text-teal-500 transition-colors line-clamp-1">
            {product.title}
          </h3>
        </Link>
        
        <p className="text-xs text-black/50 dark:text-white/50 mb-6 line-clamp-2 font-medium leading-relaxed flex-grow">
          {product.description}
        </p>

        <div className="pt-6 border-t border-black/5 dark:border-white/5 flex items-center justify-between mt-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden border border-black/5 dark:border-white/10 ring-2 ring-black/5 dark:ring-white/5">
              <img 
                src={(product.creatorPhoto && product.creatorPhoto.trim() !== '') ? product.creatorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${product.creatorUid}`} 
                alt="Creator" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-black/80 dark:text-white/80 uppercase tracking-tight truncate max-w-[100px]">
                {product.creatorName || 'Anonymous'}
              </span>
              <span className="text-[8px] font-black text-teal-500 uppercase tracking-widest">Verified</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <p className="text-xl font-black text-black dark:text-white tracking-tighter">
              {product.price === 0 ? 'FREE' : `$${product.price}`}
            </p>
            <Link 
              to={`/products/${product.id}`}
              className="w-10 h-10 bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center rounded-xl transition-all hover:scale-110 shadow-lg shadow-teal-500/20"
            >
              <Zap size={18} fill="currentColor" />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
