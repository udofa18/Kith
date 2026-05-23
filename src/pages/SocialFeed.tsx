import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, orderBy, onSnapshot, limit, where, collectionGroup, startAfter, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';
import PostEditor from '../components/PostEditor';
import PostCard from '../components/PostCard';
import { motion } from 'motion/react';
import { TrendingUp, Clock, Award, Users, MessageSquare, Bell, Search as SearchIcon, Globe, Calendar, ChevronRight, DollarSign, FileText, Zap, Heart, MapPin, Layers, Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../lib/utils';
import { toast } from 'react-hot-toast';
import MessagesView from '../components/MessagesView';
import NotificationsView from '../components/NotificationsView';
import CommunityList from '../components/CommunityList';
import CommunityView from '../components/CommunityView';
import Sidebar from '../components/Sidebar';
import CommunityDetailsModal from '../components/CommunityDetailsModal';
import SidebarCreatorItem from '../components/SidebarCreatorItem';
import { feedService } from '../services/feedService';
import { useQuery } from '@tanstack/react-query';
import SocialLeftSidebar from '../components/SocialLeftSidebar';
import SocialRightSidebar from '../components/SocialRightSidebar';

export default function SocialFeed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<any[]>([]);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [feedType, setFeedType] = useState<'foryou' | 'following' | 'trending' | 'messages' | 'notifications' | 'search' | 'communities' | 'community'>('foryou');
  const [rankedPosts, setRankedPosts] = useState<any[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);



  // Feed Query
  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ['feed', feedType, auth.currentUser?.uid, searchParams.toString()],
    queryFn: async () => {
      if (feedType === 'foryou') {
        return feedService.getPersonalizedFeed(auth.currentUser?.uid || 'anonymous');
      }
      if (feedType === 'trending') {
        return feedService.getTrendingFeed();
      }
      return null;
    },
    enabled: ['foryou', 'trending'].includes(feedType),
  });

  useEffect(() => {
    if (feedData) {
      setRankedPosts(feedData);
    }
  }, [feedData]);

  const [joinedCommunityIds, setJoinedCommunityIds] = useState<Set<string>>(new Set());
  const [isJoinedLoaded, setIsJoinedLoaded] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [activeInviteCode, setActiveInviteCode] = useState<string | null>(null);

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Fetch joined community IDs - Real-time is still good for membership
    let unsubscribeMembers = () => {};
    if (auth.currentUser) {
      setIsJoinedLoaded(false);
      setJoinedCommunityIds(new Set());
      const qMembers = query(
        collectionGroup(db, 'members'),
        where('userId', '==', auth.currentUser.uid)
      );
      unsubscribeMembers = onSnapshot(qMembers, (snapshot) => {
        const ids = new Set(snapshot.docs.map(d => d.ref.parent.parent!.id));
        setJoinedCommunityIds(ids);
        setIsJoinedLoaded(true);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'members');
        setIsJoinedLoaded(true);
      });
    } else {
      setIsJoinedLoaded(true);
    }

    return () => {
      unsubscribeMembers();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    const inviteCode = searchParams.get('invite');
    if (inviteCode && isJoinedLoaded) { 
      const handleInvite = async () => {
        setCheckingInvite(true);
        setActiveInviteCode(inviteCode);
        try {
          const q = query(collection(db, 'communityInvites'), where('code', '==', inviteCode));
          const snap = await getDocs(q);
          
          if (!snap.empty) {
            const inviteData = snap.docs[0].data();
            const cid = inviteData.communityId;
            
            // Check if user is already a member
            if (auth.currentUser && joinedCommunityIds.has(cid)) {
              // Direct to community
              setSearchParams(prev => {
                const p = new URLSearchParams(prev);
                p.set('view', 'community');
                p.set('id', cid);
                p.delete('invite');
                return p;
              }, { replace: true });
            } else {
              // Show details modal
              setSelectedCommunityId(cid);
              // Clean up the invite from URL to prevent re-triggering if they close modal
              setSearchParams(prev => {
                const p = new URLSearchParams(prev);
                p.delete('invite');
                return p;
              }, { replace: true });
            }
          } else {
            toast.error("Invalid or expired invite link");
            setSearchParams(prev => {
              const p = new URLSearchParams(prev);
              p.delete('invite');
              return p;
            }, { replace: true });
          }
        } catch (err) {
          console.error("Invite check failed:", err);
        } finally {
          setCheckingInvite(false);
        }
      };
      
      handleInvite();
    }
  }, [searchParams, joinedCommunityIds, auth.currentUser, isJoinedLoaded]);

  const handleCommunityClick = (communityId: string) => {
    if (joinedCommunityIds.has(communityId)) {
      setSearchParams({ view: 'community', id: communityId });
    } else {
      setSelectedCommunityId(communityId);
    }
  };

  useEffect(() => {
    const view = searchParams.get('view');
    const search = searchParams.get('search');
    const hashtag = searchParams.get('hashtag');
    const postId = searchParams.get('postId');
    const communityId = searchParams.get('id');

    if (view === 'messages') {
      setFeedType('messages');
    } else if (view === 'notifications') {
      setFeedType('notifications');
    } else if (view === 'communities') {
      setFeedType('communities');
    } else if (view === 'community' && communityId) {
      setFeedType('community');
    } else if (view === 'trending') {
      setFeedType('trending');
    } else if (view === 'following') {
      setFeedType('following');
    } else if (view === 'foryou') {
      setFeedType('foryou');
    } else if (search || hashtag) {
      setFeedType('search');
    } else {
      setFeedType('foryou');
    }
  }, [searchParams]);

  useEffect(() => {
    if (['messages', 'notifications', 'communities', 'community'].includes(feedType)) return;
    
    let unsub: any = null;
    
    const fetchFeed = async () => {
      setLoading(true);
      try {
        if (feedType === 'foryou') {
          const items = await feedService.getPersonalizedFeed(auth.currentUser?.uid || 'anonymous');
          setRankedPosts(items);
          setLoading(false);
          return;
        }

        if (feedType === 'trending') {
          const items = await feedService.getTrendingFeed();
          setRankedPosts(items);
          setLoading(false);
          return;
        }
        
        // Fallback to basic Firestore query for search/following etc
        setRankedPosts([]);
        setPosts([]);
        setLastVisible(null);
        setHasMore(true);

        const postsRef = collection(db, 'posts');
        const search = searchParams.get('search');
        const hashtag = searchParams.get('hashtag');

        let q;
        if (search || hashtag) {
          q = query(postsRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(15));
        } else if (feedType === 'following') {
           // In real app, query based on followed ids. For preview, just show newest.
           q = query(postsRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(10));
        } else {
           q = query(postsRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(10));
        }

        unsub = onSnapshot(q, (snapshot) => {
          if (snapshot.empty) {
            setPosts([]);
            setHasMore(false);
            setLoading(false);
            return;
          }

          let fetchedPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          
          if (hashtag) {
            const tag = hashtag.toLowerCase().replace('#', '');
            fetchedPosts = fetchedPosts.filter((post: any) => 
              post.hashtags && post.hashtags.some((h: string) => h.toLowerCase().replace('#', '') === tag)
            );
          }

          setPosts(fetchedPosts);
          setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length >= 10);
          setLoading(false);
        }, (error) => {
          if (error.code !== 'permission-denied') {
            handleFirestoreError(error, OperationType.LIST, 'posts');
          }
          setLoading(false);
        });
      } catch (error) {
        console.error("Feed error:", error);
        toast.error("Failed to load feed");
        setLoading(false);
      }
    };

    fetchFeed();
    return () => {
      if (unsub) unsub();
    };
  }, [feedType, searchParams, auth.currentUser]);

  const fetchMorePosts = async () => {
    if (!lastVisible || !hasMore || loadingMore) return;
    
    setLoadingMore(true);
    const postsRef = collection(db, 'posts');
    const search = searchParams.get('search');
    const hashtag = searchParams.get('hashtag');

    let q;
    if (search || hashtag) {
       q = query(postsRef, where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(15));
    } else {
       q = feedType === 'following' 
        ? query(postsRef, where('visibility', '==', 'public'), where('communityId', '==', null), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(10))
        : query(postsRef, where('visibility', '==', 'public'), where('communityId', '==', null), orderBy('likesCount', 'desc'), startAfter(lastVisible), limit(10));
    }

    try {
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setHasMore(false);
        return;
      }

      let fetchedPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      // Filter logic
      if (hashtag) {
        const tag = hashtag.toLowerCase().replace('#', '');
        fetchedPosts = fetchedPosts.filter((post: any) => 
          post.hashtags && post.hashtags.some((h: string) => h.toLowerCase().replace('#', '') === tag)
        );
      } else if (search) {
        const queryStr = search.toLowerCase();
        fetchedPosts = fetchedPosts.filter((post: any) => 
          post.content.toLowerCase().includes(queryStr) || 
          post.authorName.toLowerCase().includes(queryStr)
        );
      }

      setPosts(prev => [...prev, ...fetchedPosts]);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length >= 10);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'posts');
    } finally {
      setLoadingMore(false);
    }
  };

  const lastPostElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchMorePosts();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore, lastVisible, feedType]);

  if (feedType === 'communities') {
    return <CommunityList />;
  }

  return (
    <div className={`w-full ${(feedType === 'messages' || feedType === 'community') ? 'max-w-full px-0 pb-0 h-full overflow-hidden' : 'max-w-[1500px] px-4 pb-8'} mx-auto text-black dark:text-white relative`}>
      <div className={`flex flex-col lg:flex-row ${(feedType === 'messages' || feedType === 'community') ? 'gap-0 h-full items-stretch overflow-hidden' : 'gap-4 items-start'} justify-center`}>
        {/* Left Sidebar - Stats/Trends/Communities */}
        {((feedType !== 'messages' && feedType !== 'notifications' && feedType !== 'community') || searchParams.get('postId')) && (
          <SocialLeftSidebar />
        )}

        {/* Main Feed Content */}
          <main className={`w-full ${feedType === 'messages' || feedType === 'community' ? 'pt-0 h-full overflow-hidden' : 'pt-4'} order-2 flex-1 ${(feedType === 'messages' || feedType === 'community' || feedType === 'notifications') ? 'max-w-full' : 'max-w-[640px]'}`}>
          {feedType === 'search' && (
            <div className="bg-transparent border-b border-black/10 dark:border-white/10 p-6">
              <h2 className="text-xl font-black flex items-center gap-2 text-black dark:text-white uppercase tracking-tight">
                <SearchIcon className="text-primary" size={24} /> 
                {searchParams.get('hashtag') 
                  ? `Tag: ${searchParams.get('hashtag')}`
                  : `Search: ${searchParams.get('search')}`
                }
              </h2>
            </div>
          )}

          {feedType === 'messages' ? (
            <div className="w-full max-w-full mx-auto h-full">
              <MessagesView />
            </div>
          ) : feedType === 'notifications' ? (
            <div className="w-full mx-auto">
              <NotificationsView />
            </div>
          ) : feedType === 'community' ? (
            <CommunityView communityId={searchParams.get('id') || ''} />
          ) : (
            <div className="space-y-0">
               {/* Feed Selector Tabs */}
               <div className="flex items-center gap-6 px-6 py-4 border-b border-black/10 dark:border-white/10 overflow-x-auto no-scrollbar bg-white/50 dark:bg-black/50 backdrop-blur-sm sticky top-0 z-20">
                {[
                  { id: 'foryou', label: 'For You', icon: Globe },
                  { id: 'following', label: 'Following', icon: Users },
                  { id: 'trending', label: 'Trending', icon: TrendingUp },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSearchParams({ view: tab.id })}
                    className={`flex items-center gap-2 pb-2 border-b-2 transition-all whitespace-nowrap ${
                      feedType === tab.id 
                        ? 'border-primary text-black dark:text-white font-black' 
                        : 'border-transparent text-black/40 dark:text-white/40 font-bold hover:text-black dark:hover:text-white'
                    }`}
                  >
                    <tab.icon size={14} />
                    <span className="text-[11px] uppercase tracking-[0.2em]">{tab.label}</span>
                  </button>
                ))}
              </div>

              {feedType === 'foryou' && auth.currentUser && (
                <div className="bg-primary/5 px-6 py-3 border-b border-primary/10 flex items-center justify-between">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Personalized Feed Active</p>
                  <div className="flex gap-1">
                    <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                    <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1 h-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              )}

              {['foryou', 'following', 'trending'].includes(feedType) && !searchParams.get('search') && (
                auth.currentUser ? (
                  <PostEditor 
                    quotedPostId={searchParams.get('quote')} 
                    onCancelQuote={() => {
                      setSearchParams(prev => {
                        const p = new URLSearchParams(prev);
                        p.delete('quote');
                        return p;
                      });
                    }}
                    onPostCreated={() => {
                      setSearchParams(prev => {
                        const p = new URLSearchParams(prev);
                        p.delete('quote');
                        return p;
                      });
                    }}
                  />
                ) : (
                  <div className="bg-transparent p-10 border-b border-black/10 dark:border-white/10 text-center space-y-6">
                    <div className="w-20 h-20 bg-primary/10 flex items-center justify-center mx-auto border border-primary/20">
                      <MessageSquare size={40} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-black dark:text-white uppercase">Join the Conversation</h3>
                      <p className="text-sm text-black/50 dark:text-white/50 mt-2 max-w-sm mx-auto">Sign in to share your thoughts, projects, and connect with other creators.</p>
                    </div>
                    <Link 
                      to="/login" 
                      state={{ from: { pathname: '/feed' } }}
                      className="inline-block bg-black dark:bg-white text-white dark:text-black font-black px-10 py-4 transition-all text-xs uppercase tracking-[0.2em] border border-transparent hover:bg-primary dark:hover:bg-primary hover:text-white"
                    >
                      Sign In to Post
                    </Link>
                  </div>
                )
              )}
              
              {/* Trending Section Featured in Feed */}
              {feedType === 'foryou' && (
                <div className="bg-transparent p-6 overflow-hidden relative group border-b border-black/10 dark:border-white/10">
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center rounded-2xl shadow-lg shadow-purple-500/20">
                        <TrendingUp size={24} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-black dark:text-white uppercase tracking-widest">Trending Now</h3>
                        <p className="text-[10px] text-black/50 dark:text-white/50">Explore community buzz</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSearchParams({ view: 'trending' })}
                      className="text-[10px] font-black text-white uppercase tracking-widest bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-5 py-2.5 rounded-full transition-all duration-300 shadow-md shadow-purple-500/15 hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      Explore
                    </button>
                  </div>
                </div>
              )}

              {(loading || feedLoading) ? (
                <div className="flex justify-center py-20">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-fuchsia-500 p-0.5 animate-spin">
                    <div className="w-full h-full bg-background rounded-full" />
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                      {/* Ranked Posts */}
                      {(feedType === 'foryou' || feedType === 'trending') && rankedPosts.map((item) => (
                        <div key={`${item.type}-${item.id}`}>
                          {item.reason && (
                            <div className="px-6 pt-4 flex items-center gap-1.5">
                               <Zap size={10} className="text-primary/70" />
                               <span className="text-[11px] font-medium text-black/40 dark:text-white/40 tracking-tight">{item.reason}</span>
                            </div>
                          )}
                          <PostCard post={item.data} isDetailView={false} />
                        </div>
                      ))}

                  {/* Regular Posts (new/following/search) */}
                  {['new', 'following', 'search'].includes(feedType) && posts.map((post, index) => (
                    <div key={post.id} ref={index === posts.length - 1 ? lastPostElementRef : null}>
                      <PostCard post={post} isDetailView={false} />
                    </div>
                  ))}
                  
                  {loadingMore && (
                    <div className="flex justify-center py-12 border-t border-black/10 dark:border-white/10">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-fuchsia-500 p-0.5 animate-spin">
                        <div className="w-full h-full bg-background rounded-full" />
                      </div>
                    </div>
                  )}

                  {!hasMore && posts.length > 0 && (
                    <div className="text-center py-12 text-black/20 dark:text-white/20 text-[10px] font-black uppercase tracking-widest border-t border-black/10 dark:border-white/10">
                      End of Feed
                    </div>
                  )}

                  {posts.length === 0 && !loading && (
                    <div className="text-center py-32 bg-transparent border-b border-black/10 dark:border-white/10">
                      <p className="text-black/30 dark:text-white/30 font-black uppercase tracking-widest text-xs">
                        {searchParams.get('hashtag') || searchParams.get('search') ? 'No results found' : 'No posts yet'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar - Events and Articles */}
        {((feedType !== 'messages' && feedType !== 'notifications' && feedType !== 'community') || searchParams.get('postId')) && (
          <SocialRightSidebar />
        )}
      </div>
      <CommunityDetailsModal 
        isOpen={!!selectedCommunityId} 
        onClose={() => {
          setSelectedCommunityId(null);
          setActiveInviteCode(null);
        }} 
        communityId={selectedCommunityId || ''}
        inviteCode={activeInviteCode || undefined}
        onJoinSuccess={() => {
          if (selectedCommunityId) {
            setSearchParams({ view: 'community', id: selectedCommunityId });
            setSelectedCommunityId(null);
            setActiveInviteCode(null);
          }
        }}
      />
    </div>
  );
}
