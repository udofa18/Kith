import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, increment, collection, query, orderBy, onSnapshot, getDocs, where, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { 
  ArrowLeft, 
  Download, 
  Edit3,
  ExternalLink, 
  Heart, 
  Share2, 
  Star, 
  User,
  Zap,
  CheckCircle2,
  BookOpen,
  Music,
  Video,
  Layers,
  Clock,
  Sparkles,
  ShoppingBag,
  Info,
  ShieldCheck,
  FileText,
  Terminal,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Trophy,
  History,
  Eye,
  Bookmark,
  Package,
  Cpu,
  Globe,
  Trash2,
  Send
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';
import VerifiedBadge from '../components/VerifiedBadge';

export default function ComponentDetails() {
  const { id } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [creator, setCreator] = useState<any>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [reviews, setReviews] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchProduct = async () => {
      try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as any;
          setProduct(data);
          const defaultImage = `https://picsum.photos/seed/${docSnap.id}/1200/675`;
          const initialImage = (data.previewImage && data.previewImage.trim() !== '') 
            ? data.previewImage 
            : (data.previewImages && data.previewImages[0] && data.previewImages[0].trim() !== '') 
              ? data.previewImages[0] 
              : defaultImage;
          setActiveImage(initialImage);
          await updateDoc(docRef, { impressions: increment(1) });

          // Fetch Creator real data
          if (data.creatorUid) {
            const userSnap = await getDoc(doc(db, 'users', data.creatorUid));
            if (userSnap.exists()) setCreator(userSnap.data());
          }

          // Fetch Related Products
          const relatedQ = query(
            collection(db, 'products'),
            where('productType', '==', data.productType),
            where('__name__', '!=', id),
            limit(4)
          );
          const relatedSnap = await getDocs(relatedQ);
          setRelatedProducts(relatedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `products/${id}`);
      } finally {
        setLoading(false);
      }
    };

    const checkPurchase = async () => {
      if (!auth.currentUser || !id) return;
      try {
        const q = query(
          collection(db, 'purchases'),
          where('buyerUid', '==', auth.currentUser.uid),
          where('productId', '==', id)
        );
        const snap = await getDocs(q);
        setHasPurchased(!snap.empty);
      } catch (e) {
        console.error("Error checking purchase", e);
      }
    };

    // Reviews Subscription
    const reviewsQuery = query(collection(db, 'products', id, 'reviews'), orderBy('createdAt', 'desc'));
    const unsubscribeReviews = onSnapshot(reviewsQuery, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `products/${id}/reviews`);
    });

    // Comments Subscription
    const commentsQuery = query(collection(db, 'products', id, 'comments'), orderBy('createdAt', 'desc'));
    const unsubscribeComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `products/${id}/comments`);
    });

    fetchProduct();
    checkPurchase();
    return () => {
      unsubscribeReviews();
      unsubscribeComments();
    };
  }, [id]);

  const handleBuy = async () => {
    if (!auth.currentUser) {
      toast.error('Please login to purchase');
      return;
    }
    setBuying(true);
    try {
      const simulatedSessionId = `cs_test_${Math.random().toString(36).substring(2, 15)}`;
      window.location.href = `/success?session_id=${simulatedSessionId}&productId=${id}`;
    } catch (error) {
      console.error('Purchase error:', error);
    } finally {
      setBuying(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newComment.trim() || !id) return;

    setSubmittingComment(true);
    try {
      await addDoc(collection(db, 'products', id, 'comments'), {
        authorUid: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        authorPhoto: auth.currentUser.photoURL || '',
        authorUsername: auth.currentUser.displayName?.toLowerCase().replace(/\s+/g, '') || 'user',
        content: newComment,
        createdAt: serverTimestamp(),
        likesCount: 0,
        repliesCount: 0
      });
      setNewComment('');
      toast.success('Your comment has been posted');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `products/${id}/comments`);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'products', id, 'comments', commentId), {
        deleted: true, // Soft delete or just remove
        content: '[This comment has been deleted]'
      });
      toast.success('Comment removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}/comments/${commentId}`);
    }
  };

  const getProductIcon = (type: string) => {
    switch (type) {
      case 'ebook': return <BookOpen className="text-blue-500" />;
      case 'music': return <Music className="text-pink-500" />;
      case 'video': return <Video className="text-red-500" />;
      case 'course': return <Zap className="text-yellow-500" />;
      default: return <Cpu className="text-teal-500" />;
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      <div className="text-teal-500 font-bold tracking-tight text-xs uppercase">Loading, please wait...</div>
    </div>
  );
  
  if (!product) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
      <div className="text-black/20 dark:text-white/20 font-bold uppercase tracking-widest text-lg">Product Not Found</div>
    </div>
  );

  const isOwner = auth.currentUser?.uid === product.creatorUid;
  const canDownload = isOwner || hasPurchased;

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-black dark:text-white transition-colors">
      <div className="max-w-[1400px] mx-auto px-6 py-12">
        {/* Navigation */}
        <div className="flex items-center gap-4 mb-10">
          <Link to="/explore" className="p-3 bg-black/5 dark:bg-white/5 rounded-2xl hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-black/5 dark:border-white/5">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 text-sm font-bold text-black/40 dark:text-white/40">
            <Link to="/explore" className="hover:text-teal-500 transition-colors">Marketplace</Link>
            <span>/</span>
            <span className="text-teal-500 capitalize">{product.productType}</span>
            <span>/</span>
            <span className="truncate max-w-[200px]">{product.title}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Left Column: Visuals & Description */}
          <div className="lg:col-span-8 space-y-12">
            
            {/* Visual Hero */}
            <section className="space-y-6">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative aspect-video rounded-[32px] overflow-hidden bg-black shadow-xl border border-black/5 dark:border-white/5 group"
              >
                <img 
                  src={activeImage} 
                  alt={product.title} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                
                {product.demoUrl && (
                  <div className="absolute top-6 right-6">
                    <a 
                      href={product.demoUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-white dark:bg-black/80 backdrop-blur-md text-black dark:text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition-all shadow-lg border border-black/5 dark:border-white/10"
                    >
                      <Globe size={14} /> Live View
                    </a>
                  </div>
                )}

                <div className="absolute bottom-6 left-6 flex items-center gap-2">
                   <div className="bg-teal-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-lg">
                     Verified Product
                   </div>
                   <div className="bg-black/70 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-white/10">
                     {product.metadata?.format || 'Standard'}
                   </div>
                </div>
              </motion.div>

              {/* Thumbnails */}
              <div className="flex flex-wrap gap-3">
                {[product.previewImage, ...(product.previewImages || [])].filter(Boolean).map((img: string, i: number) => (
                  <button 
                    key={i}
                    onClick={() => setActiveImage(img)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                      activeImage === img 
                        ? 'border-teal-500 scale-105 shadow-md' 
                        : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </section>

            {/* Product Meta */}
            <section className="space-y-8">
               <div className="space-y-4">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-black dark:text-white">
                    {product.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-5">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-black/[0.03] dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5">
                      <Star size={16} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-sm font-bold">{product.avgRating || 5.0}</span>
                      <span className="text-[10px] opacity-40 font-bold ml-1">({reviews.length} reviews)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-black/40 dark:text-white/40">
                      <Eye size={14} /> {product.impressions || 0} views
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-black/40 dark:text-white/40">
                      <ShoppingBag size={14} /> {product.salesCount || 0} purchases
                    </div>
                  </div>
               </div>

               <div className="space-y-6">
                  <h2 className="text-xl font-bold border-b border-black/5 dark:border-white/5 pb-4">About this product</h2>
                  <div className="prose dark:prose-invert max-w-none text-black/80 dark:text-white/80 leading-relaxed font-normal">
                    <ReactMarkdown>{product.description}</ReactMarkdown>
                  </div>
               </div>

               {/* Features Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-6 bg-black/[0.02] dark:bg-white/[0.02] rounded-2xl border border-black/5 dark:border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-500">
                      <Package size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-black/40 dark:text-white/40 uppercase">What's Inside</h4>
                      <p className="text-sm font-bold">{product.metadata?.sourceFiles || 'Original Files Included'}</p>
                    </div>
                  </div>
                  <div className="p-6 bg-black/[0.02] dark:bg-white/[0.02] rounded-2xl border border-black/5 dark:border-white/5 flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-black/40 dark:text-white/40 uppercase">License Type</h4>
                      <p className="text-sm font-bold capitalize">{product.license || 'Standard Personal'}</p>
                    </div>
                  </div>
               </div>
            </section>

            {/* Comments Section */}
            <section className="pt-8 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">Discussion <span className="text-black/30 dark:text-white/30 ml-2">{comments.length}</span></h3>
              </div>

              {auth.currentUser ? (
                <form onSubmit={handlePostComment} className="flex gap-4 items-start">
                  <div className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/5 overflow-hidden flex-shrink-0">
                    <img 
                      src={(auth.currentUser.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser.uid}`} 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-3">
                    <textarea 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment or ask a question..."
                      className="w-full bg-black/[0.03] dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl p-4 focus:ring-2 focus:ring-teal-500 outline-none min-h-[100px] transition-all"
                    />
                    <div className="flex justify-end">
                      <button 
                        disabled={submittingComment || !newComment.trim()}
                        className="bg-black dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-50"
                      >
                        {submittingComment ? 'Posting...' : 'Post Comment'} <Send size={16} />
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="p-8 bg-black/5 dark:bg-white/5 rounded-2xl text-center border-2 border-dashed border-black/5 dark:border-white/5">
                  <p className="text-sm font-medium opacity-40">Please <Link to="/login" className="text-teal-500 font-bold">sign in</Link> to join the discussion.</p>
                </div>
              )}

              <div className="space-y-6">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-4 group/comment">
                    <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 overflow-hidden flex-shrink-0">
                      <img 
                        src={(comment.authorPhoto && comment.authorPhoto.trim() !== '') ? comment.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorUid}`} 
                        alt="" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{comment.authorName}</span>
                          <span className="text-[10px] opacity-30 font-medium">
                            {(() => {
                              if (!comment.createdAt) return 'just now';
                              try {
                                const d = comment.createdAt.toDate ? comment.createdAt.toDate() : new Date(comment.createdAt);
                                if (!(d instanceof Date) || isNaN(d.getTime())) return 'just now';
                                return formatDistanceToNow(d, { addSuffix: true });
                              } catch (e) {
                                return 'just now';
                              }
                            })()}
                          </span>
                        </div>
                        {(auth.currentUser?.uid === comment.authorUid || isOwner) && !comment.deleted && (
                          <button 
                            onClick={() => handleDeleteComment(comment.id)}
                            className="opacity-0 group-hover/comment:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Delete comment"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <p className={`text-sm leading-relaxed font-medium ${comment.deleted ? 'text-black/30 dark:text-white/30 italic' : 'text-black/70 dark:text-white/70'}`}>
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <div className="py-12 text-center opacity-20">
                    <p className="text-sm font-medium">No comments yet. Be the first to share your thoughts!</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Column: Sidebar */}
          <aside className="lg:col-span-4 space-y-8">
            <div className="sticky top-28 space-y-8">
              
              {/* Purchase Card */}
              <div className="bg-white dark:bg-[#0A0A0A] rounded-[32px] p-8 border border-black/5 dark:border-white/10 shadow-2xl space-y-6">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-teal-500/10 rounded-xl">
                        {getProductIcon(product.productType)}
                      </div>
                      <span className="text-xs font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{product.productType}</span>
                   </div>
                   <div className="text-3xl font-bold text-teal-500">
                     ${product.price}
                   </div>
                </div>

                <div className="space-y-4">
                   {canDownload ? (
                      <button 
                        onClick={() => window.open(product.fileUrl, '_blank')}
                        className="w-full py-4 bg-teal-500 hover:bg-teal-600 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-lg"
                      >
                        <Download size={18} /> Download Asset
                      </button>
                   ) : (
                      <button 
                        onClick={handleBuy}
                        disabled={buying}
                        className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-bold text-sm flex items-center justify-center gap-3 hover:scale-[1.02] transition-all shadow-lg disabled:opacity-50"
                      >
                        {buying ? 'Processing...' : 'Buy Now'}
                      </button>
                   )}
                   
                   <div className="grid grid-cols-2 gap-3">
                      <button className="flex items-center justify-center gap-2 py-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 hover:bg-teal-500/10 hover:border-teal-500 transition-all text-xs font-bold">
                        <Bookmark size={14} /> Save
                      </button>
                      <button className="flex items-center justify-center gap-2 py-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5 hover:bg-teal-500/10 hover:border-teal-500 transition-all text-xs font-bold">
                        <Share2 size={14} /> Share
                      </button>
                   </div>
                </div>

                <ul className="space-y-3 pt-6 border-t border-black/5 dark:border-white/5">
                   <li className="flex items-center gap-3 text-xs opacity-60 font-medium">
                      <CheckCircle2 size={14} className="text-teal-500" />
                      Secure payment via Stripe
                   </li>
                   <li className="flex items-center gap-3 text-xs opacity-60 font-medium">
                      <CheckCircle2 size={14} className="text-teal-500" />
                      Lifetime access to updates
                   </li>
                </ul>
              </div>

              {/* Creator Info */}
              <div className="bg-black/[0.02] dark:bg-white/5 p-8 rounded-[32px] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-black/10 dark:bg-white/10">
                    <img 
                      src={
                        (creator?.photoURL && creator.photoURL.trim() !== '') ? creator.photoURL :
                        (creator?.profileImage && creator.profileImage.trim() !== '') ? creator.profileImage :
                        (product.creatorPhoto && product.creatorPhoto.trim() !== '') ? product.creatorPhoto :
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${product.creatorUid}`
                      } 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase text-teal-500 tracking-widest">Creator</p>
                    <h3 className="text-lg font-bold truncate flex items-center gap-1">
                      <span>{creator?.displayName || creator?.username || product.creatorName}</span>
                      <VerifiedBadge verified={creator?.verified} />
                    </h3>
                    <p className="text-xs opacity-40 font-medium">{creator?.role || 'Master Designer'}</p>
                  </div>
                </div>
                <Link to={`/creators/${product.creatorUid}`} className="block w-full py-3 text-center border-2 border-black/5 dark:border-white/5 rounded-xl text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10 transition-all">
                  View Portfolio
                </Link>
              </div>

              {/* FAQ */}
              {product.faq && product.faq.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-black/40 dark:text-white/40">Common Questions</h4>
                  <div className="space-y-2">
                    {product.faq.map((item: any, idx: number) => (
                      <div key={idx} className="bg-black/[0.02] dark:bg-white/5 rounded-2xl overflow-hidden border border-black/5 dark:border-white/5">
                        <button 
                          onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                          className="w-full flex items-center justify-between p-4 text-xs font-bold text-left hover:text-teal-500 transition-colors"
                        >
                          {item.question}
                          {openFaq === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <AnimatePresence>
                          {openFaq === idx && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="px-4 pb-4"
                            >
                              <p className="text-xs font-medium opacity-50 leading-relaxed">{item.answer}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
