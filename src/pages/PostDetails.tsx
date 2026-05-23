import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import PostCard from '../components/PostCard';
import { ArrowLeft } from 'lucide-react';
import SocialLeftSidebar from '../components/SocialLeftSidebar';
import SocialRightSidebar from '../components/SocialRightSidebar';

export default function PostDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Use state.post if passed to load instantly without hitting the Firestore database first
  const [post, setPost] = useState<any>(() => location.state?.post || null);
  const [loading, setLoading] = useState(!post);

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) return;
      if (post && post.id === id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (postDoc.exists()) {
          setPost({ id: postDoc.id, ...postDoc.data() });
        }
      } catch (error) {
        console.error("Error fetching post:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [id, post]);

  const handleBack = () => {
    // If there is history within the app to go back to, use navigate(-1). Otherwise, fallback to /feed
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/feed');
    }
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  
  if (!post) return (
    <div className="max-w-[1500px] mx-auto px-4 py-12">
      <main className="max-w-2xl mx-auto">
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-black/50 dark:text-white/50 hover:text-primary transition-colors mb-6 group"
        >
          <ArrowLeft size={18} />
          <span className="font-bold uppercase tracking-widest text-[10px]">Go Back</span>
        </button>
        <div className="text-center py-20 border border-black/10 dark:border-white/10">
          <p className="text-black/30 dark:text-white/30 font-bold uppercase tracking-widest text-xs">Post not found</p>
        </div>
      </main>
    </div>
  );

  return (
    <div className="max-w-[1500px] mx-auto px-4 pb-8 text-black dark:text-white relative">
      <div className="flex flex-col lg:flex-row gap-4 items-start justify-center">
        {/* Left Sidebar */}
        <SocialLeftSidebar />

        {/* Main Content */}
        <main className="w-full pt-4 order-2 flex-1 max-w-[640px]">
          <button 
            onClick={handleBack}
            className="flex items-center gap-2 text-black/50 dark:text-white/50 hover:text-primary transition-colors mb-6 group"
          >
            <ArrowLeft size={18} />
            <span className="font-bold uppercase tracking-widest text-[10px]">Go Back</span>
          </button>
          <PostCard post={post} isDetailView={true} />
        </main>

        {/* Right Sidebar */}
        <SocialRightSidebar />
      </div>
    </div>
  );
}

