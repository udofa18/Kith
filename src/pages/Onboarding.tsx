import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, storage, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, limit, getDocs, addDoc, where, updateDoc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Check, 
  ChevronRight, 
  Rocket, 
  User as UserIcon, 
  Zap, 
  Compass, 
  Code, 
  Target, 
  Users, 
  Image as ImageIcon,
  ArrowRight,
  ArrowLeft,
  Search,
  Plus,
  Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import VerifiedBadge from '../components/VerifiedBadge';

const STEPS = [
  { id: 'account_type', title: 'Account Type' },
  { id: 'intent', title: 'Intent' },
  { id: 'interests', title: 'Interests' },
  { id: 'skills', title: 'Skills' },
  { id: 'profile', title: 'Profile' },
  { id: 'recommendations', title: 'For You' },
  { id: 'action', title: 'First Action' }
];

const INTENTS = [
  { id: 'build', label: 'Build projects', icon: Code, description: 'Showcase and sell your components' },
  { id: 'discover', label: 'Discover assets', icon: Search, description: 'Find premium UI/UX components' },
  { id: 'hire', label: 'Hire talent', icon: Users, description: 'Find experts for your next project' },
  { id: 'learn', label: 'Learn & Grow', icon: Zap, description: 'Improve your skills with the community' },
  { id: 'network', label: 'Collaborate', icon: Target, description: 'Connect with other high-end creators' }
];

const INTEREST_CATEGORIES: Record<string, string[]> = {
  'frontend': ['React', 'Next.js', 'Tailwind CSS', 'Framer Motion', 'Vue', 'SolidJS'],
  'backend': ['Node.js', 'Python', 'Go', 'PostgreSQL', 'Redis', 'GraphQL'],
  'design': ['UI Design', 'UX Research', 'Figma', '3D / Spline', 'Typography'],
  'emerging': ['AI/ML', 'Web3', 'Blockchain', 'AR/VR', 'Edge Computing'],
  'lifestyle': ['Productivity', 'Digital Nomad', 'Fitness', 'Minimalism', 'Personal Finance', 'Gaming', 'Self-improvement', 'Reading'],
  'creativity': ['Photography', 'Videography', 'Writing', 'Content Creation', 'Art']
};

