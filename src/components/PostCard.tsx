import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, increment, setDoc, deleteDoc, collection, query, orderBy, onSnapshot, addDoc, getDoc, arrayUnion, serverTimestamp, where, startAfter, getDocs, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageSquare, Share2, Copy, Check, Gift, Zap, Send, MoreVertical, Edit2, Trash2, Reply, ThumbsUp, Smile, X, UserPlus, UserMinus, Eye, ExternalLink, Bookmark, ChevronRight, Hash, Flag, Bell, BellOff, ShieldAlert, Repeat } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { formatDistanceToNow, format, isSameYear, differenceInSeconds, differenceInMinutes, differenceInHours } from 'date-fns';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import XPGiftModal from './XPGiftModal';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import UserHoverCard from './UserHoverCard';
import { createNotification } from '../lib/notifications';
import ConfirmModal from './ConfirmModal';
import ReportModal from './ReportModal';
import { toast } from 'react-hot-toast';
import { updateDailyStats } from '../lib/stats';
import VerifiedBadge from './VerifiedBadge';

export default function PostCard({ post, onPostDeleted, isDetailView = false, compact = false }: { post: any, onPostDeleted?: () => void, isDetailView?: boolean, compact?: boolean }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [liked, setLiked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showComments, setShowComments] = useState(isDetailView);
  const [comments, setComments] = useState<any[]>([]);
  const [replies, setReplies] = useState<Record<string, any[]>>({});
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const [lastCommentDoc, setLastCommentDoc] = useState<any>(null);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [voted, setVoted] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeletePostConfirm, setShowDeletePostConfirm] = useState(false);
  const [showDeleteCommentConfirm, setShowDeleteCommentConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [reposting, setReposting] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount || 0);
  const repostMenuRef = useRef<HTMLDivElement>(null);
  const [commentToDeleteId, setCommentToDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [originalPost, setOriginalPost] = useState<any>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const postMenuRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const TRUNCATE_LIMIT = 280;
  const content = post.content || post.description || '';
  const shouldTruncate = !isDetailView && content.length > TRUNCATE_LIMIT;
  const displayContent = shouldTruncate ? content.slice(0, TRUNCATE_LIMIT) + '...' : content;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
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

  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [authorProfile, setAuthorProfile] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [linkPreview, setLinkPreview] = useState<any>(null);
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
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const content = post.content || post.description || '';
    const urls = content.match(urlRegex);
    if (urls && urls.length > 0) {
      const fetchMetadata = async () => {
        try {
          const res = await fetch(`/api/unfurl?url=${encodeURIComponent(urls[0])}`);
          if (res.ok) {
            const data = await res.json();
            setLinkPreview(data);
          } else {
            setLinkPreview({ url: urls[0], title: 'Link Preview', description: 'Click to visit link' });
          }
        } catch (e) {
          setLinkPreview({ url: urls[0], title: 'Link Preview', description: 'Click to visit link' });
        }
      };
      fetchMetadata();
    }
  }, [post.content]);

  // Track impression once per user per post
  useEffect(() => {
    if (!post.id || !auth.currentUser || impressionTracked.current) return;
    
    const trackImpression = async () => {
      try {
        // Map contentType to collection name
        const typeMapping: Record<string, string> = {
          'post': 'posts',
          'article': 'articles',
          'challenge': 'challenges',
          'event': 'events',
          'product': 'products',
          'job': 'jobs',
          'liveStream': 'liveStreams',
          'poll': 'posts' // Polls are currently stored in posts
        };
        const collectionName = typeMapping[post.contentType] || 'posts';
        
        const viewRef = doc(db, collectionName, post.id, 'views', auth.currentUser!.uid);
        const viewDoc = await getDoc(viewRef).catch(() => null);
        
        if (viewDoc && !viewDoc.exists()) {
          const docRef = doc(db, collectionName, post.id);
          const actualDoc = await getDoc(docRef);
          
          if (actualDoc.exists()) {
             await setDoc(viewRef, { viewedAt: serverTimestamp() });
             // Some items use impressions, some viewsCount. Let's try to be consistent if rule allows.
             const updateData: any = {};
             if (post.contentType === 'article') {
               updateData.viewsCount = increment(1);
             } else {
               updateData.impressions = increment(1);
             }
             await updateDoc(docRef, updateData).catch(err => {
               if (err.code === 'not-found') return; // Ignore if doc deleted
               console.warn("Update impressions failed:", err.message);
             });
          }
        }
        impressionTracked.current = true;
      } catch (e: any) { 
        if (e.code === 'permission-denied') {
          // Silently fail for permissions on impressions in background
        } else if (e.code !== 'not-found') {
          console.error("Impression error:", e);
        }
      }
    };
    // Small delay
    const timer = setTimeout(trackImpression, 2000);
    return () => clearTimeout(timer);
  }, [post.id, auth.currentUser?.uid]);

  useEffect(() => {
    if (!post.authorUid || !auth.currentUser) return;
    
    // Fetch author's latest profile for universal XP and updated name
    const unsubscribeAuthor = onSnapshot(doc(db, 'users', post.authorUid), (doc) => {
      if (doc.exists()) {
        setAuthorProfile(doc.data());
      }
    });

    // Fetch current user's profile for their username when commenting
    const unsubscribeMe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setCurrentUserProfile(doc.data());
      }
    });

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

    let unsubscribeComments: (() => void) | null = null;

    // Fetch top-level comments if open
    if (showComments) {
      const q = query(
        collection(db, collectionName, post.id, 'comments'), 
        where('replyToId', '==', null),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      unsubscribeComments = onSnapshot(q, async (snapshot) => {
        const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(fetchedComments);
        setLastCommentDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreComments(snapshot.docs.length === 10);
        
        // Fetch user likes for these comments
        const likes: Record<string, boolean> = {};
        if (auth.currentUser) {
          await Promise.all(fetchedComments.map(async (comment) => {
            const cLikeRef = doc(db, collectionName, post.id, 'comments', comment.id, 'likes', auth.currentUser!.uid);
            const cLikeDoc = await getDoc(cLikeRef);
            likes[comment.id] = cLikeDoc.exists();
          }));
          setCommentLikes(prev => ({ ...prev, ...likes }));
        }
      });
    }

    return () => {
      unsubscribeAuthor();
      unsubscribeMe();
      if (unsubscribeComments) unsubscribeComments();
    };
  }, [post.authorUid, post.id, auth.currentUser?.uid, showComments]);

  const handleFollow = async () => {
    if (!auth.currentUser) {
      toast.error('Sign in to follow creators');
      return;
    }
    if (auth.currentUser.uid === post.authorUid) return;
    const myFollowRef = doc(db, 'users', auth.currentUser.uid, 'following', post.authorUid);
    const theirFollowerRef = doc(db, 'users', post.authorUid, 'followers', auth.currentUser.uid);
    
    try {
      if (isFollowing) {
        await deleteDoc(myFollowRef);
        await deleteDoc(theirFollowerRef);
      } else {
        await setDoc(myFollowRef, { createdAt: serverTimestamp() });
        await setDoc(theirFollowerRef, { createdAt: serverTimestamp() });
      }
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
      if (liked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likesCount: increment(-1) });
      } else {
        await setDoc(likeRef, { createdAt: serverTimestamp(), userId: auth.currentUser.uid, postId: post.id });
        await updateDoc(postRef, { likesCount: increment(1) });
        
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
      await updateDoc(doc(db, collectionName, post.id), {
        content: editContent,
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

  const handleLikeComment = async (commentId: string, currentLiked: boolean) => {
    if (!auth.currentUser) {
      toast.error('Sign in to like comments');
      return;
    }
    const commentRef = doc(db, collectionName, post.id, 'comments', commentId);
    const likeRef = doc(db, collectionName, post.id, 'comments', commentId, 'likes', auth.currentUser.uid);
    
    try {
      if (currentLiked) {
        await deleteDoc(likeRef);
        await updateDoc(commentRef, { likesCount: increment(-1) });
        setCommentLikes(prev => ({ ...prev, [commentId]: false }));
      } else {
        await setDoc(likeRef, { createdAt: serverTimestamp(), userId: auth.currentUser.uid, postId: post.id, commentId: commentId });
        await updateDoc(commentRef, { likesCount: increment(1) });
        setCommentLikes(prev => ({ ...prev, [commentId]: true }));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}/comments/${commentId}`);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    setCommentToDeleteId(commentId);
    setShowDeleteCommentConfirm(true);
  };

  const confirmDeleteComment = async () => {
    if (!auth.currentUser || !commentToDeleteId) return;
    setDeleting(true);
    try {
      // Optimistic delete
      setComments(prev => prev.filter(c => c.id !== commentToDeleteId));
      
      await deleteDoc(doc(db, collectionName, post.id, 'comments', commentToDeleteId));
      await updateDoc(doc(db, collectionName, post.id), { commentsCount: increment(-1) });
      setShowDeleteCommentConfirm(false);
      setCommentToDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}/comments/${commentToDeleteId}`);
    } finally {
      setDeleting(false);
    }
  };

  const onEmojiClick = (emojiData: any) => {
    setNewComment(prev => prev + emojiData.emoji);
  };

  const fetchMoreComments = async () => {
    if (!lastCommentDoc || !hasMoreComments || loadingMoreComments) return;
    setLoadingMoreComments(true);
    try {
      const q = query(
        collection(db, collectionName, post.id, 'comments'),
        where('replyToId', '==', null),
        orderBy('createdAt', 'desc'),
        startAfter(lastCommentDoc),
        limit(10)
      );
      const snap = await getDocs(q);
      const newComments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(prev => [...prev, ...newComments]);
      setLastCommentDoc(snap.docs[snap.docs.length - 1]);
      setHasMoreComments(snap.docs.length === 10);
      
      // Fetch likes
      const likes: Record<string, boolean> = {};
      await Promise.all(newComments.map(async (comment) => {
        const cLikeRef = doc(db, 'posts', post.id, 'comments', comment.id, 'likes', auth.currentUser!.uid);
        const cLikeDoc = await getDoc(cLikeRef);
        likes[comment.id] = cLikeDoc.exists();
      }));
      setCommentLikes(prev => ({ ...prev, ...likes }));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `posts/${post.id}/comments`);
    } finally {
      setLoadingMoreComments(false);
    }
  };

  const toggleReplies = async (commentId: string) => {
    if (expandedReplies.has(commentId)) {
      setExpandedReplies(prev => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      return;
    }

    setExpandedReplies(prev => new Set(prev).add(commentId));
    
    if (!replies[commentId]) {
      setLoadingReplies(prev => ({ ...prev, [commentId]: true }));
      try {
        const q = query(
          collection(db, collectionName, post.id, 'comments'),
          where('replyToId', '==', commentId),
          orderBy('createdAt', 'asc')
        );
        const snap = await getDocs(q);
        const fetchedReplies = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setReplies(prev => ({ ...prev, [commentId]: fetchedReplies }));
        
        // Fetch likes for replies
        const likes: Record<string, boolean> = {};
        await Promise.all(fetchedReplies.map(async (reply) => {
          const cLikeRef = doc(db, collectionName, post.id, 'comments', reply.id, 'likes', auth.currentUser!.uid);
          const cLikeDoc = await getDoc(cLikeRef);
          likes[reply.id] = cLikeDoc.exists();
        }));
        setCommentLikes(prev => ({ ...prev, ...likes }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `${collectionName}/${post.id}/comments/${commentId}/replies`);
      } finally {
        setLoadingReplies(prev => ({ ...prev, [commentId]: false }));
      }
    }
  };

  const handleReply = (comment: any) => {
    // If replying to a reply, link to the parent of that reply to maintain flat depth=2
    const actualParentId = comment.replyToId || comment.id;
    setReplyTo({ ...comment, id: actualParentId }); // Set replyToId to the top-level comment
    
    // Prefer username for tagging, fallback to name without spaces
    const authorName = comment.authorName || 'user';
    const username = comment.authorUsername || authorName.replace(/\s+/g, '_').toLowerCase();
    setNewComment(`@${username} `);
    setShowComments(true);
    
    // Auto-focus the input
    setTimeout(() => {
      commentInputRef.current?.focus();
      if (commentInputRef.current) {
        // Move cursor to the end
        const val = commentInputRef.current.value;
        commentInputRef.current.setSelectionRange(val.length, val.length);
      }
    }, 100);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      toast.error('Sign in to leave a comment');
      return;
    }
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const commentData: any = {
        authorUid: auth.currentUser.uid,
        authorName: currentUserProfile?.displayName || auth.currentUser.displayName || 'Anonymous',
        authorUsername: currentUserProfile?.username || auth.currentUser.email?.split('@')[0] || 'user',
        authorPhoto: auth.currentUser.photoURL || '',
        content: newComment,
        createdAt: serverTimestamp(),
        likesCount: 0,
        repliesCount: 0,
        replyToId: replyTo?.id || null
      };

      const commentRef = await addDoc(collection(db, collectionName, post.id, 'comments'), commentData);
      await updateDoc(doc(db, collectionName, post.id), { commentsCount: increment(1) });
      
      // Update replies count and optimistic state if it's a reply
      if (replyTo?.id) {
        await updateDoc(doc(db, collectionName, post.id, 'comments', replyTo.id), {
          repliesCount: increment(1)
        });
        
        // Optimistically add to replies state if expanded
        if (expandedReplies.has(replyTo.id)) {
          const newReply = { id: commentRef.id, ...commentData, createdAt: { toDate: () => new Date() } };
          setReplies(prev => ({
            ...prev,
            [replyTo.id]: [...(prev[replyTo.id] || []), newReply]
          }));
        }
      }

      // Trigger notification
      const recipientId = replyTo ? replyTo.authorUid : post.authorUid;
      if (recipientId !== auth.currentUser.uid) {
        await createNotification({
          recipientId,
          senderId: auth.currentUser.uid,
          senderName: currentUserProfile?.displayName || auth.currentUser.displayName || 'Someone',
          senderUsername: currentUserProfile?.username || auth.currentUser.email?.split('@')[0] || 'user',
          senderPhoto: auth.currentUser.photoURL || '',
          type: 'comment',
          content: replyTo ? `replied to your comment` : `commented on your post`,
          relatedId: post.id
        });
      }

      // Award 1 XP for commenting
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        xp: increment(1)
      });

      // Track XP in community stats
      if (post.communityId) {
        updateDailyStats(post.communityId, 'xpAwarded', 1).catch(console.error);
        // Also award to community member profile
        updateDoc(doc(db, 'communities', post.communityId, 'members', auth.currentUser.uid), {
          xp: increment(1)
        }).catch(console.error);
      }
      
      setNewComment('');
      setReplyTo(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `posts/${post.id}/comments`);
    } finally {
      setSubmittingComment(false);
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
              setSearchParams({ hashtag: part }); 
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
    <div className="space-y-1">
      {post.type === 'repost' && (
        <div className="flex items-center gap-2 ml-14 mb-1 text-xs font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">
          <Repeat size={14} />
          <span>{post.authorUid === auth.currentUser?.uid ? 'You' : post.authorName} Reposted</span>
        </div>
      )}
      
      {post.type === 'repost' ? (
        loadingOriginal ? (
          <div className="bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 rounded-[32px] p-6 animate-pulse ml-4">
            <div className="h-20 bg-black/5 dark:bg-white/5 rounded-2xl" />
          </div>
        ) : originalPost ? (
          <PostCard post={originalPost} />
        ) : (
          <div className="bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 rounded-[32px] p-6 text-center text-black/40 dark:text-white/40 text-xs font-bold uppercase tracking-widest italic ml-4">
            Original post was deleted
          </div>
        )
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`bg-transparent border-b hover:bg-black/[0.04] dark:hover:bg-white/[0.04] border-black/10 dark:border-white/10 transition-all duration-200 relative group 
            ${compact ? 'p-4' : 'p-6'} ${showEmojiPicker ? 'z-50' : 'z-10'} 
            ${isHighlighted ? 'bg-primary/5 border-l-4 border-l-primary' : ''}`}
        >
      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none" />
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
                  className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors bg-black/50 border border-white/20 rounded-none"
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

      <div className={`flex items-start gap-4 ${compact ? 'mb-2' : 'mb-4'}`}>
        <UserHoverCard userId={post.authorUid}>
          <Link to={`/creators/${post.authorUid}`} className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-black/10 dark:bg-white/10 overflow-hidden flex-shrink-0 block border border-black/10 dark:border-white/10`}>
            <img 
              src={(authorProfile?.profileImage && authorProfile.profileImage?.trim() !== '') ? authorProfile.profileImage : (post.authorPhoto && post.authorPhoto?.trim() !== '' ? post.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.authorUid}`)} 
              alt={post.authorName} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </Link>
        </UserHoverCard>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <UserHoverCard userId={post.authorUid}>
                  <Link to={`/creators/${post.authorUid}`} className={`${compact ? 'text-sm' : ''} text-[15px] font-bold hover:text-primary transition-colors text-black dark:text-white flex items-center gap-1.5`}>
                    <span>{authorProfile?.displayName || post.authorName}</span>
                    <VerifiedBadge userId={post.authorUid} verified={authorProfile?.verified} />
                  </Link>
                </UserHoverCard>
                {authorProfile?.username && (
                  <span className="text-[15px] text-black/30 dark:text-white/50">@{authorProfile.username}</span>
                )}
                <div className="flex items-center gap-1 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                  <Zap size={10} className="text-yellow-400" />
                  <span className="text-[10px] font-bold text-yellow-400">{authorProfile?.xp || post.authorXp || 0}</span>
                </div>
                {auth.currentUser && auth.currentUser.uid !== post.authorUid && !isFollowing && (
                  <button 
                    onClick={handleFollow}
                    className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all flex items-center gap-1 border bg-primary/10 border-primary/20 text-primary hover:bg-primary hover:text-white"
                  >
                    Follow
                  </button>
                )}
              </div>
              {authorProfile?.bio && (
                <p className="text-[14px] text-black/40 dark:text-white/60 line-clamp-1 mt-0.5">{authorProfile.bio}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[15px] text-black/30 dark:text-white/30 font-medium">
                {formatPostDate(post.createdAt)}
              </span>
              {auth.currentUser && (
                <div className="relative" ref={postMenuRef}>
                  <button 
                    onClick={() => setShowPostMenu(!showPostMenu)}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-none text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors border border-transparent hover:border-black/10 dark:hover:border-white/10"
                  >
                    <MoreVertical size={16} />
                  </button>
                  <AnimatePresence>
                    {showPostMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#0a0a0a] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
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
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-none p-3 text-sm text-black dark:text-white outline-none focus:border-primary min-h-[100px]"
              />
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 font-black uppercase tracking-widest text-[10px] text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditPost}
                  className="px-4 py-1.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-none"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className={`mt-2 ${compact ? 'text-sm' : 'text-[15px]'} leading-relaxed text-white/90 font-medium whitespace-pre-wrap`}>
              {isDetailView ? (
                renderContent(content)
              ) : (
                <div 
                  onClick={() => navigate(`/post/${post.id}`, { state: { post } })} 
                  className="block hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {renderContent(displayContent)}
                  {shouldTruncate && (
                    <span className="text-primary hover:underline ml-1 font-bold text-xs">
                      See more
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
                    <div className="border border-dashed border-black/10 dark:border-white/10 rounded-2xl p-4 bg-black/5 dark:bg-white/5 text-xs font-bold uppercase tracking-widest text-black/30 dark:text-white/30 italic">
                      Original post unavailable
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {linkPreview && (
            <a 
              href={linkPreview.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-4 block bg-black/[0.02] dark:bg-white/[0.02] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 hover:border-primary/50 transition-all group"
            >
              {linkPreview.image && linkPreview.image?.trim() !== '' && (!post.media || post.media?.length === 0) && (
                <div className="w-full aspect-video overflow-hidden border-b border-black/10 dark:border-white/10">
                  <img 
                    src={(linkPreview.image && linkPreview.image?.trim() !== '') ? linkPreview.image : `https://picsum.photos/seed/${linkPreview.url}/800/400`} 
                    alt={linkPreview.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 bg-black/5 dark:bg-white/5 rounded flex items-center justify-center text-black/20 dark:text-white/20">
                    <ExternalLink size={10} />
                  </div>
                  <span className="text-[10px] text-black/50 dark:text-white/40 font-medium">{linkPreview.siteName}</span>
                </div>
                <h4 className="text-sm font-bold text-black dark:text-white/80 group-hover:text-primary transition-colors line-clamp-1">{linkPreview.title}</h4>
                {linkPreview.description && (
                  <p className="text-xs text-black/40 dark:text-white/40 mt-1 line-clamp-2">{linkPreview.description}</p>
                )}
              </div>
            </a>
          )}

          {/* Media Rendering */}
          {post.media && post.media?.length > 0 && (
            <div className={`grid gap-2 mt-4 ${post.media?.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {post.media.map((item: any, i: number) => (
                <div 
                  key={i} 
                  className="rounded-xl overflow-hidden bg-black/40 border border-black/10 dark:border-white/10 cursor-pointer"
                  onClick={() => item.type === 'image' && item.url && item.url?.trim() !== '' && setSelectedImage(item.url)}
                >
                  {item.type === 'video' ? (
                    <div className="relative aspect-video bg-black/60 group/video">
                      <video 
                        src={(item.url && item.url?.trim() !== '') ? item.url : null} 
                        autoPlay 
                        loop 
                        muted 
                        playsInline 
                        controls 
                        controlsList="nodownload"
                        disablePictureInPicture
                        onContextMenu={(e) => e.preventDefault()}
                        className="w-full h-full object-contain" 
                      />
                      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 rounded-xl" />
                    </div>
                  ) : (
                    <img src={(item.url && item.url.trim() !== '') ? item.url : `https://picsum.photos/seed/${post.id}${i}/800/800`} alt="Post media" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Poll Rendering */}
          {post.poll && (
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-6 mt-4 space-y-4">
              <h4 className="font-black text-sm uppercase tracking-tight">{post.poll.question}</h4>
              <div className="space-y-3">
                {post.poll.options.map((option: any, i: number) => {
                  const totalVotes = post.poll.options.reduce((acc: number, curr: any) => acc + curr.votes, 0);
                  const percentage = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
                  return (
                    <button
                      key={i}
                      onClick={() => handleVote(i)}
                      disabled={voted}
                      className="w-full relative h-12 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 hover:bg-primary/5 transition-all group disabled:cursor-default"
                    >
                      <div 
                        className="absolute inset-0 bg-primary/20 transition-all duration-1000" 
                        style={{ width: voted ? `${percentage}%` : '0%' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-4">
                        <span className="font-bold text-[13px] uppercase tracking-widest">{option.text}</span>
                        {voted && <span className="text-[11px] font-black text-primary">{percentage}%</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-black/30 dark:text-white/30 flex justify-between">
                <span>{post.poll.options.reduce((acc: number, curr: any) => acc + curr.votes, 0)} votes</span>
                <span>Expires {(() => {
                  if (!post.poll.expiresAt) return '';
                  try {
                    const d = post.poll.expiresAt.toDate ? post.poll.expiresAt.toDate() : new Date(post.poll.expiresAt);
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
            <div className="relative rounded-xl overflow-hidden border border-black/10 dark:border-white/10 mt-4 group">
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
            <div className="flex flex-wrap gap-2 mt-4">
              {post.hashtags.map((tag: string) => (
                <button 
                   key={tag} 
                   onClick={() => setSearchParams({ hashtag: tag })}
                   className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/5 border border-primary/20 px-3 py-1 hover:bg-primary hover:text-white transition-all rounded-full"
                >
                   {tag}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-6 mt-6 pb-1">
            <button 
              onClick={handleLike}
              className={`flex items-center gap-2 text-[13px] font-black uppercase tracking-widest transition-all duration-300 hover:scale-110 active:scale-95 ${liked ? 'text-red-500' : 'text-black/40 dark:text-white/50 hover:text-red-500'}`}
            >
              <Heart size={19} fill={liked ? 'currentColor' : 'none'} className="transition-all" />
              <span>{post.likesCount || 0}</span>
            </button>
            <button 
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-2 text-[13px] font-black uppercase tracking-widest transition-all duration-300 hover:scale-110 active:scale-95 ${showComments ? 'text-blue-500' : 'text-black/40 dark:text-white/50 hover:text-blue-500'}`}
            >
              <MessageSquare size={19} />
              <span>{post.commentsCount || 0}</span>
            </button>
            <div className="relative" ref={repostMenuRef}>
              <button 
                onClick={() => setShowRepostMenu(!showRepostMenu)}
                className={`flex items-center gap-2 text-[13px] font-black uppercase tracking-widest transition-all duration-300 hover:scale-110 active:scale-95 ${reposted ? 'text-green-500' : 'text-black/40 dark:text-white/50 hover:text-green-500'}`}
              >
                <Repeat size={19} className={reposting ? 'animate-spin' : ''} />
                <span>{repostsCount}</span>
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
                      <Repeat size={14} /> {reposted ? 'Undo Repost' : 'Repost'}
                    </button>
                    <button 
                      onClick={handleQuoteRepost}
                      className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                    >
                      <Edit2 size={14} /> Quote Post
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={handleBookmark}
              className={`flex items-center gap-2 text-[13px] font-black uppercase tracking-widest transition-all duration-300 hover:scale-110 active:scale-95 ${bookmarked ? 'text-purple-500' : 'text-black/40 dark:text-white/50 hover:text-purple-500'}`}
              title="Bookmark"
            >
              <Bookmark size={19} fill={bookmarked ? 'currentColor' : 'none'} />
            </button>
            <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-widest text-black/40 dark:text-white/50">
              <Eye size={19} />
              <span>{post.impressions || 0}</span>
            </div>
            <button className="flex items-center gap-2 text-[13px] font-black uppercase tracking-widest text-black/40 dark:text-white/50 hover:text-green-500 transition-all duration-300 hover:scale-110 active:scale-95">
              <Share2 size={19} />
            </button>
            <button 
              onClick={() => {
                if (!auth.currentUser) {
                  toast.error('Sign in to gift XP');
                  return;
                }
                setShowGiftModal(true);
              }}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-white hover:text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 transition-all duration-300 hover:scale-[1.05] active:scale-95 ml-auto border border-transparent shadow-md shadow-amber-500/10 px-3.5 py-1.5 rounded-full cursor-pointer"
              title="Gift XP"
            >
              <Gift size={15} className="text-white" />
              <span>Gift XP</span>
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

      <ConfirmModal 
        isOpen={showDeleteCommentConfirm}
        onClose={() => setShowDeleteCommentConfirm(false)}
        onConfirm={confirmDeleteComment}
        title="Delete Comment"
        message="Are you sure you want to delete this comment?"
        confirmText="Delete"
        loading={deleting}
      />

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 space-y-6"
          >
            <form onSubmit={handleAddComment} className="flex flex-col gap-2">
              {replyTo && (
                <div className="flex items-center justify-between bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                  <span className="text-[10px] text-primary font-black uppercase tracking-widest leading-none">Replying to {replyTo.authorUsername ? `@${replyTo.authorUsername}` : `@${replyTo.authorName}`}</span>
                  <button onClick={() => { setReplyTo(null); setNewComment(''); }} className="text-primary hover:text-black">
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 overflow-hidden flex-shrink-0">
                  <img src={(currentUserProfile?.profileImage && currentUserProfile.profileImage.trim() !== '') ? currentUserProfile.profileImage : (auth.currentUser?.photoURL && auth.currentUser.photoURL.trim() !== '' ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`)} alt="Me" referrerPolicy="no-referrer" />
                </div>
                  <div className="flex-1 relative">
                    <textarea 
                      ref={commentInputRef}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment(e as any);
                        }
                      }}
                      placeholder={replyTo ? `Reply to @${replyTo.authorUsername || replyTo.authorName}...` : "Add a comment..."}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-full px-6 py-3 text-[15px] outline-none focus:border-primary pr-24 resize-none min-h-[48px] max-h-[120px] font-bold tracking-tight"
                      rows={1}
                    />
                    <div className="absolute right-3 bottom-0 top-0 flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="text-black/30 dark:text-white/30 hover:text-primary transition-colors"
                      >
                        <Smile size={20} />
                      </button>
                      <button 
                        disabled={submittingComment || !newComment.trim()}
                        className="text-primary disabled:opacity-30 hover:scale-110 transition-transform"
                      >
                        <Send size={20} />
                      </button>
                    </div>
                    {showEmojiPicker && (
                      <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-2 z-[100] origin-bottom-right">
                        <EmojiPicker 
                          theme={Theme.DARK} 
                          onEmojiClick={onEmojiClick}
                          width={320}
                          height={400}
                          skinTonesDisabled
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    )}
                  </div>
              </div>
            </form>

            <div className="space-y-0 max-h-[800px] overflow-y-auto pr-2 scrollbar-none">
              {comments.map(comment => (
                <div key={comment.id} className="py-4">
                  {/* Top-Level Comment Render */}
                   <div className="flex gap-3 group">
                    <UserHoverCard userId={comment.authorUid}>
                      <Link to={`/creators/${comment.authorUid}`} className="w-10 h-10 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 overflow-hidden flex-shrink-0 block">
                        <img 
                          src={(comment.authorUid === auth.currentUser?.uid && currentUserProfile?.profileImage && currentUserProfile.profileImage.trim() !== '' ? currentUserProfile.profileImage : null) || (comment.authorPhoto && comment.authorPhoto.trim() !== '' ? comment.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.authorUid}`)} 
                          alt={comment.authorName} 
                          referrerPolicy="no-referrer" 
                          className="w-full h-full object-cover"
                        />
                      </Link>
                    </UserHoverCard>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <UserHoverCard userId={comment.authorUid}>
                            <Link to={`/creators/${comment.authorUid}`} className="text-[15px] font-bold hover:text-primary transition-colors text-black dark:text-white flex items-center gap-1.5">
                              <span>{comment.authorName}</span>
                              <VerifiedBadge userId={comment.authorUid} />
                            </Link>
                          </UserHoverCard>
                          {comment.authorUsername && (
                            <span className="text-[15px] text-black/30 dark:text-white/30">@{comment.authorUsername}</span>
                          )}
                          <span className="text-[15px] text-black/20 dark:text-white/20">·</span>
                          <span className="text-[15px] text-black/30 dark:text-white/30">
                            {formatPostDate(comment.createdAt)}
                          </span>
                        </div>
                        {auth.currentUser?.uid === comment.authorUid && (
                          <button 
                            onClick={() => handleDeleteComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 text-black/20 dark:text-white/20 hover:text-red-400 transition-all p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <p className="text-[15px] text-black/80 dark:text-white/80 leading-relaxed font-medium">
                        {comment.content.split(/(@\w+)/g).map((part: string, i: number) => 
                          part.startsWith('@') ? (
                            <span key={i} className="text-primary font-bold hover:underline cursor-pointer" onClick={() => navigate(`/creators/${part.slice(1)}`)}>{part}</span>
                          ) : part
                        )}
                      </p>
                      <div className="flex items-center gap-6 mt-2 ml-1">
                        <button 
                          onClick={() => handleLikeComment(comment.id, commentLikes[comment.id] || false)}
                          className={`flex items-center gap-2 text-[13px] font-bold transition-colors ${commentLikes[comment.id] ? 'text-primary' : 'text-black/30 dark:text-white/30 hover:text-primary'}`}
                        >
                          <ThumbsUp size={18} fill={commentLikes[comment.id] ? 'currentColor' : 'none'} />
                          {comment.likesCount || 0}
                        </button>
                        <button 
                          onClick={() => handleReply(comment)}
                          className="flex items-center gap-2 text-[13px] font-bold text-black/30 dark:text-white/30 hover:text-primary transition-colors"
                        >
                          <Reply size={18} />
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Replies Section */}
                  {(comment.repliesCount > 0 || replies[comment.id]?.length > 0) && (
                    <div className="ml-12 mt-4">
                      <button 
                        onClick={() => toggleReplies(comment.id)}
                        className="text-[13px] font-bold text-primary flex items-center gap-1 hover:underline mb-4 transition-all"
                      >
                        {expandedReplies.has(comment.id) ? (
                          <>Hide replies</>
                        ) : (
                          <>
                            Show {comment.repliesCount} {comment.repliesCount === 1 ? 'reply' : 'replies'}
                            <ChevronRight size={14} className="rotate-90" />
                          </>
                        )}
                        {loadingReplies[comment.id] && <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin ml-2" />}
                      </button>
                      
                      {expandedReplies.has(comment.id) && replies[comment.id] && (
                        <div className="space-y-6 pt-2">
                          {replies[comment.id].map(reply => (
                            <div key={reply.id} className="flex gap-3 group">
                              <UserHoverCard userId={reply.authorUid}>
                                <Link to={`/creators/${reply.authorUid}`} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 overflow-hidden flex-shrink-0 block">
                                  <img 
                                    src={(reply.authorUid === auth.currentUser?.uid && currentUserProfile?.profileImage && currentUserProfile.profileImage.trim() !== '' ? currentUserProfile.profileImage : null) || (reply.authorPhoto && reply.authorPhoto.trim() !== '' ? reply.authorPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.authorUid}`)} 
                                    alt={reply.authorName} 
                                    referrerPolicy="no-referrer" 
                                    className="w-full h-full object-cover"
                                  />
                                </Link>
                              </UserHoverCard>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[15px] font-bold text-black dark:text-white flex items-center gap-1.5">
                                      <span>{reply.authorName}</span>
                                      <VerifiedBadge userId={reply.authorUid} />
                                    </span>
                                    {reply.authorUsername && <span className="text-[15px] text-black/30 dark:text-white/30">@{reply.authorUsername}</span>}
                                    <span className="text-[15px] text-black/20 dark:text-white/20">·</span>
                                    <span className="text-[15px] text-black/30 dark:text-white/30">
                                      {formatPostDate(reply.createdAt)}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[15px] text-black/70 dark:text-white/70 leading-relaxed font-medium">
                                  {reply.content.split(/(@\w+)/g).map((part: string, i: number) => 
                                    part.startsWith('@') ? (
                                      <span key={i} className="text-primary font-bold hover:underline cursor-pointer" onClick={() => navigate(`/creators/${part.slice(1)}`)}>{part}</span>
                                    ) : part
                                  )}
                                </p>
                                <div className="flex items-center gap-6 mt-2 ml-1">
                                  <button 
                                    onClick={() => handleLikeComment(reply.id, commentLikes[reply.id] || false)}
                                    className={`flex items-center gap-1.5 text-[12px] font-bold transition-colors ${commentLikes[reply.id] ? 'text-primary' : 'text-black/30 dark:text-white/30 hover:text-primary'}`}
                                  >
                                    <ThumbsUp size={14} fill={commentLikes[reply.id] ? 'currentColor' : 'none'} />
                                    {reply.likesCount || 0}
                                  </button>
                                  <button 
                                    onClick={() => handleReply(reply)}
                                    className="flex items-center gap-1.5 text-[12px] font-bold text-black/30 dark:text-white/30 hover:text-primary transition-colors"
                                  >
                                    <Reply size={14} />
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}


              {hasMoreComments && (
                 <button 
                   onClick={fetchMoreComments}
                   disabled={loadingMoreComments}
                   className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-black/30 dark:text-white/30 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50 border border-black/10 dark:border-white/10 rounded-none mt-2"
                 >
                   {loadingMoreComments ? 'Loading...' : 'Load more comments'}
                 </button>
              )}
              
              {comments.length === 0 && (
                <p className="text-center text-xs text-white/20 py-8">No comments yet. Be the first to start the conversation!</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
      )}
    </div>
  );
}
