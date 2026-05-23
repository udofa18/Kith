import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ChevronLeft, Calendar, Trophy, Users, Zap, Clock, DollarSign, 
  MapPin, MessageSquare, Bookmark, MoreVertical, CheckCircle2, 
  ExternalLink, Code, Layers, PenTool, Layout, Trash2, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, onSnapshot, addDoc, serverTimestamp, setDoc, deleteDoc, query, where, increment, updateDoc } from 'firebase/firestore';

export default function ChallengeDetails() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const [loading, setLoading] = useState(true);
  const [dbChallenge, setDbChallenge] = useState<any>(null);
  
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('Calculating...');

  // Submission State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [submitLink, setSubmitLink] = useState('');
  const [submitTweet, setSubmitTweet] = useState('');
  const [submitNotes, setSubmitNotes] = useState('');
  const [submitAnswers, setSubmitAnswers] = useState<Record<string, string>>({});
  const [submitKyc, setSubmitKyc] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (!dbChallenge?.deadlines?.submissionEnd) {
      if (dbChallenge && !dbChallenge.deadlines?.submissionEnd) {
         setTimeLeft('Unknown');
      }
      return;
    }

    const interval = setInterval(() => {
      const difference = dbChallenge.deadlines.submissionEnd - Date.now();
      
      if (difference <= 0) {
        setTimeLeft('Ended');
        clearInterval(interval);
      } else {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        
        setTimeLeft(parts.join(' '));
      }
    }, 1000);

    // Run once immediately
    const difference = dbChallenge.deadlines.submissionEnd - Date.now();
    if (difference <= 0) {
      setTimeLeft('Ended');
    } else {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        setTimeLeft(parts.join(' '));
    }

    return () => clearInterval(interval);
  }, [dbChallenge]);

  useEffect(() => {
    if (!challengeId) return;

    const fetchChallenge = async () => {
      try {
        const docRef = doc(db, 'challenges', challengeId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setDbChallenge({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (e) {
        console.error("Error fetching challenge", e);
      } finally {
        setLoading(false);
      }
    };

    fetchChallenge();

    // Listen to comments
    const commentsRef = collection(db, 'challenges', challengeId, 'comments');
    const unsubscribeComments = onSnapshot(commentsRef, (snapshot) => {
      const comms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setComments(comms);
    });

    // Check bookmark
    let unsubscribeBookmark = () => {};
    if (auth.currentUser) {
      const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', challengeId);
      unsubscribeBookmark = onSnapshot(bookmarkRef, (doc) => {
        setIsBookmarked(doc.exists());
      });
    }

    // Check if current user submitted
    let unsubscribeSubmissions = () => {};
    if (auth.currentUser) {
      const q = query(collection(db, 'challenges', challengeId, 'submissions'), where('userUid', '==', auth.currentUser.uid));
      unsubscribeSubmissions = onSnapshot(q, (snap) => {
        setHasSubmitted(!snap.empty);
      });
    }

    return () => {
      unsubscribeComments();
      unsubscribeBookmark();
      unsubscribeSubmissions();
    };
  }, [challengeId, auth.currentUser]);

  const toggleBookmark = async () => {
    if (!auth.currentUser || !challengeId) return;
    const bookmarkRef = doc(db, 'users', auth.currentUser.uid, 'bookmarks', challengeId);
    if (isBookmarked) {
      await deleteDoc(bookmarkRef);
    } else {
      await setDoc(bookmarkRef, { challengeId, savedAt: serverTimestamp() });
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      toast.error('Sign in to post comments');
      return;
    }
    if (!newComment.trim() || !challengeId) return;

    try {
      await addDoc(collection(db, 'challenges', challengeId, 'comments'), {
        text: newComment,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous Partner',
        userPhoto: auth.currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser.uid}`,
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (e) {
      console.error("Error posting comment", e);
    }
  };

  const handleDeleteChallenge = async () => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'challenges', challengeId!));
      window.location.href = '/challenges';
    } catch (e) {
      console.error("Failed to delete", e);
      toast.error("Failed to delete challenge.");
      setIsDeleting(false);
    }
  };

  const handleSubmitSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      toast.error('Sign in to submit your work');
      return;
    }
    if (!challengeId) return;

    if (!submitLink.trim()) {
      toast.error("Submission link is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'challenges', challengeId, 'submissions'), {
        userUid: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous User',
        userPhoto: auth.currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser.uid}`,
        submissionLink: submitLink,
        tweetLink: submitTweet,
        notes: submitNotes,
        customAnswers: submitAnswers,
        kycAcknowledged: submitKyc,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'challenges', challengeId), {
        participantCount: increment(1)
      });
      
      // Refresh or close modal
      setShowSubmitModal(false);
      setSubmitLink('');
      setSubmitTweet('');
      setSubmitNotes('');
      setSubmitAnswers({});
      setSubmitKyc(false);
      toast.success("Submission successful!");
    } catch (err) {
      console.error("Failed to submit", err);
      toast.error("Failed to submit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Map database entity to UI format
  const challenge = dbChallenge ? {
    id: dbChallenge.id,
    creatorId: dbChallenge.creatorId,
    title: dbChallenge.title || 'Untitled Challenge',
    creator: { 
      name: dbChallenge.creatorName || 'Anonymous Partner', 
      avatar: (dbChallenge.image && dbChallenge.image.trim() !== '') ? dbChallenge.image : `https://api.dicebear.com/7.x/identicon/svg?seed=${dbChallenge.id}`,
      isVerified: dbChallenge.isVerified || false
    },
    meta: {
      type: dbChallenge.type === 'build' ? 'Bounty' : dbChallenge.type === 'content' ? 'Bounty' : 'Challenge',
      status: dbChallenge.status === 'active' ? 'Submissions Open' : 'Closed',
      region: dbChallenge.regionRestriction || 'Global',
      commentsCount: comments.length,
      participantCount: dbChallenge.participantCount || 0
    },
    rewardPool: { 
      totalAmount: dbChallenge.rewardPool?.cashAmount?.toLocaleString() || '1,500', 
      currency: dbChallenge.rewardPool?.currency || 'USDC',
      breakdown: dbChallenge.rewardPool?.breakdown || [
        { place: '1st', amount: '800' },
        { place: '2nd', amount: '500' },
      ]
    },
    stats: {
      submissions: dbChallenge.participantCount || dbChallenge.submissionCount || 0,
      timeRemaining: timeLeft
    },
    regionalRestriction: `This listing is restricted to: ${dbChallenge.regionRestriction || 'Global'}`,
    skillsNeeded: dbChallenge.skillsNeeded || ['Content'],
    contact: dbChallenge.contactLink || 'Reach out if you have any questions',
    winnerAnnouncement: dbChallenge.winnerAnnouncementDate ? new Date(dbChallenge.winnerAnnouncementDate).toLocaleDateString() : 'TBD',
    relatedListings: [],
    overview: dbChallenge.overview || dbChallenge.description || 'No overview provided.',
    objectives: dbChallenge.objectives || [],
    requirements: dbChallenge.requirements || [],
    customQuestions: dbChallenge.customQuestions || []
  } : null;

  if (!challenge) {
    return <div className="text-center py-20 text-foreground/50">Challenge not found.</div>;
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-10 text-foreground">
      <Link to="/challenges" className="flex items-center gap-2 text-foreground/50 hover:text-foreground mb-6 transition-colors w-fit text-sm font-medium">
        <ChevronLeft size={16} /> Back to Challenges
      </Link>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-12">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex-shrink-0 flex items-center justify-center overflow-hidden border border-foreground/10 shadow-lg">
            <img src={challenge.creator.avatar} alt="Logo" className="w-full h-full object-cover mix-blend-overlay opacity-50" />
            <Layers className="absolute text-white" size={32} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-2">{challenge.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/60">
              <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                by {challenge.creator.name}
                {challenge.creator.isVerified && <CheckCircle2 size={14} className="text-blue-400" />}
              </span>
              <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
              <span className="flex items-center gap-1 text-yellow-500 font-medium tracking-wide text-xs uppercase">
                <Zap size={14} className="fill-yellow-500/20" /> {challenge.meta.type}
              </span>
              <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
              <span className="flex items-center gap-1.5 text-green-500 font-medium">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                {challenge.meta.status}
              </span>
              <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
              <span className="flex items-center gap-1 font-medium bg-foreground/5 px-2 py-0.5 rounded-md border border-foreground/5">
                <MapPin size={12} /> {challenge.meta.region}
              </span>
              <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
              <span className="flex items-center gap-1">
                <MessageSquare size={14} /> {challenge.meta.commentsCount}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-foreground/10 pt-4 md:border-0 md:pt-0">
          <div className="flex items-center gap-3 mr-4">
            <span className="font-bold text-lg">{challenge.meta.participantCount}</span>
            <div className="flex -space-x-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-background border-2 border-background overflow-hidden">
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}xpend`} alt="participant" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
          </div>
          <button 
            onClick={toggleBookmark}
            className={`flex items-center gap-2 px-4 py-2 border border-foreground/10 rounded-xl transition-all text-sm font-medium ${isBookmarked ? 'bg-primary text-primary-foreground' : 'bg-foreground/5 hover:bg-foreground/10'}`}
          >
            <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} /> 
            {isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className={`p-2 border rounded-xl transition-all ${showOptionsMenu ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 hover:bg-foreground/10 border-foreground/10'}`}
            >
              <MoreVertical size={16} />
            </button>
            
            {/* Dropdown Menu */}
            <AnimatePresence>
              {showOptionsMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowOptionsMenu(false)}
                  ></div>
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-background border border-foreground/10 rounded-xl shadow-2xl z-20 overflow-hidden"
                  >
                    <div className="p-1 flex flex-col">
                      <button 
                        onClick={() => {
                          setShowOptionsMenu(false);
                          navigator.clipboard.writeText(window.location.href);
                          toast.success('Link copied to clipboard!');
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-foreground/5 text-sm font-medium flex items-center gap-2.5 text-foreground/80 transition-colors"
                      >
                        <Share2 size={14} /> Share
                      </button>

                      {auth.currentUser?.uid === challenge.creatorId && (
                        <div className="mt-1 pt-1 border-t border-foreground/10">
                          <Link 
                            to={`/edit-challenge/${challenge.id}`}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-foreground/5 text-sm font-medium flex items-center gap-2.5 text-blue-500 transition-colors"
                          >
                            <PenTool size={14} /> Edit Challenge
                          </Link>
                          <Link 
                            to={`/challenges/${challenge.id}/submissions`}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-foreground/5 text-sm font-medium flex items-center gap-2.5 text-green-500 transition-colors"
                          >
                            <Users size={14} /> View Submissions
                          </Link>
                          <button 
                            onClick={() => {
                              setShowOptionsMenu(false);
                              setShowDeleteConfirm(true);
                            }}
                            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-red-500/10 text-sm font-medium flex items-center gap-2.5 text-red-500 transition-colors mt-0.5"
                          >
                            <Trash2 size={14} /> Delete Challenge
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start text-foreground">
        
        {/* Left Column (Sidebar/Meta) */}
        <div className="lg:col-span-4 space-y-8 order-2 lg:order-1">
          {/* Prizes Section */}
          <div>
            <div className="text-lg font-bold border-b border-foreground/10 pb-3 mb-5">Prizes</div>
            <div className="mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center border border-green-500/20 dark:border-green-500/30">
                <div className="w-4 h-4 rounded-full border-2 border-green-500/50 flex flex-col items-center justify-center">
                  <div className="w-1 h-3 border-r-2 border-b-2 border-green-500 dark:border-green-400 rotate-45 -mt-1 -ml-0.5"></div>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-foreground">{challenge.rewardPool.totalAmount}</span>
                <span className="text-lg font-bold text-foreground/50">{challenge.rewardPool.currency}</span>
                <span className="text-sm font-medium text-foreground/40 ml-1">Total Prizes</span>
              </div>
            </div>
            
            <div className="ml-5 border-l-2 border-foreground/10 pl-6 space-y-5 relative">
              {challenge.rewardPool.breakdown.map((prize, idx) => (
                <div key={idx} className="flex items-baseline gap-2 relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-[31px] top-2 w-3 h-3 rounded-full bg-foreground/20 border-2 border-background"></div>
                  <span className="text-xl font-bold text-foreground">{prize.amount}</span>
                  <span className="text-sm font-bold text-foreground/50">{challenge.rewardPool.currency}</span>
                  <span className="text-xs font-semibold text-foreground/40 ml-2">{prize.place}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats & Action */}
          <div className="bg-transparent border border-foreground/10 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-foreground/90 font-bold text-lg">
                  <Layout size={18} className="text-foreground/50" /> {challenge.stats.submissions}
                </div>
                <div className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Submissions</div>
              </div>
              <div className="w-px h-10 bg-foreground/10"></div>
              <div className="flex flex-col gap-1 text-right">
                <div className="flex items-center gap-1.5 text-foreground/90 font-bold text-lg justify-end">
                  <Clock size={16} className="text-foreground/50"/> {challenge.stats.timeRemaining}
                </div>
                <div className="text-xs text-foreground/40 uppercase tracking-widest font-bold">Remaining</div>
              </div>
            </div>

            {hasSubmitted ? (
              <button 
                disabled
                className="w-full bg-foreground/10 text-foreground/50 font-black text-base px-6 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <CheckCircle2 size={18} /> Submitted
              </button>
            ) : (
              <button 
                onClick={() => {
                  if (!auth.currentUser) {
                    toast.error('Sign in to submit your work');
                    return;
                  }
                  setShowSubmitModal(true);
                }}
                className="w-full bg-primary text-primary-foreground font-black text-base px-6 py-3.5 rounded-xl transition-all hover:bg-primary/90 hover:scale-[1.02] shadow-[0_0_20px_rgba(0,242,255,0.2)]"
              >
                Submit Now
              </button>
            )}
            <p className="text-center text-xs text-foreground/30 italic">* Costs 1 credit to submit</p>
          </div>

          <div className="space-y-6 pt-4 border-t border-foreground/10">
            {/* Meta Items */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-foreground/40 uppercase tracking-widest">Regional Listing</div>
              <div className="text-sm text-foreground/80">{challenge.regionalRestriction}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-foreground/40 uppercase tracking-widest">Skills Needed</div>
              <div className="flex gap-2">
                {challenge.skillsNeeded.map((skill, idx) => (
                  <span key={idx} className="px-3 py-1 bg-transparent border border-foreground/10 rounded-lg text-xs font-medium text-foreground/70">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-foreground/40 uppercase tracking-widest">Contact</div>
              <div className="text-sm text-foreground/80 flex items-start gap-1">
                Reach out <Link to="#" className="inline-flex mt-0.5"><ExternalLink size={14} className="text-foreground/40 hover:text-foreground transition-colors" /></Link> if you have any questions about this listing
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-foreground/40 uppercase tracking-widest">Winner Announcement By</div>
              <div className="text-sm text-foreground/80">{challenge.winnerAnnouncement}</div>
            </div>
          </div>

          {/* Commenting out 'Related Live Listings' for now as it's static dummy data entirely, 
              but updating its shell for cleanliness. */}
          <div className="pt-6 border-t border-foreground/10">
            <div className="text-xs font-bold text-foreground/40 uppercase tracking-widest mb-4">Related Live Listings</div>
            <div className="flex flex-col gap-3">
              {challenge.relatedListings.map((listing, idx) => (
                <div key={idx} className="p-3 bg-transparent border border-foreground/5 rounded-xl hover:bg-foreground/5 transition-colors flex gap-3 cursor-pointer">
                  <div className="w-10 h-10 rounded-lg bg-foreground/10 overflow-hidden shrink-0 border border-foreground/10">
                    <img 
                      src={(listing.logo && listing.logo.trim() !== '') ? listing.logo : `https://api.dicebear.com/7.x/identicon/svg?seed=${listing.creator}`} 
                      alt={listing.creator} 
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="text-sm font-bold text-foreground/90 truncate">{listing.title}</div>
                    <div className="text-xs text-foreground/50">{listing.creator}</div>
                    <div className="flex items-center gap-2 text-xs font-medium mt-1">
                      <span className="flex items-center gap-1 text-green-500 dark:text-green-400"><DollarSign size={10}/> {listing.prize}</span>
                      <span className="w-1 h-1 rounded-full bg-foreground/20"></span>
                      <span className="flex items-center gap-1 text-yellow-500 dark:text-yellow-400/80"><Zap size={10}/> Due in {listing.dueIn}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column (Main Content) */}
        <div className="lg:col-span-8 order-1 lg:order-2">
          <div className="text-lg font-bold border-b border-foreground/10 pb-3 mb-6">Details</div>
          
          <div className="prose dark:prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary">
            <h3 className="text-xl mb-4">Overview</h3>
            {challenge.overview.split('\n\n').map((para, idx) => (
              <p key={idx} className="text-foreground/70 leading-relaxed text-base mb-4">{para}</p>
            ))}

            <h3 className="text-xl mt-10 mb-4 border-t border-foreground/5 pt-8">Bounty Objective</h3>
            <p className="text-foreground/70 leading-relaxed text-base mb-4">Produce high-quality written content that:</p>
            <ul className="space-y-2 mb-8 text-foreground/70 text-base list-disc pl-5">
              {challenge.objectives.map((obj, idx) => (
                <li key={idx} className="pl-1 leading-relaxed marker:text-foreground/30">{obj}</li>
              ))}
            </ul>

            <h3 className="text-xl mt-10 mb-4 border-t border-foreground/5 pt-8">Requirements</h3>
            <ul className="space-y-4 text-foreground/70 text-base list-disc pl-5">
              {challenge.requirements.map((req, idx) => (
                <li key={idx} className="pl-1 leading-relaxed marker:text-foreground/30">
                  {req.title && <strong className="text-foreground">{req.title}:</strong>} {req.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Comments Section */}
          <div className="mt-16 border-t border-foreground/10 pt-10">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <MessageSquare size={20} className="text-foreground/50" /> Comments
            </h3>

            {auth.currentUser ? (
              <form onSubmit={handlePostComment} className="mb-8 relative">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full border border-foreground/10 overflow-hidden shrink-0 bg-background">
                    <img 
                      src={(auth.currentUser.photoURL && auth.currentUser.photoURL.trim() !== '') ? auth.currentUser.photoURL : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser.uid}`} 
                      alt="You" 
                    />
                  </div>
                  <div className="flex-1 bg-transparent border border-foreground/10 rounded-2xl p-2 relative transition-all focus-within:border-primary/50 focus-within:bg-foreground/5">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Ask a question or share a thought..."
                      className="w-full bg-transparent outline-none p-2 text-foreground/80 resize-none min-h-[60px] text-sm"
                    />
                    <div className="flex justify-end pr-2 pb-1">
                      <button 
                        type="submit" 
                        disabled={!newComment.trim()}
                        className="bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        Post Comment
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              <div className="mb-8 p-4 bg-transparent border border-foreground/10 rounded-xl text-center text-sm text-foreground/50">
                Log in to join the discussion.
              </div>
            )}

            <div className="space-y-6">
              {comments.length === 0 ? (
                <div className="text-foreground/40 text-center py-6 text-sm">No comments yet. Be the first!</div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full border border-foreground/10 overflow-hidden shrink-0 bg-background">
                      <img 
                        src={(comment.userPhoto && comment.userPhoto.trim() !== '') ? comment.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.userId}`} 
                        alt={comment.userName} 
                      />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-bold text-sm text-foreground/90">{comment.userName}</span>
                        <span className="text-xs text-foreground/40">
                          {(() => {
                            if (!comment.createdAt) return 'Just now';
                            try {
                              const d = comment.createdAt.toDate ? comment.createdAt.toDate() : new Date(comment.createdAt);
                              if (!(d instanceof Date) || isNaN(d.getTime())) return 'Just now';
                              return formatDistanceToNow(d, { addSuffix: true });
                            } catch (e) {
                              return 'Just now';
                            }
                          })()}
                        </span>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">{comment.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Submission Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSubmitModal(false)}></div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-2xl bg-background border border-foreground/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-foreground/5">
              <div>
                <h3 className="text-xl font-bold text-foreground mb-1">Submit Challenge Entry</h3>
                <p className="text-sm text-foreground/50">
                  Ready to present your work?
                  <br />
                  Note: You may update your entry details until the submission deadline.
                </p>
              </div>
              <button 
                onClick={() => setShowSubmitModal(false)}
                className="p-2 bg-foreground/5 hover:bg-foreground/10 rounded-xl transition-colors shrink-0 self-start text-foreground/60"
              >
                ×
              </button>
            </div>

            {/* Content Form */}
            <div className="overflow-y-auto p-6 space-y-6 flex-1 text-foreground">
              {/* Submission Link */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground/90">
                  Primary Submission URL <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-foreground/50">Ensure this link is public so the judges can access it seamlessly.</p>
                <div className="flex items-stretch mt-2 border border-foreground/10 rounded-xl overflow-hidden focus-within:border-primary transition-colors">
                  <div className="bg-foreground/5 px-4 flex items-center border-r border-foreground/10 text-foreground/50 text-sm font-medium">
                    https://
                  </div>
                  <input 
                    type="text" 
                    value={submitLink}
                    onChange={(e) => setSubmitLink(e.target.value)}
                    placeholder="Add a link"
                    className="flex-1 bg-transparent px-4 py-3 outline-none text-foreground text-sm"
                  />
                </div>
              </div>

              {/* Tweet Link */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground/90">Social Share Link (e.g., X/Twitter)</label>
                <p className="text-xs text-foreground/50">Help the challenge creator discover and promote your entry. (Optional)</p>
                <div className="flex items-stretch mt-2 border border-foreground/10 rounded-xl overflow-hidden focus-within:border-primary transition-colors">
                  <div className="bg-foreground/5 px-4 flex items-center border-r border-foreground/10 text-foreground/50 text-sm font-medium">
                    https://
                  </div>
                  <input 
                    type="text" 
                    value={submitTweet}
                    onChange={(e) => setSubmitTweet(e.target.value)}
                    placeholder="Add a link to your post"
                    className="flex-1 bg-transparent px-4 py-3 outline-none text-foreground text-sm"
                  />
                </div>
              </div>

              {/* Extra Logic / Notes */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground/90">Additional Context</label>
                <p className="text-xs text-foreground/50">Provide any supplementary documentation, repository links, or specific notes for the reviewers.</p>
                <textarea 
                  value={submitNotes}
                  onChange={(e) => setSubmitNotes(e.target.value)}
                  placeholder="Share any other context here..."
                  className="w-full bg-transparent border border-foreground/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-foreground text-sm h-24 resize-y"
                />
              </div>

              {/* Custom Questions mapping */}
              {challenge.customQuestions && challenge.customQuestions.length > 0 && (
                <div className="space-y-6 pt-4 border-t border-foreground/5">
                  {challenge.customQuestions.map((q: string, idx: number) => (
                    <div key={idx} className="space-y-2">
                      <label className="text-sm font-bold text-foreground/90">{q} <span className="text-red-500">*</span></label>
                      <input 
                        type="text" 
                        required
                        value={submitAnswers[q] || ''}
                        onChange={(e) => setSubmitAnswers({...submitAnswers, [q]: e.target.value})}
                        placeholder="Your answer..."
                        className="w-full bg-transparent border border-foreground/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-foreground text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-foreground/5 bg-foreground/[0.02]">
              <label className="flex items-start gap-4 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input 
                    type="checkbox" 
                    className="sr-only" 
                    checked={submitKyc}
                    onChange={(e) => setSubmitKyc(e.target.checked)}
                  />
                  <div className={`w-5 h-5 border rounded-md flex items-center justify-center transition-colors ${submitKyc ? 'bg-primary border-primary' : 'border-foreground/20 group-hover:border-foreground/40'}`}>
                    {submitKyc && <CheckCircle2 size={14} className="text-primary-foreground" />}
                  </div>
                </div>
                <span className="text-sm text-foreground/80 leading-relaxed font-medium">
                  I acknowledge that if I win, I will have to complete KYC verification that proves I am from <span className="text-foreground font-bold">{challenge.meta.region}</span>
                </span>
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <button 
                  onClick={() => setShowSubmitModal(false)}
                  className="px-6 py-2.5 rounded-xl border border-foreground/10 text-foreground/70 hover:bg-foreground/5 transition-colors text-sm font-bold"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmitSubmission}
                  disabled={!submitKyc || isSubmitting || !submitLink.trim()}
                  className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-primary-foreground/50 border-t-primary-foreground rounded-full animate-spin"/> : null}
                  Submit Entry
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Global Confirm Dialog for Deletions */}
      <ConfirmDialog 
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteChallenge}
        isLoading={isDeleting}
        title="Delete Challenge"
        message="Are you sure you want to permanently delete this challenge? This action cannot be undone and will erase all data."
        confirmText="Delete Challenge"
      />
    </div>
  );
}