const INTERESTS = Object.keys(INTEREST_CATEGORIES).map(k => k.charAt(0).toUpperCase() + k.slice(1));

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<any>({
    accountType: '',
    intent: [],
    interests: [],
    skills: [],
    username: '',
    bio: '',
    githubUrl: '',
    profileImage: ''
  });
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any>({
    users: [],
    communities: []
  });
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [joinedCommunities, setJoinedCommunities] = useState<Set<string>>(new Set());
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [isUploading, setIsUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      setFormData((prev: any) => ({ ...prev, profileImage: url }));
      toast.success('Avatar uploaded successfully!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload avatar');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (auth.currentUser) {
      setFormData((prev: any) => ({
        ...prev,
        username: auth.currentUser?.displayName?.toLowerCase().replace(/\s/g, '') || '',
        profileImage: auth.currentUser?.photoURL || ''
      }));
    }
  }, []);

  // Fetch recommendations in Step 5
  useEffect(() => {
    if (currentStep === 5) {
      const fetchRecs = async () => {
        try {
          // Hardcoded samples for now, typically these would be filtered by interests
          const usersSnap = await getDocs(query(collection(db, 'users'), limit(3)));
          const commsSnap = await getDocs(query(collection(db, 'communities'), limit(3)));
          
          setRecommendations({
            users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            communities: commsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          });
        } catch (e) {
          console.error(e);
        }
      };
      fetchRecs();
    }
  }, [currentStep]);

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const handleComplete = async (targetPath: string | React.MouseEvent = '/feed') => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userDoc = await getDoc(userRef);
      const existingData = userDoc.exists() ? userDoc.data() : {};
      
      await setDoc(userRef, {
        ...existingData,
        ...formData,
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || auth.currentUser.providerData?.[0]?.email || existingData.email || null,
        onboardingCompleted: true,
        onboardingStep: currentStep,
        xp: (existingData.xp || 0) + 250,
        totalSales: existingData.totalSales || 0,
        totalImpressions: existingData.totalImpressions || 0,
        dailyGiftingRemaining: existingData.dailyGiftingRemaining ?? 20,
        lastGiftingReset: existingData.lastGiftingReset || serverTimestamp(),
        createdAt: existingData.createdAt || serverTimestamp(),
      }, { merge: true });
      
      const finalPath = typeof targetPath === 'string' ? targetPath : '/feed';
      navigate(finalPath);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleMulti = (field: string, value: string) => {
    setFormData((prev: any) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v: string) => v !== value)
        : [...prev[field], value]
    }));
  };

  const handleFollow = async (targetId: string) => {
    if (!auth.currentUser || auth.currentUser.uid === targetId) return;
    const isFollowing = followedUsers.has(targetId);
    
    try {
      const myFollowRef = doc(db, 'users', auth.currentUser.uid, 'following', targetId);
      const theirFollowerRef = doc(db, 'users', targetId, 'followers', auth.currentUser.uid);
      
      const { deleteDoc } = await import('firebase/firestore');
      
      if (isFollowing) {
        await deleteDoc(myFollowRef);
        await deleteDoc(theirFollowerRef);
        setFollowedUsers(prev => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      } else {
        await setDoc(myFollowRef, { createdAt: new Date().toISOString() });
        await setDoc(theirFollowerRef, { createdAt: new Date().toISOString() });
        setFollowedUsers(prev => new Set(prev).add(targetId));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleJoin = async (communityId: string) => {
    if (!auth.currentUser || !communityId) return;
    const isJoined = joinedCommunities.has(communityId);
    
    try {
      const memberRef = doc(db, 'communities', communityId, 'members', auth.currentUser.uid);
      const { deleteDoc, updateDoc, increment } = await import('firebase/firestore');
      const communityRef = doc(db, 'communities', communityId);

      if (isJoined) {
        await deleteDoc(memberRef);
        await updateDoc(communityRef, { memberCount: increment(-1) });
        setJoinedCommunities(prev => {
          const next = new Set(prev);
          next.delete(communityId);
          return next;
        });
      } else {
        await setDoc(memberRef, {
          userId: auth.currentUser.uid,
          role: 'member',
          joinedAt: serverTimestamp(),
        });
        await updateDoc(communityRef, { memberCount: increment(1) });
        setJoinedCommunities(prev => new Set(prev).add(communityId));

        // Send join notification
        try {
          const commSnap = await getDoc(communityRef);
          if (commSnap.exists()) {
            const community = commSnap.data();
            const welcomeConfig = community.welcomeConfig;
            
            if (welcomeConfig?.enabled) {
              const targetChannelId = welcomeConfig.channelId;
              if (targetChannelId) {
                const messagesRef = collection(db, 'communities', communityId, 'channels', targetChannelId, 'messages');
                let welcomeText = welcomeConfig.message || `{username} joined {community}!`;
                welcomeText = welcomeText
                  .replace(/\{username\}/g, `${auth.currentUser.displayName || 'A new user'}`)
                  .replace(/\{community\}/g, community.name || 'the community');

                await addDoc(messagesRef, {
                  content: welcomeText,
                  authorUid: 'system-bot',
                  authorName: 'System Bot',
                  authorPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=system-bot',
                  createdAt: serverTimestamp(),
                  type: 'welcome',
                  isBot: true,
                  buttons: welcomeConfig.buttons || []
                });
              }
            } else {
              const channelsRef = collection(db, 'communities', communityId, 'channels');
              const q = query(channelsRef, where('name', '==', 'general'), limit(1));
              const channelSnap = await getDocs(q);
              if (!channelSnap.empty) {
                const generalChannel = channelSnap.docs[0];
                const messagesRef = collection(db, 'communities', communityId, 'channels', generalChannel.id, 'messages');
                const welcomeText = `${auth.currentUser.displayName || 'A new user'} just joined the community!`;

                await addDoc(messagesRef, {
                  content: welcomeText,
                  authorUid: 'system-bot',
                  authorName: 'System Bot',
                  authorPhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=system-bot',
                  createdAt: serverTimestamp(),
                  type: 'welcome',
                  isBot: true
                });
              }
            }
          }
        } catch (err) {
          console.error("Failed to send onboarding welcome:", err);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-primary/30 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-xl w-full relative z-10">
        {/* Progress Header */}
        <div className="mb-12">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-1">Step {currentStep + 1} of {STEPS.length}</p>
              <h1 className="text-xl font-bold">{STEPS[currentStep].title}</h1>
            </div>
            <div className="text-right">
              <span className="text-sm font-mono text-primary">{Math.round(progress)}%</span>
            </div>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-primary shadow-[0_0_15px_rgba(0,242,255,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "circOut" }}
            />
          </div>
        </div>

        <div className="glass rounded-[32px] p-8 md:p-10 relative overflow-hidden border border-white/10">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              {/* Step 0: Account Type */}
              {currentStep === 0 && (
                <div className="space-y-6">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-2">Welcome to the platform!</h2>
                    <p className="text-white/40">To help us tailor your experience, are you joining as an individual or representing a brand/company?</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={() => setFormData({ ...formData, accountType: 'personal' })}
                      className={`flex items-center gap-4 p-6 rounded-2xl border transition-all text-left ${formData.accountType === 'personal' ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(0,242,255,0.1)]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${formData.accountType === 'personal' ? 'bg-primary text-black' : 'bg-white/5 text-white/40 group-hover:text-white'}`}>
                        <UserIcon size={24} />
                      </div>
                      <div>
                        <p className={`font-bold ${formData.accountType === 'personal' ? 'text-primary' : 'text-white'}`}>Personal Account</p>
                        <p className="text-sm text-white/40">I'm here to build, discover, or collaborate as an individual.</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setFormData({ ...formData, accountType: 'brand' })}
                      className={`flex items-center gap-4 p-6 rounded-2xl border transition-all text-left ${formData.accountType === 'brand' ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(0,242,255,0.1)]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${formData.accountType === 'brand' ? 'bg-primary text-black' : 'bg-white/5 text-white/40 group-hover:text-white'}`}>
                        <Target size={24} />
                      </div>
                      <div>
                        <p className={`font-bold ${formData.accountType === 'brand' ? 'text-primary' : 'text-white'}`}>Brand / Company</p>
                        <p className="text-sm text-white/40">I'm here on behalf of an organization to source talent or host challenges.</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1: Intent */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-2">How will you participate?</h2>
                    <p className="text-white/40">Select one or more goals to personalize your experience.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {INTENTS.map(intent => {
                      const isSelected = formData.intent.includes(intent.id);
                      return (
                        <button
                          key={intent.id}
                          onClick={() => toggleMulti('intent', intent.id)}
                          className={`flex items-center gap-4 p-5 rounded-2xl border transition-all text-left group ${
                            isSelected ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(0,242,255,0.1)]' : 'bg-white/5 border-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            isSelected ? 'bg-primary text-black' : 'bg-white/5 text-white/40 group-hover:text-white'
                          }`}>
                            <intent.icon size={24} />
                          </div>
                          <div className="flex-1">
                            <p className={`font-bold ${isSelected ? 'text-primary' : 'text-white'}`}>{intent.label}</p>
                            <p className="text-sm text-white/40">{intent.description}</p>
                          </div>
                          {isSelected && <Check className="text-primary" size={20} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 2: Interests */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-2">What sparks your curiosity?</h2>
                    <p className="text-white/40">Choose categories you want to see in your feed.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {INTERESTS.map(interest => {
                      const isSelected = formData.interests.includes(interest.toLowerCase());
                      return (
                        <button
                          key={interest}
                          onClick={() => toggleMulti('interests', interest.toLowerCase())}
                          className={`px-8 py-4 rounded-2xl border font-bold transition-all ${
                            isSelected ? 'bg-primary border-primary text-black' : 'bg-white/5 border-white/5 text-white/50 hover:border-white/20'
                          }`}
                        >
                          {interest}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: Skills (Conditional) */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold mb-2">Refine your stack</h2>
                    <p className="text-white/40">Select specific tools and technologies based on your interests.</p>
                  </div>
                  <div className="space-y-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {formData.interests.map((cat: string) => (
                      <div key={cat} className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-primary/50">{cat}</h3>
                        <div className="flex flex-wrap gap-2">
                          {INTEREST_CATEGORIES[cat]?.map(skill => {
                            const isSelected = formData.skills.includes(skill);
                            return (
                              <button
                                key={skill}
                                onClick={() => toggleMulti('skills', skill)}
                                className={`px-4 py-2 rounded-xl text-sm border font-medium transition-all ${
                                  isSelected ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/10'
                                }`}
                              >
                                {skill}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {formData.interests.length === 0 && (
                      <div className="text-center py-12 text-white/30 italic">
                        No categories selected. Go back to choose interests or skip this step.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Profile Setup */}
              {currentStep === 4 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="relative inline-block group mb-6">
                      <div className="w-24 h-24 rounded-full bg-white/10 overflow-hidden border-2 border-white/5 group-hover:border-primary transition-all">
                        <img 
                          src={(formData.profileImage && formData.profileImage.trim() !== '') ? formData.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${auth.currentUser?.uid}`} 
                          alt="Avatar"
                          referrerPolicy="no-referrer"
                          className={isUploading ? 'opacity-30' : ''}
                        />
                        {isUploading && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 size={24} className="animate-spin text-primary" />
                          </div>
                        )}
                      </div>
                      <input 
                        type="file"
                        ref={avatarInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                      />
                      <button 
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isUploading}
                        className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full border-4 border-[#121212] flex items-center justify-center text-black hover:scale-110 transition-transform disabled:opacity-50"
                      >
                        <ImageIcon size={14} />
                      </button>
                    </div>
                    <h2 className="text-2xl font-bold">You're almost there</h2>
                    <p className="text-white/40">Let the community know who you are.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-white/30 ml-1">Username (Required)</label>
                      <input 
                        type="text"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none transition-all placeholder:text-white/10 text-lg"
                        placeholder="pixel_architect"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-white/30 ml-1">Your Bio (Optional)</label>
                      <textarea 
                        value={formData.bio}
                        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                        className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none transition-all placeholder:text-white/10 h-28 resize-none"
                        placeholder="Crafting high-end UI/UX experiences..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Recommendations */}
              {currentStep === 5 && (
                <div className="space-y-8">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2">Build your network</h2>
                    <p className="text-white/40">Based on your interests, we think you'll like these.</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-primary/50 mb-4 ml-1">Top Creators</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {recommendations.users.map((user: any) => (
                          <div key={user.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden border border-white/10">
                                <img src={(user.profileImage && user.profileImage.trim() !== '') ? user.profileImage : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="" referrerPolicy="no-referrer" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-sm truncate flex items-center gap-1">
                                  <span>{user.displayName || user.username}</span>
                                  <VerifiedBadge verified={user.verified} />
                                </p>
                                <p className="text-xs text-white/40 truncate">@{user.username}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleFollow(user.id)}
                              className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${
                                followedUsers.has(user.id)
                                  ? 'bg-white/10 text-white hover:bg-white/20'
                                  : 'bg-primary/10 text-primary hover:bg-primary hover:text-black'
                              }`}
                            >
                              {followedUsers.has(user.id) ? 'Following' : 'Follow'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-4 ml-1">Trending Communities</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {recommendations.communities.map((comm: any) => (
                          <div key={comm.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-white/10 overflow-hidden border border-white/10">
                                <img src={(comm.image && comm.image.trim() !== '') ? comm.image : `https://picsum.photos/seed/${comm.id}/100/100`} alt="" referrerPolicy="no-referrer" />
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="font-bold text-sm truncate">{comm.name}</p>
                                <p className="text-xs text-white/40 truncate">{comm.memberCount || 0} members</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleJoin(comm.id)}
                              className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all ${
                                joinedCommunities.has(comm.id)
                                  ? 'border-white/20 bg-white/10 text-white'
                                  : 'border-white/10 text-white hover:bg-white hover:text-black'
                              }`}
                            >
                              {joinedCommunities.has(comm.id) ? 'Joined' : 'Join'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 6: First Action */}
              {currentStep === 6 && (
                <div className="space-y-12 py-6 text-center">
                  <div className="space-y-4">
                    <div className="w-20 h-20 bg-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <Rocket className="text-primary animate-pulse" size={40} />
                    </div>
                    <h2 className="text-3xl font-bold">You're ready to launch</h2>
                    <p className="text-white/40 max-w-[300px] mx-auto">Your professional identity is set. What's your first move?</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => handleComplete('/feed')}
                      className="group flex items-center justify-between p-6 rounded-[24px] bg-primary text-black font-bold transition-transform hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className="w-12 h-12 rounded-xl bg-black/10 flex items-center justify-center">
                          <Compass size={24} />
                        </div>
                        <div>
                          <p className="text-lg">Explore the Feed</p>
                          <p className="text-sm opacity-60">See what creators are building</p>
                        </div>
                      </div>
                      <ArrowRight size={24} />
                    </button>

                    <button 
                      onClick={() => handleComplete('/feed?action=new-post')}
                      className="group flex items-center justify-between p-6 rounded-[24px] bg-white text-black font-bold transition-transform hover:scale-[1.02]"
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className="w-12 h-12 rounded-xl bg-black/10 flex items-center justify-center">
                          <Plus size={24} />
                        </div>
                        <div>
                          <p className="text-lg">Share your work</p>
                          <p className="text-sm opacity-60">Make your first post</p>
                        </div>
                      </div>
                      <ArrowRight size={24} />
                    </button>
                  </div>

                  <button 
                    onClick={handleComplete}
                    className="text-sm font-bold text-white/30 hover:text-white transition-colors"
                  >
                    Take me to my dashboard
                  </button>
                </div>
              )}

              {/* Navigation Footer (except last step) */}
              {currentStep < 6 && (
                <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-between">
                  <button 
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="flex items-center gap-2 text-white/40 hover:text-white font-bold transition-all disabled:opacity-0 disabled:pointer-events-none"
                  >
                    <ArrowLeft size={18} /> Back
                  </button>
                  <div className="flex items-center gap-4">
                    {currentStep !== 0 && currentStep < 4 && (
                      <button onClick={nextStep} className="text-sm font-bold text-white/30 hover:text-white px-4">Skip</button>
                    )}
                    <button 
                      onClick={nextStep}
                      disabled={(currentStep === 0 && !formData.accountType) || (currentStep === 4 && !formData.username)}
                      className="px-10 py-4 bg-primary text-black rounded-2xl font-bold shadow-[0_0_20px_rgba(0,242,255,0.3)] flex items-center gap-2 hover:translate-x-1 transition-all disabled:opacity-50 disabled:translate-x-0"
                    >
                      {currentStep === 5 ? 'Almost Done' : 'Next Step'} <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
