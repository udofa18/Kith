import { Link } from 'react-router-dom';
import { Clock, MessageSquare, Bookmark, ThumbsUp, Eye, MoreHorizontal, Globe, Lock, Trash2, PenTool } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ARTICLE_CATEGORIES } from '../types/articles';
import { auth, db } from '../firebase';
import { doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { useState, useEffect } from 'react';

interface ArticleCardProps {
  article: any;
  isOwner?: boolean;
}

export default function ArticleCard({ article, isOwner }: ArticleCardProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.currentUser) {
      // Check if bookmarked (this would ideally come from the parent or a global state, 
      // but for simplicity we'll check it here or assume the parent handles it)
    }
  }, [article.id]);

  const togglePublish = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOwner) return;

    try {
      setLoading(true);
      const newStatus = article.status === 'published' ? 'draft' : 'published';
      await updateDoc(doc(db, 'articles', article.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      toast.success(newStatus === 'published' ? 'Article published!' : 'Article moved to drafts');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!auth.currentUser) {
      toast.error('Please login to bookmark');
      return;
    }

    try {
      const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarkedArticles', article.id);
      if (isBookmarked) {
        await deleteDoc(bookmarkRef);
        setIsBookmarked(false);
        toast.success('Removed from bookmarks');
      } else {
        await setDoc(bookmarkRef, {
          articleId: article.id,
          bookmarkedAt: new Date().toISOString(),
          title: article.title,
          coverImage: article.coverImage || ''
        });
        setIsBookmarked(true);
        toast.success('Saved to bookmarks');
      }
    } catch (error) {
      console.error(error);
      toast.error('Bookmark failed');
    }
  };

  const dateStr = (() => {
    if (!article.createdAt) return 'Recently';
    try {
      const d = article.createdAt.toDate ? article.createdAt.toDate() : new Date(article.createdAt);
      if (!(d instanceof Date) || isNaN(d.getTime())) return 'Recently';
      return formatDistanceToNow(d, { addSuffix: true });
    } catch (e) {
      return 'Recently';
    }
  })();

  return (
    <Link 
      to={`/article/${article.id}`}
      className={`block group bg-black/[0.03] dark:bg-[#121212] rounded-[32px] border border-black/5 dark:border-white/5 p-2 sm:p-4 hover:bg-black/[0.05] dark:hover:bg-white/[0.03] hover:border-black/10 dark:hover:border-white/10 transition-all duration-300 relative overflow-hidden ${article.status === 'draft' ? 'opacity-75' : ''}`}
    >
      {article.isFeatured && (
        <div className="absolute top-6 -right-12 bg-primary text-black font-black py-1 px-12 rotate-45 text-[8px] uppercase tracking-widest z-10 shadow-lg">
          Featured
        </div>
      )}

      {article.status === 'draft' && (
        <div className="absolute top-3 right-3 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest z-20 backdrop-blur-md">
          Draft
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        
        {/* Cover Image */}
        <div className="w-full sm:w-[280px] h-[180px] sm:h-[190px] rounded-[24px] overflow-hidden shrink-0 relative bg-black/10">
          {article.coverImage ? (
            <img 
              src={article.coverImage} 
              alt={article.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02]">
              <PenTool className="text-white/20" size={32} />
            </div>
          )}
          
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {article.primaryCategoryId && (
              <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-primary border border-primary/20">
                {ARTICLE_CATEGORIES.find(c => c.id === article.primaryCategoryId)?.name || article.primaryCategoryId}
              </div>
            )}
            {article.difficulty && (
              <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border backdrop-blur-md bg-black/60 ${
                article.difficulty === 'Beginner' ? 'text-green-400 border-green-400/20' :
                article.difficulty === 'Intermediate' ? 'text-yellow-400 border-yellow-400/20' :
                article.difficulty === 'Advanced' ? 'text-orange-400 border-orange-400/20' :
                'text-red-400 border-red-400/20'
              }`}>
                {article.difficulty}
              </div>
            )}
          </div>

          {article.readingTime && (
            <div className="absolute bottom-3 right-3 bg-white/80 dark:bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 border border-black/10 dark:border-white/10 text-black dark:text-white">
              <Clock size={12} />
              <span>{article.readingTime} min</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center py-2 pr-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary to-purple-500 overflow-hidden flex items-center justify-center text-[10px] font-black text-black border border-black/10 dark:border-white/10">
              {article.authorPhoto ? (
                <img src={article.authorPhoto} className="w-full h-full object-cover" />
              ) : (
                article.authorName?.substring(0, 1).toUpperCase() || 'A'
              )}
            </div>
            <span className="text-xs font-black uppercase tracking-tight text-black/80 dark:text-white/80">{article.authorName || 'Anonymous'}</span>
            <span className="text-black/20 dark:text-white/20 text-xs">•</span>
            <span className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{dateStr}</span>
          </div>
          
          <h2 className="text-xl font-black mb-2 group-hover:text-primary transition-colors tracking-tight line-clamp-2 leading-tight text-black dark:text-white uppercase transition-colors">
            {article.title}
          </h2>
          
          <p className="text-black/50 dark:text-white/50 text-xs font-bold tracking-widest line-clamp-2 mb-4 leading-relaxed max-w-2xl">
            {article.subtitle || String(article.content || '').replace(/<[^>]*>?/gm, '').substring(0, 150) + '...'}
          </p>

          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-2 overflow-hidden mr-4">
              {article.subcategory && (
                <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[9px] font-black text-primary whitespace-nowrap uppercase tracking-widest">
                   {article.subcategory}
                </span>
              )}
              {article.tags?.slice(0, 2).map((tag: string) => (
                <span key={tag} className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-[9px] font-black text-black/60 dark:text-white/60 whitespace-nowrap uppercase tracking-widest">
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-4 text-black/40 dark:text-white/40">
              <div className="flex items-center gap-1.5">
                <ThumbsUp size={14} />
                <span className="text-xs font-bold">{article.likesCount || 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare size={14} />
                <span className="text-xs font-bold">{article.commentsCount || 0}</span>
              </div>
              
              {isOwner ? (
                <button 
                  onClick={togglePublish}
                  disabled={loading}
                  className={`p-2 rounded-xl transition-all ${article.status === 'published' ? 'hover:bg-red-500/10 hover:text-red-500' : 'hover:bg-green-500/10 hover:text-green-500'}`}
                  title={article.status === 'published' ? 'Unpublish' : 'Publish'}
                >
                  {article.status === 'published' ? <Lock size={16} /> : <Globe size={16} />}
                </button>
              ) : (
                <button 
                  onClick={handleBookmark}
                  className={`p-2 rounded-xl transition-all hover:bg-primary/10 hover:text-primary ${isBookmarked ? 'text-primary' : ''}`}
                >
                  <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
