import { Link } from 'react-router-dom';
import { Edit3, Eye, Heart, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../firebase';

export default function ComponentCard({ component }: { component: any }) {
  const isOwner = auth.currentUser?.uid === component.creatorUid;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="group glass rounded-2xl overflow-hidden hover:border-primary/50 transition-all relative"
    >
      {isOwner && (
        <Link 
          to={`/edit/${component.id}`}
          className="absolute top-4 left-4 z-10 p-2 bg-black/50 hover:bg-primary text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
          title="Edit Component"
        >
          <Edit3 size={16} />
        </Link>
      )}
      <Link to={`/components/${component.id}`}>
        <div className="aspect-video bg-white/5 relative overflow-hidden">
          <img 
            src={(component.previewImage && component.previewImage.trim() !== '') ? component.previewImage : (component.previewImages?.[0] && component.previewImages[0].trim() !== '' ? component.previewImages[0] : `https://picsum.photos/seed/${component.id}/800/450`)} 
            alt={component.title} 
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <span className="px-3 py-1 glass rounded-full text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
              {component.category}
            </span>
          </div>
        </div>
      </Link>
      
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1"><Eye size={14} /> {component.impressions || 0}</span>
            <span className="flex items-center gap-1"><Heart size={14} /> {component.likes || 0}</span>
            <span className="flex items-center gap-1"><Star size={14} className="text-yellow-400 fill-yellow-400" /> {component.avgRating || 0}</span>
          </div>
          <span className="text-lg font-bold text-white">
            {component.price === 0 ? 'FREE' : `$${component.price}`}
          </span>
        </div>

        <Link to={`/components/${component.id}`}>
          <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors line-clamp-1">
            {component.title}
          </h3>
        </Link>
        <p className="text-sm text-white/50 mb-6 line-clamp-2 min-h-[40px]">
          {component.description}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <Link to={`/creators/${component.creatorUid}`} className="flex items-center gap-2 group/creator">
            <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden">
              <img 
                src={(component.creatorPhoto && component.creatorPhoto.trim() !== '') ? component.creatorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${component.creatorUid}`} 
                alt="Creator" 
                referrerPolicy="no-referrer"
              />
            </div>
            <span className="text-xs text-white/60 group-hover/creator:text-white transition-colors">
              {component.creatorName || 'Anonymous'}
            </span>
          </Link>
          
          <div className="flex gap-1">
            {component.techStack?.slice(0, 2).map((tech: string) => (
              <span key={tech} className="text-[10px] bg-white/5 px-2 py-1 rounded text-white/40">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
