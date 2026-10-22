import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, deleteDoc, setDoc, addDoc, serverTimestamp, increment, updateDoc, collectionGroup, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { followUser, unfollowUser } from '../services/socialService';
import { 
  Github, 
  Globe, 
  MapPin, 
  MessageSquare, 
  Share2, 
  Star, 
  TrendingUp, 
  Users, 
  Zap, 
  LayoutGrid, 
  FileText, 
  Settings, 
  Calendar, 
  Code2, 
  Heart, 
  X,
  ExternalLink,
  Award,
  Activity,
  Package,
  Twitter,
  Linkedin,
  Bookmark,
  ChevronRight,
  MoreHorizontal,
  Target,
  Bell,
  BellOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import axios from 'axios';
import ComponentSkeleton from '../components/ComponentSkeleton';
import ProductCard from '../components/ProductCard';
import PostCard from '../components/PostCard';
import VerifiedBadge from '../components/VerifiedBadge';
import EventCard from '../components/EventCard';
import CommunityCard from '../components/CommunityCard';
import ArticleCard from '../components/ArticleCard';
import { toast } from 'react-hot-toast';

interface GithubStats {
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  bio: string;
  blog: string;
}

type TabType = 'posts' | 'articles' | 'products' | 'events' | 'communities' | 'bookmarks' | 'activity';

export default function CreatorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMe = auth.currentUser?.uid === id;
  
  const [creator, setCreator] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('posts');

  const [isFollowing, setIsFollowing] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [githubStats, setGithubStats] = useState<GithubStats | null>(null);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    
    // Fetch user basic info
    const unsubscribeUser = onSnapshot(doc(db, 'users', id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCreator(data);
        
        // Fetch GitHub stats if URL exists
        if (data.githubUrl) {
          const username = data.githubUrl.split('/').pop();
          if (username) {
            axios.get(`https://api.github.com/users/${username}`)
              .then(res => setGithubStats(res.data))
              .catch(err => console.error("GitHub fetch error:", err));
          }
        }
      }
    });

    // Followers/Following
    const unsubscribeFollowers = onSnapshot(collection(db, 'users', id, 'followers'), snap => setFollowersCount(snap.size));
    const unsubscribeFollowing = onSnapshot(collection(db, 'users', id, 'following'), snap => setFollowingCount(snap.size));

    if (auth.currentUser) {
      const followRef = doc(db, 'users', auth.currentUser.uid, 'following', id);
      getDoc(followRef).then(doc => setIsFollowing(doc.exists()));

      const notifRef = doc(db, 'users', auth.currentUser.uid, 'notificationPrefs', id);
      getDoc(notifRef).then(doc => setNotificationsOn(doc.exists()));
    }

    // Products
    const qProducts = query(collection(db, 'products'), where('creatorUid', '==', id), orderBy('createdAt', 'desc'));
    const unsubscribeProducts = onSnapshot(qProducts, snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    // Posts
    const qPosts = query(collection(db, 'posts'), where('authorUid', '==', id), orderBy('createdAt', 'desc'));
    const unsubscribePosts = onSnapshot(qPosts, snap => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // Articles
    const qArticles = isMe 
      ? query(collection(db, 'articles'), where('authorUid', '==', id), orderBy('createdAt', 'desc'))
      : query(collection(db, 'articles'), where('authorUid', '==', id), where('status', '==', 'published'), orderBy('createdAt', 'desc'));
    const unsubscribeArticles = onSnapshot(qArticles, snap => {
      setArticles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Events (Hosted or Attending)
    const qEvents = query(collection(db, 'events'), where('hostId', '==', id));
    const unsubscribeEvents = onSnapshot(qEvents, snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    // Communities (Member of)
    const qMembers = query(collectionGroup(db, 'members'), where('userId', '==', id));
    const unsubscribeMembers = onSnapshot(qMembers, async (snap) => {
      const comms = await Promise.all(snap.docs.map(async d => {
        const cDoc = await getDoc(doc(db, 'communities', d.ref.parent.parent!.id));
        return cDoc.exists() ? { id: cDoc.id, ...cDoc.data(), userRole: d.data().role } : null;
      }));
      setCommunities(comms.filter(c => c !== null));
    });

    // Bookmarks (Only if isMe)
    let unsubscribeBookmarks = () => {};
    if (isMe) {
      // We have multiple bookmark sources possibly (articles and others)
      // For now let's combine or fetch from standard 'bookmarks' + 'bookmarkedArticles'
      // Or just fetch from both parallelly
      const qBookmarksGeneral = query(collection(db, 'users', id, 'bookmarks'), orderBy('bookmarkedAt', 'desc'));
      const qBookmarksArticles = query(collection(db, 'users', id, 'bookmarkedArticles'), orderBy('bookmarkedAt', 'desc'));
      
      const unsubGeneral = onSnapshot(qBookmarksGeneral, async (snap) => {
        const genBms = await Promise.all(snap.docs.map(async d => {
          let cDoc = await getDoc(doc(db, 'posts', d.id));
          if (cDoc.exists()) return { id: cDoc.id, ...cDoc.data(), bookmarkType: 'post' };
          cDoc = await getDoc(doc(db, 'products', d.id));
          if (cDoc.exists()) return { id: cDoc.id, ...cDoc.data(), bookmarkType: 'product' };
          return null;
        }));
        
        // Fetch articles too
        const artSnap = await getDocs(qBookmarksArticles);
        const artBms = await Promise.all(artSnap.docs.map(async d => {
           let cDoc = await getDoc(doc(db, 'articles', d.id));
           if (cDoc.exists()) return { id: cDoc.id, ...cDoc.data(), bookmarkType: 'article' };
           return null;
        }));

        setBookmarks([...genBms, ...artBms].filter(b => b !== null));
      });

      unsubscribeBookmarks = unsubGeneral;
    }

    // Fetch User Activities (Likes and Comments)
    setLoadingActivity(true);
    const qComments = query(collectionGroup(db, 'comments'), where('authorUid', '==', id));
    const unsubscribeComments = onSnapshot(qComments, async (commentSnap) => {
      const commentActivities = await Promise.all(commentSnap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const postId = docSnap.ref.parent.parent!.id;
        let postData: any = null;
        try {
          const postDoc = await getDoc(doc(db, 'posts', postId));
          if (postDoc.exists()) {
            postData = { id: postDoc.id, ...postDoc.data() };
          }
        } catch (e) {
          console.error("Error fetching post for comment activity:", e);
        }
        
        return {
          id: docSnap.id,
          type: 'comment',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
          content: data.content,
          post: postData,
          postId
        };
      }));

      setActivities(prev => {
        const nonComments = prev.filter(act => act.type !== 'comment');
        const merged = [...nonComments, ...commentActivities];
        return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoadingActivity(false);
    }, () => setLoadingActivity(false));

    const qLikes = query(collectionGroup(db, 'likes'), where('userId', '==', id));
    const unsubscribeLikes = onSnapshot(qLikes, async (likeSnap) => {
      const likeActivities = await Promise.all(likeSnap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const postId = data.postId || docSnap.ref.parent.parent?.id;
        if (!postId) return null;
        
        let postData: any = null;
        try {
          const postDoc = await getDoc(doc(db, 'posts', postId));
          if (postDoc.exists()) {
            postData = { id: postDoc.id, ...postDoc.data() };
          }
        } catch (e) {
          console.error("Error fetching post for like activity:", e);
        }

        return {
          id: docSnap.id,
          type: 'like',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
          post: postData,
          postId
        };
      }));

      const filteredLikes = likeActivities.filter((item): item is any => item !== null);

      setActivities(prev => {
        const nonLikes = prev.filter(act => act.type !== 'like');
        const merged = [...nonLikes, ...filteredLikes];
        return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
      setLoadingActivity(false);
    }, () => setLoadingActivity(false));

    return () => {
      unsubscribeUser();
      unsubscribeFollowers();
      unsubscribeFollowing();
      unsubscribeProducts();
      unsubscribePosts();
      unsubscribeEvents();
      unsubscribeMembers();
      unsubscribeBookmarks();
      unsubscribeComments();
      unsubscribeLikes();
    };
  }, [id, isMe]);

  const handleFollow = async () => {
    if (!auth.currentUser || auth.currentUser.uid === id) return;
    try {
      await (isFollowing ? unfollowUser : followUser)(auth.currentUser.uid, id!);
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error(error);
    }
  };

  const toggleNotifications = async () => {
    if (!auth.currentUser || !id) return;
    
    const notifRef = doc(db, 'users', auth.currentUser.uid, 'notificationPrefs', id);
    const authorSubRef = doc(db, 'users', id, 'subscribers', auth.currentUser.uid);
    
    try {
      if (notificationsOn) {
        await deleteDoc(notifRef);
        await deleteDoc(authorSubRef);
        toast.success(`Notifications turned off for ${creator?.displayName || creator?.username}`);
      } else {
        const subData = { 
          subscriberId: auth.currentUser.uid,
          subscriberName: auth.currentUser.displayName || 'Anonymous',
          createdAt: serverTimestamp() 
        };
        await setDoc(notifRef, { 
          authorId: id,
          authorName: creator?.displayName || creator?.username,
          enabled: true,
          createdAt: serverTimestamp() 
        });
        await setDoc(authorSubRef, subData);
        toast.success(`Notifications turned on for ${creator?.displayName || creator?.username}`);
      }
      setNotificationsOn(!notificationsOn);
    } catch (error) {
      toast.error('Failed to update notification settings');
      console.error(error);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin neon-glow" />
        <p className="text-white/30 font-mono text-sm tracking-widest animate-pulse">DECRYPTING_BIO_SIGNALS...</p>
      </div>
    </div>
  );

  if (!creator) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Identity Not Found</h2>
        <Link to="/explore" className="text-primary hover:underline">Return to Network</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black custom-scrollbar">
      {/* Header Section: Banner & Identity */}
      <div className="relative">
        {/* Banner Image */}
        <div className="h-64 md:h-80 w-full relative overflow-hidden">
          <img 
            src={(creator.bannerImage && creator.bannerImage.trim() !== '') ? creator.bannerImage : `https://picsum.photos/seed/${id}_banner/1920/600`} 
            alt="Banner" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/20 to-black" />
          
          {/* Top Actions */}
          <div className="absolute top-6 right-6 flex items-center gap-3">
            <button className="p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-white/70">
              <Share2 size={20} />
            </button>
            <button className="p-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-white/70">
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>

        {/* Profile Content Overlay */}
        <div className="max-w-7xl mx-auto px-6 relative -mt-20 md:-mt-24">
          <div className="flex flex-col md:flex-row items-end gap-6 md:gap-8">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <div className="w-32 h-32 md:w-44 md:h-44 rounded-[40px] border-[6px] border-black overflow-hidden shadow-2xl relative z-10 bg-black">
                <img 
                  src={(creator.profileImage && creator.profileImage.trim() !== '') ? creator.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`} 
                  alt={creator.username} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {creator.experienceLevel === 'Advanced' && (
                <div className="absolute -bottom-2 -right-2 bg-yellow-400 p-2.5 rounded-2xl shadow-xl z-20 border-4 border-black">
                  <Star size={20} fill="black" className="text-black" />
                </div>
              )}
            </div>

            {/* Basic Info */}
            <div className="flex-1 pb-2">
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <h1 className="text-3xl md:text-5xl font-black tracking-tight flex items-center gap-2">
                  <span>{creator.displayName || creator.username}</span>
                  <VerifiedBadge verified={creator.verified} size={30} className="text-teal-400 shrink-0" />
                </h1>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-xs font-bold tracking-widest uppercase">
                    LVL {Math.floor((creator.xp || 0) / 1000) + 1}
                  </span>
                  {creator.userType === 'creator' && (
                    <span className="px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg text-xs font-bold tracking-widest uppercase">
                      Pro Creator
                    </span>
                  )}
                  {creator.accountType === 'brand' && (
                    <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold tracking-widest uppercase flex items-center gap-1">
                      <Target size={12} /> Brand/Company
                    </span>
                  )}
                </div>
              </div>
              <p className="text-lg text-white/40 font-bold mb-1">@{creator.username}</p>
              <p className="text-lg text-white/50 font-medium mb-4 max-w-2xl">
                {creator.bio || "Building the future of software, one component at a time."}
              </p>
              
              <div className="flex flex-wrap items-center gap-6 text-sm text-white/40">
                {creator.location && (
                  <div className="flex items-center gap-2">
                    <MapPin size={16} /> {creator.location}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-yellow-400" /> {creator.xp || 0} XP
                </div>
                <div className="flex items-center gap-4 pt-1">
                  {creator.githubUrl && (
                    <a href={creator.githubUrl} target="_blank" rel="noopener" className="hover:text-primary transition-colors">
                      <Github size={18} />
                    </a>
                  )}
                  {creator.twitterUrl && (
                    <a href={creator.twitterUrl} target="_blank" rel="noopener" className="hover:text-primary transition-colors">
                      <Twitter size={18} />
                    </a>
                  )}
                  {creator.linkedinUrl && (
                    <a href={creator.linkedinUrl} target="_blank" rel="noopener" className="hover:text-primary transition-colors">
                      <Linkedin size={18} />
                    </a>
                  )}
                  {creator.websiteUrl && (
                    <a href={creator.websiteUrl} target="_blank" rel="noopener" className="hover:text-primary transition-colors">
                      <Globe size={18} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Action */}
            <div className="pb-4 w-full md:w-auto">
              {isMe ? (
                <Link 
                  to="/settings?tab=profile" 
                  className="w-full md:w-auto px-8 py-3.5 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-all shadow-xl"
                >
                  <Settings size={20} /> Edit Profile
                </Link>
              ) : (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleFollow}
                    className={`flex-1 md:flex-none px-8 py-3.5 rounded-2xl font-bold transition-all shadow-xl ${
                      isFollowing 
                        ? 'bg-white/10 text-white hover:bg-white/20' 
                        : 'bg-primary text-black neon-glow'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button 
                    onClick={toggleNotifications}
                    className={`p-3.5 rounded-2xl transition-all border shadow-xl ${
                      notificationsOn 
                        ? 'bg-primary/20 text-primary border-primary/30' 
                        : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
                    }`}
                    title={notificationsOn ? "Turn off notifications" : "Turn on notifications"}
                  >
                    {notificationsOn ? <Bell size={20} fill="currentColor" /> : <BellOff size={20} />}
                  </button>
                  <button 
                    onClick={() => navigate(`/feed?view=messages&userId=${id}`)}
                    className="p-3.5 glass rounded-2xl hover:bg-white/10 transition-all text-white border border-white/10 shadow-xl"
                  >
                    <MessageSquare size={20} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar Section */}
      <div className="max-w-7xl mx-auto px-6 mt-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Posts', value: posts.length, icon: <FileText size={18} className="text-blue-400" /> },
            { label: 'Followers', value: followersCount, icon: <Users size={18} className="text-purple-400" /> },
            { label: 'Following', value: followingCount, icon: <Users size={18} className="text-pink-400" /> },
            { label: 'Reputation', value: creator.xp || 0, icon: <Award size={18} className="text-yellow-400" /> },
            { label: 'Sold', value: creator.totalSales || 0, icon: <Package size={18} className="text-green-400" /> }
          ].map((stat, i) => (
            <div key={i} className="glass rounded-[28px] p-5 border border-white/5 flex items-center gap-5 hover:border-white/20 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform">
                {stat.icon}
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-black truncate">{stat.value}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Tabs & Lists */}
      <div className="max-w-7xl mx-auto px-6 mt-12 mb-24 min-h-[60vh]">
        {/* Tab System */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-white/5 mb-10">
          {[
            { id: 'posts', label: 'Posts', icon: <FileText size={18} /> },
            { id: 'articles', label: 'Articles', icon: <Code2 size={18} /> },
            { id: 'products', label: 'Products', icon: <LayoutGrid size={18} /> },
            { id: 'events', label: 'Events', icon: <Calendar size={18} /> },
            { id: 'communities', label: 'Communities', icon: <Users size={18} /> },
            { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark size={18} />, hidden: !isMe },
            { id: 'activity', label: 'Activity', icon: <Activity size={18} /> }
          ].filter(t => !t.hidden).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2.5 px-6 py-4 text-sm font-bold transition-all relative border-b-2 ${
                activeTab === tab.id ? 'text-primary border-primary' : 'text-white/40 border-transparent hover:text-white hover:border-white/20'
              }`}
            >
              {tab.icon} {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="tabActive" className="absolute inset-0 bg-primary/5 -z-10" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'posts' && (
              <div className="space-y-4 max-w-2xl">
                {posts.length > 0 ? (
                  posts.map(post => <PostCard key={post.id} post={post} compact />)
                ) : (
                  <EmptyState icon={<FileText />} title="No_Recent_Activity" />
                )}
              </div>
            )}

            {activeTab === 'articles' && (
              <div className="space-y-6 max-w-3xl">
                {articles.length > 0 ? (
                  articles.map(article => <ArticleCard key={article.id} article={article} isOwner={isMe} />)
                ) : (
                  <EmptyState icon={<Code2 />} title="No_Articles_Published" />
                )}
              </div>
            )}

            {activeTab === 'products' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {products.length > 0 ? (
                  products.map(comp => <ProductCard key={comp.id} product={comp} />)
                ) : (
                  <div className="col-span-full">
                    <EmptyState icon={<Package />} title="No_Published_Products" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'events' && (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {events.length > 0 ? (
                  events.map(event => <EventCard key={event.id} event={event} compact />)
                ) : (
                  <div className="col-span-full">
                    <EmptyState icon={<Calendar />} title="No_Hosted_Events" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'communities' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {communities.length > 0 ? (
                  communities.map(comm => (
                    <div key={comm.id} className="relative group">
                      <CommunityCard 
                        community={comm} 
                        onClick={() => navigate(`/feed?view=communities&id=${comm.id}`)} 
                      />
                      <div className="absolute top-4 left-4 z-20 pointer-events-none">
                        <span className="px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[9px] font-bold text-primary border border-primary/20 uppercase tracking-widest">
                          {comm.userRole}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full">
                    <EmptyState icon={<Users />} title="No_Joined_Communities" />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'bookmarks' && (
              <div className="space-y-6 max-w-3xl">
                {bookmarks.length > 0 ? (
                  bookmarks.map(item => (
                    <div key={item.id} className="relative">
                      {item.bookmarkType === 'article' ? (
                        <ArticleCard article={item} />
                      ) : item.bookmarkType === 'post' ? (
                        <PostCard post={item} />
                      ) : (
                        <ProductCard product={item} />
                      )}
                      <div className="absolute -top-3 -right-3 z-30">
                        <div className="bg-primary p-2 rounded-xl border-4 border-black shadow-xl">
                          <Bookmark size={14} fill="currentColor" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={<Bookmark />} title="Cleared_Archives" />
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="space-y-6 max-w-2xl">
                {loadingActivity ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-10 h-10 border-t-2 border-primary rounded-full animate-spin mb-4" />
                    <span className="text-white/40 text-sm font-mono tracking-wider">RETRIEVING_USER_TRAILS...</span>
                  </div>
                ) : activities.length > 0 ? (
                  <div className="relative border-l border-white/5 pl-6 ml-4 space-y-8 py-2">
                    {activities.map((item) => (
                      <div key={item.id} className="relative group">
                        {/* Timeline Bullet */}
                        <div className="absolute -left-[35px] top-1.5 w-4 h-4 rounded-full bg-black border-2 border-white/20 group-hover:border-primary transition-all flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/40 group-hover:bg-primary transition-all" />
                        </div>
                        
                        <div className="space-y-3">
                          {/* Activity Header */}
                          <div className="flex items-center gap-3 text-xs text-white/50">
                            <span className={`inline-flex items-center justify-center p-1.5 rounded-lg ${
                              item.type === 'like' 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/10' 
                                : 'bg-purple-500/10 text-purple-400 border border-purple-500/10'
                            }`}>
                              {item.type === 'like' ? <Heart size={12} fill="currentColor" /> : <MessageSquare size={12} />}
                            </span>
                            <span className="font-medium text-white/70">
                              {item.type === 'like' ? 'Liked a post' : 'Commented on a post'}
                            </span>
                            <span className="text-white/30">•</span>
                            <span className="font-mono text-[10px] uppercase text-white/40">
                              {format(item.createdAt, 'MMM d, yyyy • h:mm a')}
                            </span>
                          </div>

                          {/* Comment Content (Only if comment) */}
                          {item.type === 'comment' && (
                            <div className="glass rounded-2xl p-4 border border-white/5 bg-white/[0.02] text-sm text-white/90 font-medium">
                              "{item.content}"
                            </div>
                          )}

                          {/* Post Card */}
                          {item.post ? (
                            <div className="pl-2 border-l-2 border-white/5 group-hover:border-white/10 transition-colors">
                              <PostCard post={item.post} compact />
                            </div>
                          ) : (
                            <div className="text-xs text-white/20 italic pl-3 border-l border-white/10">
                              This post has been deleted or is unavailable.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Activity />} title="No_Recent_Activity" />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyState({ icon, title }: { icon: any, title: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-20 glass rounded-[40px] border border-white/5 opacity-50">
      <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
        {icon}
      </div>
      <p className="text-sm font-mono tracking-[0.2em] uppercase">{title}</p>
    </div>
  );
}
