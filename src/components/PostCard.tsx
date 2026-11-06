import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, increment, setDoc, deleteDoc, collection, query, orderBy, onSnapshot, addDoc, getDoc, arrayUnion, serverTimestamp, where, startAfter, getDocs, limit, writeBatch } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageSquare, Share2, Copy, Check, Gift, Zap, Send, MoreVertical, Edit2, Trash2, Reply, ThumbsUp, Smile, X, UserPlus, UserMinus, Eye, EyeOff, ExternalLink, Bookmark, ChevronRight, Hash, Flag, Bell, BellOff, ShieldAlert, Repeat, HelpCircle, VolumeX, TrendingUp, MessageCircleQuestion, CheckCircle2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { formatDistanceToNow, format, isSameYear, differenceInSeconds, differenceInMinutes, differenceInHours } from 'date-fns';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import XPGiftModal from './XPGiftModal';
import UserHoverCard from './UserHoverCard';
import { createNotification } from '../lib/notifications';
import ConfirmModal from './ConfirmModal';
import ReportModal from './ReportModal';
import { toast } from 'react-hot-toast';
import { updateDailyStats } from '../lib/stats';
import VerifiedBadge from './VerifiedBadge';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useLiveStatus } from '../contexts/LiveStatusContext';
import PostMedia from './post/PostMedia';
import LinkPreview, { firstUrl } from './post/LinkPreview';
import { buildSearchTokens, extractHashtags, mergeTags, normalizeTag } from '../features/search/tokens';
import CommentThread from './post/CommentThread';
import { useInView } from '../hooks/useInView';
import { usersRepository } from '../services/db/usersRepository';
import { followUser, unfollowUser } from '../services/socialService';
import { trackEngagement } from '../features/feed/signals/tracker';
import { queryKeys } from '../lib/queryClient';

