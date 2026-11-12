import { useParams, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
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
      if (post && post.id === id && post.visibility !== 'followers') {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (!postDoc.exists()) {
          setPost(null);
          return;
        }
        const data = postDoc.data();
        if (data.visibility === 'followers' && auth.currentUser?.uid !== data.authorUid) {
          const viewer = auth.currentUser?.uid;
          const follows = viewer
            ? await getDoc(doc(db, 'users', viewer, 'following', data.authorUid)).catch(() => null)
            : null;
          if (!follows?.exists()) {
            setPost(null);
            return;
          }
        }
        setPost({ id: postDoc.id, ...data });
      } catch (error) {
        console.error("Error fetching post:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [id, post]);

  // Community posts belong to their community feed, not the global feed. Old links
  // and shared URLs land in the community-scoped detail instead of leaking out.
  if (post?.communityId) {
    const params = new URLSearchParams({ view: 'community', id: post.communityId, postId: post.id });
    if (post.channelId) params.set('channelId', post.channelId);
    return <Navigate to={`/feed?${params.toString()}`} replace />;
  }

  return (
    <div className="max-w-[1200px] mx-auto px-2 sm:px-4 pb-8 text-black dark:text-white relative">
      <div className="flex flex-col lg:flex-row gap-4 items-start justify-center">
        <SocialLeftSidebar />

        <main className="w-full order-2 flex-1 max-w-[640px] min-h-screen lg:border-x border-black/10 dark:border-white/10">
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
