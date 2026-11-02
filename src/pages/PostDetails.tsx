import { useParams, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import PostCard from '../components/PostCard';
import PageHeader from '../components/ui/PageHeader';
import SocialLeftSidebar from '../components/SocialLeftSidebar';
import SocialRightSidebar from '../components/SocialRightSidebar';

export default function PostDetails() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  // Use state.post if passed to render instantly, then confirm from the database.
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
        setPost(postDoc.exists() ? { id: postDoc.id, ...postDoc.data() } : null);
      } catch (error) {
        console.error("Error fetching post:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [id, post]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 pb-8 text-black dark:text-white relative">
      <div className="flex flex-col lg:flex-row gap-4 items-start justify-center">
        <SocialLeftSidebar />

        <main className="w-full order-2 flex-1 max-w-[640px] min-h-screen border-x border-black/10 dark:border-white/10">
          <PageHeader title="Post" subtitle={post?.authorName ? `by ${post.authorName}` : undefined} />
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : post ? (
            <PostCard post={post} isDetailView={true} />
          ) : (
            <div className="py-20 text-center">
              <p className="font-semibold mb-1">This post isn't available</p>
              <p className="text-sm text-black/50 dark:text-white/50">It may have been deleted.</p>
            </div>
          )}
        </main>

        <SocialRightSidebar />
      </div>
    </div>
  );
}