/** Swap a dead avatar URL (expired provider photos are common) for a generated one, once. */
const avatarFallback = (seed: string) => (e: React.SyntheticEvent<HTMLImageElement>) => {
  const fallback = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Feed-only menu actions ("Why am I seeing this?", "Not interested", ...), supplied by FeedList. */
export interface PostFeedActions {
  onWhy: () => void;
  onNotInterested: () => void;
  onShowMore: () => void;
  onMute: () => void;
}

export default function PostCard({ post, onPostDeleted, isDetailView = false, compact = false, feedActions }: { post: any, onPostDeleted?: () => void, isDetailView?: boolean, compact?: boolean, feedActions?: PostFeedActions }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showComments, setShowComments] = useState(isDetailView);
  // Focus the comment box when comments are opened from the action bar.
  const [focusComment, setFocusComment] = useState(false);
  const [voted, setVoted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showDeletePostConfirm, setShowDeletePostConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount || 0);
  const repostMenuRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [originalPost, setOriginalPost] = useState<any>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const postMenuRef = useRef<HTMLDivElement>(null);

  const [livePost, setLivePost] = useState(post);

  useEffect(() => {
    setLivePost(post);
  }, [post]);

  const TRUNCATE_LIMIT = 280;
  const previewUrl = firstUrl(post.content || post.description || '');
  const content = post.content || post.description || '';
  const shouldTruncate = !isDetailView && content.length > TRUNCATE_LIMIT;
  const displayContent = shouldTruncate ? content.slice(0, TRUNCATE_LIMIT) + '...' : content;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (postMenuRef.current && !postMenuRef.current.contains(event.target as Node)) {
        setShowPostMenu(false);
      }
      if (repostMenuRef.current && !repostMenuRef.current.contains(event.target as Node)) {
        setShowRepostMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Author profiles are cached and shared across cards; the viewer comes from context.
  const { data: authorProfile } = useQuery({
    queryKey: queryKeys.user(post.authorUid || ''),
    queryFn: () => usersRepository.getById(post.authorUid) as Promise<any>,
    enabled: !!post.authorUid,
    staleTime: 1000 * 60 * 10,
  });
  const currentUserProfile = useCurrentUser();
  const liveEvent = useLiveStatus().liveFor(post.authorUid);

  // Defer per-card reads and live updates until the card is actually on screen.
  const { ref: cardRef, inView, seen } = useInView();
  const engagementTarget = { id: post.id, authorUid: post.authorUid, hashtags: post.hashtags, tags: post.tags };
  const [isFollowing, setIsFollowing] = useState(false);
  const [channelsList, setChannelsList] = useState<any[]>([]);

  useEffect(() => {
    if (!post.communityId) return;
    const q = query(collection(db, 'communities', post.communityId, 'channels'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setChannelsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [post.communityId]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const impressionTracked = useRef(false);

  const collectionName = useMemo(() => {
    const typeMapping: Record<string, string> = {
      'post': 'posts',
      'article': 'articles',
      'challenge': 'challenges',
      'event': 'events',
      'product': 'products',
      'job': 'jobs',
      'liveStream': 'liveStreams',
      'poll': 'posts'
    };
    return typeMapping[post.contentType] || 'posts';
  }, [post.contentType]);

  useEffect(() => {
    if (!post.id || !inView) return;
    const docRef = doc(db, collectionName, post.id);
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setLivePost(prev => ({ ...prev, ...data }));
        if (data.repostsCount !== undefined) {
          setRepostsCount(data.repostsCount);
        }
      }
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.warn("Failed to listen to post real-time updates:", error);
      }
    });
    return () => unsub();
  }, [post.id, collectionName, inView]);

  useEffect(() => {
    if (auth.currentUser && livePost.poll?.voters?.includes(auth.currentUser.uid)) {
      setVoted(true);
    } else {
      setVoted(false);
    }
  }, [livePost.poll?.voters, auth.currentUser?.uid]);

  // Count one impression per user per post, once the card has been on screen for a second.
  useEffect(() => {
    if (!post.id || !auth.currentUser || !inView || impressionTracked.current) return;

    const trackImpression = async () => {
      impressionTracked.current = true;
      trackEngagement(auth.currentUser?.uid, 'impression', engagementTarget);
      try {
        const viewRef = doc(db, collectionName, post.id, 'views', auth.currentUser!.uid);
        const viewDoc = await getDoc(viewRef);
        if (viewDoc.exists()) return;
        await setDoc(viewRef, { viewedAt: serverTimestamp() });
        // Articles count `viewsCount`; everything else uses `impressions`.
        await updateDoc(doc(db, collectionName, post.id), {
          [post.contentType === 'article' ? 'viewsCount' : 'impressions']: increment(1),
        });
      } catch (e: any) {
        // Background bookkeeping: permission and deleted-post errors are expected and safe to ignore.
        if (e.code !== 'permission-denied' && e.code !== 'not-found') console.error('Impression error:', e);
      }
    };
    const timer = setTimeout(trackImpression, 1000);
    return () => clearTimeout(timer);
  }, [post.id, auth.currentUser?.uid, inView, collectionName]);

  useEffect(() => {
    if (!post.authorUid || !auth.currentUser || !seen) return;

    // Check if following
    const followRef = doc(db, 'users', auth.currentUser.uid, 'following', post.authorUid);
    getDoc(followRef).then(doc => setIsFollowing(doc.exists())).catch(() => setIsFollowing(false));

    // Check if liked
    const likeRef = doc(db, collectionName, post.id, 'likes', auth.currentUser.uid);
    getDoc(likeRef).then(doc => setLiked(doc.exists())).catch(() => setLiked(false));

    if (post.poll?.voters?.includes(auth.currentUser.uid)) {
      setVoted(true);
    }

    // Check if bookmarked
    const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', post.id);
    getDoc(bookmarkRef).then(doc => setBookmarked(doc.exists()));

    // Check notification preference
    const notifRef = doc(db, 'users', auth.currentUser.uid, 'notificationPrefs', post.authorUid);
    getDoc(notifRef).then(doc => setNotificationsOn(doc.exists()));

    // Check if reposted
    const repostRef = doc(db, 'users', auth.currentUser.uid, 'reposts', post.id);
    getDoc(repostRef).then(doc => setReposted(doc.exists()));

    // Fetch original post if it's a repost or quote
    if (post.type === 'repost' || post.originalPostId) {
      setLoadingOriginal(true);
      getDoc(doc(db, 'posts', post.originalPostId)).then(docSnap => {
        if (docSnap.exists()) {
          setOriginalPost({ id: docSnap.id, ...docSnap.data() });
        }
        setLoadingOriginal(false);
      });
    }

  }, [post.authorUid, post.id, auth.currentUser?.uid, seen]);

  const handleFollow = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to follow creators');
      return;
    }
    if (auth.currentUser.uid === post.authorUid) return;
    try {
      await (isFollowing ? unfollowUser : followUser)(auth.currentUser.uid, post.authorUid);
      setIsFollowing(!isFollowing);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}/following`);
    }
  };

  const handleRepost = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to repost');
      return;
    }

    if (reposting) return;
    setReposting(true);

    try {
      const repostRef = doc(db, 'users', auth.currentUser.uid, 'reposts', post.id);
      const postRef = doc(db, 'posts', post.id);

      if (reposted) {
        await deleteDoc(repostRef);
        await updateDoc(postRef, { repostsCount: increment(-1) });
        // Also find and delete the repost item from the general posts collection if it exists
        // simplified version: we just remove the link in user's repost collection
        setRepostsCount(prev => Math.max(0, prev - 1));
        setReposted(false);
        toast.success('Repost removed');
      } else {
        await setDoc(repostRef, {
          postId: post.id,
          createdAt: serverTimestamp()
        });

        // Create a new post item that represents the repost
        await addDoc(collection(db, 'posts'), {
          type: 'repost',
          originalPostId: post.id,
          authorUid: auth.currentUser.uid,
          authorName: auth.currentUser.displayName || 'Anonymous',
          authorPhoto: auth.currentUser.photoURL || '',
          content: '', // No additional content for direct repost
          createdAt: serverTimestamp(),
          communityId: post.communityId || null,
          channelId: post.channelId || null,
          likesCount: 0,
          commentsCount: 0,
          repostsCount: 0,
          impressions: 0
        });

        await updateDoc(postRef, { repostsCount: increment(1) });
        setRepostsCount(prev => prev + 1);
        setReposted(true);
        trackEngagement(auth.currentUser.uid, 'repost', engagementTarget);
        toast.success('Reposted!');

        // Notify original author
        if (post.authorUid !== auth.currentUser.uid) {
          await createNotification({
            recipientId: post.authorUid,
            senderId: auth.currentUser.uid,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            type: 'repost',
            content: `reposted your post`,
            relatedId: post.id,
            communityId: post.communityId
          });
        }
      }
    } catch (error) {
      console.error('Repost error:', error);
      toast.error('Failed to repost');
    } finally {
      setReposting(false);
      setShowRepostMenu(false);
    }
  };

  const handleQuoteRepost = () => {
    if (!auth.currentUser) {
      toast.error('Sign in to quote post');
      return;
    }
    // We'll need a way to open the PostEditor with a reference to this post
    // For now, let's signal the parent or use a global modal approach if available
    // For simplicity in this demo, let's navigate to feed with a quote param
    // or better: just alert that we are opening the editor
    toast('Opening editor for quote...');
    setShowRepostMenu(false);
    // Logic to open editor with post reference... 
    // I will implement a modal editor or pass it to PostEditor
    if (window.location.pathname !== '/feed') {
        navigate(`/feed?quote=${post.id}`);
    } else {
        setSearchParams({ quote: post.id });
    }
  };
  
  const handleLike = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to like items');
      return;
    }
    const postRef = doc(db, collectionName, post.id);
    const likeRef = doc(db, collectionName, post.id, 'likes', auth.currentUser.uid);
    
    try {
      const batch = writeBatch(db);
      if (liked) {
        batch.delete(likeRef);
        batch.update(postRef, { likesCount: increment(-1) });
        await batch.commit();
      } else {
        batch.set(likeRef, { createdAt: serverTimestamp(), userId: auth.currentUser.uid, postId: post.id });
        batch.update(postRef, { likesCount: increment(1) });
        await batch.commit();
        
        // Track XP in community stats
        if (post.communityId) {
          updateDailyStats(post.communityId, 'xpAwarded', 1).catch(console.error);
        }

        // Trigger notification
        if (post.authorUid !== auth.currentUser.uid) {
          await createNotification({
            recipientId: post.authorUid,
            senderId: auth.currentUser.uid,
            senderName: auth.currentUser.displayName || 'Someone',
            senderPhoto: auth.currentUser.photoURL || '',
            type: 'like',
            content: 'liked your post',
            relatedId: post.id
          });
        }
        trackEngagement(auth.currentUser.uid, 'like', engagementTarget);
      }
      setLiked(!liked);
    } catch (error) {
      console.error("Error liking post:", error);
    }
  };

  const handleBookmark = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to bookmark posts');
      return;
    }
    const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', post.id);
    try {
      if (bookmarked) {
        await deleteDoc(bookmarkRef);
      } else {
        await setDoc(bookmarkRef, { 
          postId: post.id,
          bookmarkedAt: serverTimestamp() 
        });
        trackEngagement(auth.currentUser.uid, 'bookmark', engagementTarget);
      }
      setBookmarked(!bookmarked);
    } catch (error) {
      console.error("Error bookmarking post:", error);
    }
  };

  const handleVote = async (optionIndex: number) => {
    if (!auth.currentUser) {
      toast.error('Sign in to vote in polls');
      return;
    }
    if (voted) return;
    const postRef = doc(db, collectionName, post.id);
    
    try {
      const newOptions = [...post.poll.options];
      newOptions[optionIndex].votes += 1;
      
      await updateDoc(postRef, {
        'poll.options': newOptions,
        'poll.voters': arrayUnion(auth.currentUser.uid)
      });
      setVoted(true);
    } catch (error) {
      console.error("Error voting:", error);
    }
  };

  const handleEditPost = async () => {
    if (!auth.currentUser || post.authorUid !== auth.currentUser.uid) return;
    try {
      const hashtags = mergeTags(post.hashtags || [], extractHashtags(editContent));
      await updateDoc(doc(db, collectionName, post.id), {
        content: editContent,
        hashtags,
        searchTokens: buildSearchTokens([editContent, post.project, post.authorName, post.authorUsername, ...hashtags.map(t => `#${normalizeTag(t)}`)]),
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
      setShowPostMenu(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleDeletePost = () => {
    setShowDeletePostConfirm(true);
    setShowPostMenu(false);
  };

  const confirmDeletePost = async () => {
    if (!auth.currentUser || post.authorUid !== auth.currentUser.uid) return;
    setDeleting(true);
    try {
      // Optimistic delete
      if (onPostDeleted) onPostDeleted();
      
      await deleteDoc(doc(db, collectionName, post.id));
      setShowDeletePostConfirm(false);
      toast.success('Post removed');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}`);
      toast.error('Failed to delete post');
    } finally {
      setDeleting(false);
    }
  };

  const handleBlockUser = async () => {
    if (!auth.currentUser || !post.authorUid) return;
    if (auth.currentUser.uid === post.authorUid) return;
    
    setIsBlocking(true);
    try {
      const blockRef = doc(db, 'users', auth.currentUser.uid, 'blockedUsers', post.authorUid);
      await setDoc(blockRef, { 
        blockedAuthorId: post.authorUid,
        blockedAt: serverTimestamp() 
      });
      toast.success(`User blocked. You won't see their posts anymore.`);
      setShowPostMenu(false);
      // Ideally we'd trigger a local filter here too, but simple toast + future reloads is a start.
      if (onPostDeleted) onPostDeleted(); 
    } catch (error) {
      toast.error('Failed to block user');
      console.error(error);
    } finally {
      setIsBlocking(false);
    }
  };

  const toggleNotifications = async () => {
    if (!auth.currentUser || !post.authorUid) return;
    
    const notifRef = doc(db, 'users', auth.currentUser.uid, 'notificationPrefs', post.authorUid);
    const authorSubRef = doc(db, 'users', post.authorUid, 'subscribers', auth.currentUser.uid);
    try {
      if (notificationsOn) {
        await deleteDoc(notifRef);
        await deleteDoc(authorSubRef);
        toast.success(`Post notifications off for ${post.authorName}`);
      } else {
        const subData = { 
          subscriberId: auth.currentUser.uid,
          subscriberName: auth.currentUser.displayName || 'Anonymous',
          createdAt: serverTimestamp() 
        };
        await setDoc(notifRef, { 
          authorId: post.authorUid,
          authorName: post.authorName,
          enabled: true,
          createdAt: serverTimestamp() 
        });
        await setDoc(authorSubRef, subData);
        toast.success(`Post notifications on for ${post.authorName}`);
      }
      setNotificationsOn(!notificationsOn);
      setShowPostMenu(false);
    } catch (error) {
      toast.error('Failed to update notification settings');
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${post.authorName} on Kith`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      }
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(post.codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatPostDate = (date: any) => {
    if (!date) return '';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      if (!(d instanceof Date) || isNaN(d.getTime())) {
        return '';
      }
      const now = new Date();
      const seconds = differenceInSeconds(now, d);
      const minutes = differenceInMinutes(now, d);
      const hours = differenceInHours(now, d);

      if (seconds < 0) return 'just now';
      if (seconds < 60) return `${seconds}s`;
      if (minutes < 60) return `${minutes}m`;
      if (hours < 24) return `${hours}h`;
      
      if (isSameYear(d, now)) {
        return format(d, 'MMM d');
      }
      return format(d, 'MMM d, yyyy');
    } catch (e) {
      return '';
    }
  };

  const isHighlighted = searchParams.get('postId') === post.id;

  const renderContent = (content: string) => {
    return content.split(/(@\w+|#\w+)/g).map((part: string, i: number) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className="text-primary font-medium hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); navigate(`/creators/${part.slice(1)}`); }}>{part}</span>
        );
      } else if (part.startsWith('#')) {
        const channelName = part.slice(1).toLowerCase();
        const linkedChannel = channelsList.find(c => c.name.toLowerCase() === channelName);

        if (linkedChannel) {
          return (
            <span 
              key={i} 
              className="text-primary font-bold hover:underline cursor-pointer px-1 rounded transition-colors bg-primary/5 inline-flex items-center gap-0.5" 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (post.communityId) {
                  navigate(`/feed?view=community&id=${post.communityId}&channelId=${linkedChannel.id}`);
                }
              }}
            >
              <Hash size={12} className="inline shrink-0" />{part.slice(1)}
            </span>
          );
        }

        return (
          <span 
            key={i} 
            className="text-primary font-bold hover:underline cursor-pointer px-0.5 rounded transition-colors hover:bg-primary/10" 
            onClick={(e) => { 
              e.stopPropagation(); 
              navigate(`/feed?hashtag=${encodeURIComponent(part.slice(1))}`);
            }}
          >
            {part}
          </span>
        );
      } else {
        return part.split(/(https?:\/\/[^\s]+)/g).map((subPart: string, j: number) => 
          subPart.match(/^https?:\/\//) ? (
            <a key={`${i}-${j}`} href={subPart} target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 hover:underline transition-colors font-medium" onClick={(e) => e.stopPropagation()}>{subPart}</a>
          ) : subPart
        );
      }
    });
  };

  return (
    <div ref={cardRef} className="space-y-1">
      {post.type === 'repost' && (
        <div className="flex items-center gap-2 pl-12 pt-3 -mb-2 text-[13px] font-medium text-black/50 dark:text-white/50">
          <Repeat size={14} />
          <span>{post.authorUid === auth.currentUser?.uid ? 'You' : post.authorName} reposted</span>
        </div>
      )}
      
      {post.type === 'repost' ? (
        loadingOriginal ? (
          <div className="px-5 py-4 border-b border-black/10 dark:border-white/10 animate-pulse">
            <div className="h-20 bg-black/5 dark:bg-white/5 rounded-2xl" />
          </div>
        ) : originalPost ? (
          <PostCard post={originalPost} />
        ) : (
          <div className="px-5 py-6 border-b border-black/10 dark:border-white/10 text-center text-sm text-black/40 dark:text-white/40">
            Original post was deleted
          </div>
        )
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`border-b border-black/10 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors relative group
            ${compact ? 'px-4 py-3' : 'px-5 py-4'} ${showComments ? 'z-20' : 'z-10'}
            ${isHighlighted ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
        >
      {/* Image Modal - Rendered via Portal to escape stacking context */}
      {createPortal(
        <AnimatePresence>
          {selectedImage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
              onClick={() => setSelectedImage(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-[95vw] max-h-[95vh] flex items-center justify-center"
                onClick={e => e.stopPropagation()}
              >
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors bg-black/50 border border-white/20 rounded-full"
                >
                  <X size={24} />
                </button>
                <img 
                  src={selectedImage} 
                  alt="Enlarged preview" 
                  className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="flex items-start gap-3">
        <UserHoverCard userId={post.authorUid}>
          <Link
            to={`/creators/${post.authorUid}`}
            className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} relative rounded-full bg-black/10 dark:bg-white/10 flex-shrink-0 block ${liveEvent ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-background' : ''}`}
            title={liveEvent ? `Live now${liveEvent.title ? `: ${liveEvent.title}` : ''}` : undefined}
          >
            <img 
              src={(authorProfile?.profileImage && authorProfile.profileImage?.trim() !== '') ? authorProfile.profileImage : (post.authorPhoto && post.authorPhoto?.trim() !== '' ? post.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorUid}`)} 
              alt={post.authorName} 
              referrerPolicy="no-referrer"
              onError={avatarFallback(post.authorUid)}
              className="w-full h-full rounded-full object-cover"
            />
            {liveEvent && (
              <span className="absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-[1px] text-[7px] font-black uppercase tracking-[0.14em] text-white shadow-lg">
                Live
              </span>
            )}
          </Link>
        </UserHoverCard>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-1.5 min-w-0 text-[15px] leading-snug">
                <UserHoverCard userId={post.authorUid}>
                  <Link to={`/creators/${post.authorUid}`} className="font-semibold hover:underline text-black dark:text-white flex items-center gap-1 min-w-0">
                    <span className="truncate">{authorProfile?.displayName || post.authorName}</span>
                    <VerifiedBadge userId={post.authorUid} verified={authorProfile?.verified} />
                  </Link>
                </UserHoverCard>
              {authorProfile?.username && (
                <span className="text-black/50 dark:text-white/50 truncate">@{authorProfile.username}</span>
              )}
              {liveEvent && (
                <Link
                  to={`/live/${liveEvent.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-red-500 transition-colors hover:bg-red-500/15"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  Live
                </Link>
              )}
              <span className="text-black/30 dark:text-white/30" aria-hidden>·</span>
              <span className="text-black/50 dark:text-white/50 whitespace-nowrap">{formatPostDate(post.createdAt)}</span>
              {auth.currentUser && auth.currentUser.uid !== post.authorUid && !isFollowing && (
                <>
                  <span className="text-black/30 dark:text-white/30" aria-hidden>·</span>
                  <button onClick={handleFollow} className="font-semibold text-primary hover:underline">
                    Follow
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center shrink-0 -mt-1 -mr-2">
              {auth.currentUser && (
                <div className="relative" ref={postMenuRef}>
                  <button 
                    onClick={() => setShowPostMenu(!showPostMenu)}
                    aria-label="More options"
                    className="p-2 rounded-full text-black/40 dark:text-white/40 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <MoreVertical size={16} />
                  </button>
                  <AnimatePresence>
                    {showPostMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                      >
                        {auth.currentUser.uid === post.authorUid ? (
                          <>
                            <button 
                              onClick={() => { setIsEditing(true); setShowPostMenu(false); }}
                              className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              <Edit2 size={14} /> Edit Post
                            </button>
                            <button 
                              onClick={handleDeletePost}
                              className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={14} /> Delete Post
                            </button>
                          </>
                        ) : (
                          <>
                            {feedActions && (
                              <div className="border-b border-black/10 dark:border-white/10">
                                {[
                                  { label: 'Why am I seeing this?', icon: HelpCircle, run: feedActions.onWhy },
                                  { label: 'Show more like this', icon: ThumbsUp, run: feedActions.onShowMore },
                                  { label: 'Not interested', icon: EyeOff, run: feedActions.onNotInterested },
                                  { label: `Mute ${authorProfile?.username ? '@' + authorProfile.username : post.authorName}`, icon: VolumeX, run: feedActions.onMute },
                                ].map(action => (
                                  <button
                                    key={action.label}
                                    onClick={() => { setShowPostMenu(false); action.run(); }}
                                    className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-left text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                  >
                                    <action.icon size={14} className="shrink-0" /> <span className="truncate">{action.label}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <button 
                              onClick={toggleNotifications}
                              className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              {notificationsOn ? <BellOff size={14} /> : <Bell size={14} />}
                              {notificationsOn ? 'Turn Off Notifications' : 'Turn On Notifications'}
                            </button>
                            <button 
                              onClick={() => { setShowReportModal(true); setShowPostMenu(false); }}
                              className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-yellow-500 hover:bg-yellow-500/10 transition-colors"
                            >
                              <Flag size={14} /> Report Post
                            </button>
                            <button 
                              onClick={handleBlockUser}
                              disabled={isBlocking}
                              className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <ShieldAlert size={14} /> Block {post.authorName}
                            </button>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
          {(post.kind === 'shiplog' || post.kind === 'feedback') && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium">
              {post.kind === 'shiplog' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  <TrendingUp size={12} /> Progress{post.shipDay ? ` · Day ${post.shipDay}` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  <MessageCircleQuestion size={12} /> Asking for feedback
                </span>
              )}
              {post.project && <span className="text-black/50 dark:text-white/50">{post.project}</span>}
            </div>
          )}
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm text-black dark:text-white outline-none focus:border-primary min-h-[100px]"
              />
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-sm font-medium text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditPost}
                  className="px-4 py-1.5 bg-primary text-white text-sm font-semibold rounded-full"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className={`mt-1 ${compact ? 'text-sm' : 'text-[15px]'} leading-relaxed text-black/90 dark:text-white/90 whitespace-pre-wrap break-words`}>
              {isDetailView ? (
                renderContent(content)
              ) : (
                <div 
                  onClick={() => navigate(`/post/${post.id}`, { state: { post } })} 
                  className="block hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {renderContent(displayContent)}
                  {shouldTruncate && (
                    <span className="text-primary hover:underline ml-1 font-medium">
                      Show more
                    </span>
                  )}
                </div>
              )}

              {/* Quote Repost Preview */}
              {post.type === 'quote' && post.originalPostId && (
                <div className="mt-4">
                  {loadingOriginal ? (
                    <div className="h-24 bg-black/5 dark:bg-white/5 rounded-2xl animate-pulse border border-black/10 dark:border-white/10" />
                  ) : originalPost ? (
                    <div 
                      onClick={(e) => { e.stopPropagation(); navigate(`/post/${originalPost.id}`, { state: { post: originalPost } }); }}
                      className="border border-black/20 dark:border-white/10 rounded-2xl p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-all group/quote cursor-pointer bg-black/5 dark:bg-white/5"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0">
                          <img 
                            src={originalPost.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${originalPost.authorUid}`} 
                            alt={originalPost.authorName} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <span className="text-[12px] font-bold text-black dark:text-white truncate flex items-center gap-1">
                          <span>{originalPost.authorName}</span>
                          <VerifiedBadge userId={originalPost.authorUid} />
                        </span>
                        <span className="text-[11px] text-black/40 dark:text-white/40">{originalPost.createdAt ? formatPostDate(originalPost.createdAt) : ''}</span>
                      </div>
                      <p className="text-[14px] text-black/70 dark:text-white/70 line-clamp-2 break-words">
                        {originalPost.content}
                      </p>
                    </div>
                  ) : (
                    <div className="border border-dashed border-black/10 dark:border-white/10 rounded-2xl p-4 text-sm text-black/40 dark:text-white/40">
                      Original post unavailable
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {post.media?.length > 0 ? (
            <PostMedia media={post.media} active={inView} onOpenImage={setSelectedImage} />
          ) : previewUrl ? (
            <LinkPreview url={previewUrl} enabled={seen} compact={compact} />
          ) : null}

          {/* Poll Rendering */}
          {livePost.poll && (
            <div className="border border-black/10 dark:border-white/10 rounded-2xl p-4 mt-3 space-y-3">
              <h4 className="font-semibold text-[15px]">{livePost.poll.question}</h4>
              <div className="space-y-3">
                {livePost.poll.options.map((option: any, i: number) => {
                  const totalVotes = livePost.poll.options.reduce((acc: number, curr: any) => acc + curr.votes, 0);
                  const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                  return (
                    <button
                      key={i}
                      onClick={() => handleVote(i)}
                      disabled={voted}
                      className="w-full relative h-11 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 hover:border-primary/40 transition-colors group disabled:cursor-default"
                    >
                      <div 
                        className="absolute inset-0 bg-primary/20 transition-all duration-1000" 
                        style={{ width: voted ? `${percentage}%` : '0%' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-4">
                        <span className="font-medium text-sm">{option.text}</span>
                        {voted && <span className="text-sm font-semibold text-primary">{percentage}%</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-black/50 dark:text-white/50 flex justify-between">
                <span>{livePost.poll.options.reduce((acc: number, curr: any) => acc + curr.votes, 0)} votes</span>
                <span>Expires {(() => {
                  if (!livePost.poll.expiresAt) return '';
                  try {
                    const d = livePost.poll.expiresAt.toDate ? livePost.poll.expiresAt.toDate() : new Date(livePost.poll.expiresAt);
                    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
                    return formatDistanceToNow(d, { addSuffix: true });
                  } catch (e) {
                    return '';
                  }
                })()}</span>
              </div>
            </div>
          )}

          {post.codeSnippet && (
            <div className="relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 mt-3 group">
              <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={copyCode}
                  className="p-2 bg-black/10 dark:bg-white/10 hover:bg-primary/20 rounded-lg text-black/70 dark:text-white/70 hover:text-primary transition-all"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
              <div className="absolute top-4 left-4 z-10 px-2 py-1 bg-black/10 dark:bg-white/10 rounded-md text-[10px] font-mono text-black/30 dark:text-white/30 uppercase">
                {post.language}
              </div>
              <SyntaxHighlighter 
                language={post.language} 
                style={atomDark}
                customStyle={{
                  margin: 0,
                  padding: '2rem 1.5rem 1.5rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'rgba(0,0,0,0.05)'
                }}
              >
                {post.codeSnippet}
              </SyntaxHighlighter>
            </div>
          )}

          {post.hashtags && post.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
              {post.hashtags.map((tag: string) => (
                <button
                  key={tag}
                  onClick={() => navigate(`/feed?hashtag=${encodeURIComponent(tag)}`)}
                  className="text-sm text-primary hover:underline"
                >
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between max-w-md mt-2 -ml-2">
            <button 
              onClick={handleLike}
              aria-label={liked ? 'Unlike' : 'Like'}
              aria-pressed={liked}
              className={`group/act flex items-center gap-1.5 text-[13px] tabular-nums transition-colors ${liked ? 'text-rose-500' : 'text-black/50 dark:text-white/50 hover:text-rose-500'}`}
            >
              <span className="p-2 rounded-full group-hover/act:bg-rose-500/10 transition-colors"><Heart size={18} fill={liked ? 'currentColor' : 'none'} /></span>
              <span>{formatCount(livePost.likesCount || 0)}</span>
            </button>
            <button 
              onClick={() => { setFocusComment(!showComments); setShowComments(!showComments); }}
              aria-label="Comments"
              aria-expanded={showComments}
              className={`group/act flex items-center gap-1.5 text-[13px] tabular-nums transition-colors ${showComments ? 'text-primary' : 'text-black/50 dark:text-white/50 hover:text-primary'}`}
            >
              <span className="p-2 rounded-full group-hover/act:bg-primary/10 transition-colors"><MessageSquare size={18} /></span>
              <span>{formatCount(livePost.commentsCount || 0)}</span>
            </button>
            <div className="relative" ref={repostMenuRef}>
              <button 
                onClick={() => setShowRepostMenu(!showRepostMenu)}
                aria-label="Repost"
                className={`group/act flex items-center gap-1.5 text-[13px] tabular-nums transition-colors ${reposted ? 'text-emerald-500' : 'text-black/50 dark:text-white/50 hover:text-emerald-500'}`}
              >
                <span className="p-2 rounded-full group-hover/act:bg-emerald-500/10 transition-colors"><Repeat size={18} className={reposting ? 'animate-spin' : ''} /></span>
                <span>{formatCount(repostsCount)}</span>
              </button>
              <AnimatePresence>
                {showRepostMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
                  >
                    <button 
                      onClick={handleRepost}
                      disabled={reposting}
                      className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <Repeat size={14} /> {reposted ? 'Undo repost' : 'Repost'}
                    </button>
                    <button 
                      onClick={handleQuoteRepost}
                      className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <Edit2 size={14} /> Quote
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={handleBookmark}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
              aria-pressed={bookmarked}
              className={`group/act flex items-center gap-1.5 text-[13px] tabular-nums transition-colors ${bookmarked ? 'text-primary' : 'text-black/50 dark:text-white/50 hover:text-primary'}`}
            >
              <span className="p-2 rounded-full group-hover/act:bg-primary/10 transition-colors"><Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} /></span>
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-[13px] tabular-nums text-black/50 dark:text-white/50" title="Views">
              <span className="p-2"><Eye size={18} /></span>
              <span>{formatCount(livePost.impressions || 0)}</span>
            </div>
            <button onClick={handleShare} aria-label="Share" className="group/act flex items-center gap-1.5 text-[13px] tabular-nums transition-colors text-black/50 dark:text-white/50 hover:text-primary">
              <span className="p-2 rounded-full group-hover/act:bg-primary/10 transition-colors"><Share2 size={18} /></span>
            </button>
            <button 
              onClick={() => {
                if (!auth.currentUser) {
                  toast.error('Sign in to gift XP');
                  return;
                }
                setShowGiftModal(true);
              }}
              aria-label="Gift XP"
              title="Gift XP"
              className="group/act hidden sm:flex items-center gap-1.5 text-[13px] tabular-nums transition-colors text-black/50 dark:text-white/50 hover:text-amber-500"
            >
              <span className="p-2 rounded-full group-hover/act:bg-amber-500/10 transition-colors"><Gift size={18} /></span>
            </button>
          </div>
        </div>
      </div>

      <XPGiftModal 
        isOpen={showGiftModal} 
        onClose={() => setShowGiftModal(false)} 
        receiverId={post.authorUid}
        receiverName={post.authorName}
      />

      <ConfirmModal 
        isOpen={showDeletePostConfirm}
        onClose={() => setShowDeletePostConfirm(false)}
        onConfirm={confirmDeletePost}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete Post"
        loading={deleting}
      />

      <ReportModal 
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={post.id}
        targetType="message"
        contentSnippet={content}
        targetAuthorId={post.authorUid}
        communityId={post.communityId}
      />

      {showComments && (
        <div className={isDetailView ? 'mt-2 pt-2 border-t border-black/10 dark:border-white/10' : 'pl-[52px]'}>
          <CommentThread post={post} collectionName={collectionName} autoFocus={focusComment} />
        </div>
      )}
    </motion.div>
      )}
    </div>
  );
}
