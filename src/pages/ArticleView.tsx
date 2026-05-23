import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, increment, collection, query, orderBy, getDocs, addDoc, where, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ArrowLeft, Clock, Heart, Eye, Share2, MessageCircle, Edit, Tag, BookOpen, Layers, BarChart, Bookmark, Globe, Lock } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';
import { toast } from 'react-hot-toast';
import { deleteDoc, setDoc } from 'firebase/firestore';
import { Helmet } from 'react-helmet-async';
import { ARTICLE_CATEGORIES } from '../types/articles';

export default function ArticleView() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasLiked, setHasLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<any[]>([]);

  useEffect(() => {
    if (!articleId) return;

    const fetchArticle = async () => {
      try {
        const docRef = doc(db, 'articles', articleId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status !== 'published' && data.authorUid !== auth.currentUser?.uid) {
            navigate('/articles'); // Cannot view others' drafts
            return;
          }
          setArticle({ id: docSnap.id, ...data });

          // Fetch related articles
          fetchRelatedArticles(docSnap.id, data.primaryCategoryId);

          // Track view
          if (auth.currentUser && data.authorUid !== auth.currentUser.uid) {
            await updateDoc(docRef, { viewsCount: increment(1) });
          }
          
          fetchComments();
          checkBookmarkStatus();

        } else {
          navigate('/articles');
        }
      } catch (error) {
        console.error("Error loading article:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [articleId, navigate]);

  const checkBookmarkStatus = async () => {
    if (!auth.currentUser || !articleId) return;
    try {
      const docSnap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'bookmarkedArticles', articleId));
      setIsBookmarked(docSnap.exists());
    } catch (e) {
      console.error(e);
    }
  };

  const handleBookmark = async () => {
    if (!auth.currentUser || !articleId) {
      toast.error('Please login to bookmark');
      return;
    }

    try {
      const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarkedArticles', articleId);
      if (isBookmarked) {
        await deleteDoc(bookmarkRef);
        setIsBookmarked(false);
        toast.success('Removed from bookmarks');
      } else {
        await setDoc(bookmarkRef, {
          articleId,
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

  const togglePublish = async () => {
    if (!isAuthor || !articleId) return;

    try {
      const newStatus = article.status === 'published' ? 'draft' : 'published';
      await updateDoc(doc(db, 'articles', articleId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      setArticle(prev => ({ ...prev, status: newStatus }));
      toast.success(newStatus === 'published' ? 'Article published!' : 'Article moved to drafts');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update status');
    }
  };

  const fetchRelatedArticles = async (currentId: string, categoryId?: string) => {
    try {
      let q = query(
        collection(db, 'articles'),
        where('status', '==', 'published'),
        limit(4)
      );
      
      if (categoryId) {
        q = query(q, where('primaryCategoryId', '==', categoryId));
      }

      const snap = await getDocs(q);
      const fetched = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(a => a.id !== currentId)
        .slice(0, 3);
      setRelatedArticles(fetched);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchComments = async () => {
    if (!articleId) return;
    try {
      const q = query(collection(db, `articles/${articleId}/comments`), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const commentsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(commentsData);
    } catch (e) {
      console.error("Error fetching comments:", e);
    }
  };

  const handlePostComment = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to post comments');
      return;
    }
    if (!newComment.trim() || !articleId || postingComment) return;
    setPostingComment(true);
    
    try {
      const commentData = {
        authorUid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous Developer',
        content: newComment.trim(),
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, `articles/${articleId}/comments`), commentData);
      
      setComments((prev) => [{ id: docRef.id, ...commentData }, ...prev]);
      setNewComment('');
      
      // Update comment count on article
      await updateDoc(doc(db, 'articles', articleId), {
        commentsCount: increment(1)
      });
      setArticle((prev: any) => ({ ...prev, commentsCount: (prev.commentsCount || 0) + 1 }));

      toast.success("Comment posted!");
    } catch (e) {
      console.error("Error posting comment:", e);
      toast.error("Failed to post comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleLike = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to like articles');
      return;
    }
    if (!articleId || hasLiked) return;
    setHasLiked(true);
    setArticle((prev: any) => ({ ...prev, likesCount: (prev.likesCount || 0) + 1 }));
    try {
      const docRef = doc(db, 'articles', articleId);
      await updateDoc(docRef, { likesCount: increment(1) });
    } catch (e) {
      console.error(e);
      setHasLiked(false);
      setArticle((prev: any) => ({ ...prev, likesCount: (prev.likesCount || 0) - 1 }));
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard!');
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!article) return null;

  const isAuthor = auth.currentUser?.uid === article.authorUid;

  // SEO Helpers
  const seo = article.seo || {};
  const pageTitle = seo.metaTitle || `${article.title} | CreatorSpace`;
  const pageDescription = seo.metaDescription || article.subtitle || String(article.content || '').replace(/<[^>]*>?/gm, '').substring(0, 160).trim() + '...';
  const pageUrl = seo.canonicalUrl || window.location.href;
  const pageKeywords = seo.keywords?.join(', ') || article.tags?.join(', ') || '';
  const pageImage = seo.ogImage || article.coverImage || `https://creatorspace.app/article-og-${articleId}.png`;

  // JSON-LD for Search Engines
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": article.title,
    "alternativeHeadline": article.subtitle || "",
    "image": pageImage,
    "award": "",
    "editor": article.authorName,
    "genre": ARTICLE_CATEGORIES.find(c => c.id === article.primaryCategoryId)?.name || "Technology",
    "keywords": pageKeywords,
    "wordcount": String(article.content || '').split(/\s+/).length,
    "publisher": {
      "@type": "Organization",
      "name": "CreatorSpace",
      "logo": {
        "@type": "ImageObject",
        "url": "https://creatorspace.app/logo.png"
      }
    },
    "url": pageUrl,
    "datePublished": article.publishedAt ? (article.publishedAt.toDate ? article.publishedAt.toDate().toISOString() : new Date(article.publishedAt).toISOString()) : new Date().toISOString(),
    "dateCreated": article.createdAt ? (article.createdAt.toDate ? article.createdAt.toDate().toISOString() : new Date(article.createdAt).toISOString()) : new Date().toISOString(),
    "dateModified": article.updatedAt ? (article.updatedAt.toDate ? article.updatedAt.toDate().toISOString() : new Date(article.updatedAt).toISOString()) : new Date().toISOString(),
    "description": pageDescription,
    "articleBody": String(article.content || '').replace(/<[^>]*>?/gm, ''),
    "author": {
      "@type": "Person",
      "name": article.authorName,
      "url": `https://creatorspace.app/creator/${article.authorUid}`
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content={pageKeywords} />
        <link rel="canonical" href={pageUrl} />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content={seo.ogType || 'article'} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:image" content={pageImage} />

        {/* Twitter */}
        <meta name="twitter:card" content={seo.twitterCard || 'summary_large_image'} />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={pageImage} />

        {/* JSON-LD Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>

      {/* Navbar */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/5 py-4">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <button 
            onClick={() => navigate('/articles')}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="font-medium hidden sm:inline">Back to Articles</span>
          </button>
          
          <div className="flex flex-1 justify-end items-center gap-4">
            {isAuthor && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={togglePublish}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-medium text-sm ${
                    article.status === 'published' 
                      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                      : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                  }`}
                >
                  {article.status === 'published' ? <Lock size={16} /> : <Globe size={16} />}
                  {article.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <Link 
                  to={`/write/${article.id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors font-medium text-sm"
                >
                  <Edit size={16} />
                  Edit
                </Link>
              </div>
            )}
            <button 
              onClick={handleBookmark}
              className={`p-2 rounded-full transition-colors ${isBookmarked ? 'bg-primary/20 text-primary' : 'hover:bg-white/10 text-white/60'}`}
            >
              <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
            <button 
              onClick={handleShare}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60"
            >
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="space-y-6 mb-12">
          {article.coverImage && (
            <div className="aspect-[21/9] w-full rounded-3xl overflow-hidden mb-8 shadow-2xl shadow-black/50 border border-white/5">
              <img 
                src={(article.coverImage && article.coverImage.trim() !== '') ? article.coverImage : `https://picsum.photos/seed/${article.id}/800/400`} 
                alt="Cover" 
                className="w-full h-full object-cover" 
              />
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {article.primaryCategoryId && (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full text-[10px] font-black tracking-widest uppercase">
                  <Layers size={14} />
                  {ARTICLE_CATEGORIES.find(c => c.id === article.primaryCategoryId)?.name}
                </span>
              )}
              {article.subcategory && (
                <span className="flex items-center gap-1.5 px-4 py-1.5 bg-white/5 text-white/60 border border-white/10 rounded-full text-[10px] font-black tracking-widest uppercase">
                  <BookOpen size={14} />
                  {article.subcategory}
                </span>
              )}
              {article.difficulty && (
                <span className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                  article.difficulty === 'Beginner' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                  article.difficulty === 'Intermediate' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                  article.difficulty === 'Advanced' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                  'bg-red-500/10 text-red-500 border-red-500/20'
                }`}>
                  <BarChart size={14} />
                  {article.difficulty}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {article.tags?.map((tag: string) => (
                <span key={tag} className="text-primary/60 text-sm font-black tracking-widest uppercase">
                  #{tag}
                </span>
              ))}
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black leading-tight tracking-tighter">
              {article.title}
            </h1>
            
            {article.subtitle && (
              <p className="text-lg md:text-xl text-white/60 font-medium">
                {article.subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-white/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden border border-white/20">
                <img 
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${article.authorUid}`} 
                  alt={article.authorName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-bold text-lg">{article.authorName}</p>
                <div className="flex items-center gap-3 text-sm text-white/40">
                  <span>
                    {article.publishedAt 
                      ? (article.publishedAt.toDate ? article.publishedAt.toDate().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : new Date(article.publishedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))
                      : (article.createdAt?.toDate ? article.createdAt.toDate().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : new Date(article.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }))}
                  </span>
                  <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} />
                    {article.readingTime || 1} min read
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Rich Text Content */}
        <div 
          className="prose prose-invert prose-lg max-w-none prose-headings:font-display prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-img:border prose-img:border-white/10 prose-p:leading-relaxed prose-pre:bg-[#0d1117] prose-pre:border prose-pre:border-white/10"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        {/* Footer Actions */}
        <div className="mt-16 pt-8 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={handleLike}
              className={`flex items-center gap-2 group transition-colors ${hasLiked ? 'text-rose-500' : 'text-white/60 hover:text-rose-500'}`}
            >
              <div className={`p-3 rounded-full bg-white/5 group-hover:bg-rose-500/10 transition-colors ${hasLiked ? 'bg-rose-500/20' : ''}`}>
                <Heart size={24} className={hasLiked ? 'fill-rose-500' : ''} />
              </div>
              <span className="font-bold text-lg">{article.likesCount || 0}</span>
            </button>
            <div className="flex items-center gap-2 text-white/60">
              <div className="p-3 rounded-full bg-white/5">
                <Eye size={24} />
              </div>
              <span className="font-bold text-lg">{article.viewsCount || 0}</span>
            </div>
          </div>
          
          <button 
            onClick={() => {
              const discussSection = document.getElementById('comments-section');
              if (discussSection) {
                discussSection.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
          >
            <span className="font-medium hidden sm:inline">Discuss</span>
            <div className="p-3 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
              <MessageCircle size={24} />
            </div>
          </button>
        </div>

        {/* Comments Section */}
        <div id="comments-section" className="mt-12">
          <h3 className="text-2xl font-bold mb-6">Discussion</h3>
          <div className="glass rounded-2xl p-6 mb-8 border border-white/10">
            <h4 className="text-xl font-semibold mb-2">Join the conversation</h4>
            <p className="text-white/60 mb-6">Share your thoughts on this article.</p>
            <div className="relative">
              <textarea 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="w-full bg-black/20 border border-white/10 rounded-xl p-4 min-h-[100px] outline-none focus:border-primary transition-colors resize-none placeholder:text-white/30"
                placeholder="What are your thoughts?"
                disabled={postingComment || !auth.currentUser}
              ></textarea>
              <div className="flex justify-end mt-3">
                <button 
                  onClick={handlePostComment}
                  disabled={postingComment || !newComment.trim() || !auth.currentUser}
                  className="bg-primary text-black px-6 py-2.5 rounded-full font-bold hover:brightness-110 transition-all shadow-[0_0_20px_rgba(0,242,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {postingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {comments.length > 0 ? (
              comments.map((comment) => (
                <div key={comment.id} className="p-4 rounded-xl border border-white/10 glass">
                  <div className="flex items-center gap-3 mb-3">
                    <img 
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorUid}`} 
                      alt={comment.authorName}
                      className="w-8 h-8 rounded-full bg-white/10 border border-white/20"
                    />
                    <div>
                      <p className="font-bold text-sm">{comment.authorName}</p>
                      <p className="text-xs text-white/40">{new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <p className="text-white/80 whitespace-pre-wrap font-medium">{comment.content}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-white/40 glass rounded-xl border border-white/5">
                Be the first to share your thoughts!
              </div>
            )}
          </div>
        </div>

        {/* Recommended Side Section */}
        {relatedArticles.length > 0 && (
          <div className="mt-24 pt-12 border-t border-white/10">
            <h3 className="text-2xl font-black uppercase tracking-tight mb-8">Recommended for you</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedArticles.map(rel => (
                <Link to={`/article/${rel.id}`} key={rel.id} className="group">
                  <div className="aspect-video rounded-2xl overflow-hidden mb-4 border border-white/5">
                    <img src={rel.coverImage || `https://picsum.photos/seed/${rel.id}/400/225`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <h4 className="font-black text-sm group-hover:text-primary transition-colors leading-tight line-clamp-2 uppercase tracking-tight">{rel.title}</h4>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-white/10 overflow-hidden">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${rel.authorUid}`} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{rel.authorName}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
