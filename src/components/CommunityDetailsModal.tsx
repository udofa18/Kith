import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment, collection, query, where, getDocs, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Calendar, Globe, Lock, Shield, Zap, UserPlus, UserMinus, Loader2, Plus } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { joinCommunity } from '../services/socialService';
import { CommunityIcon, communityHue } from './CommunityCard';
import { categoryLabel, categoryOf } from '../lib/communityCategories';
import { canAfford, feeOf, formatFee } from '../lib/communityPricing';

export default function CommunityDetailsModal({ isOpen, onClose, communityId, onJoinSuccess, inviteCode }: { 
  isOpen: boolean, 
  onClose: () => void, 
  communityId: string,
  onJoinSuccess?: () => void,
  inviteCode?: string
}) {
  const [community, setCommunity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState<any>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');

  useEffect(() => {
    if (isOpen && communityId) {
      const fetchDetails = async () => {
        setLoading(true);
        setCommunity(null);
        setIsMember(false);
        setCreatorProfile(null);
        setShowOnboarding(false);
        setAnswers({});
        setRequestStatus('none');
        
        try {
          const commDoc = await getDoc(doc(db, 'communities', communityId));
          if (commDoc.exists()) {
            const data = commDoc.data();
            setCommunity({ id: commDoc.id, ...data });
            
            // Fetch creator profile
            if (data.creatorId) {
              const creatorDoc = await getDoc(doc(db, 'users', data.creatorId));
              if (creatorDoc.exists()) {
                setCreatorProfile(creatorDoc.data());
              }
            }
          }
          
          if (auth.currentUser) {
            const memberDoc = await getDoc(doc(db, 'communities', communityId, 'members', auth.currentUser.uid));
            setIsMember(memberDoc.exists());

            // Check for pending request
            if (!memberDoc.exists()) {
                const requestsRef = collection(db, 'communities', communityId, 'joinRequests');
                const q = query(requestsRef, where('userId', '==', auth.currentUser.uid), limit(1));
                const requestSnap = await getDocs(q);
                if (!requestSnap.empty) {
                    setRequestStatus(requestSnap.docs[0].data().status as any);
                }
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchDetails();
    }
  }, [isOpen, communityId, auth.currentUser]);

  const handleJoin = async () => {
    if (!auth.currentUser) {
        toast.error("Please login to join communities", {
            icon: '🔐',
        });
        return;
    }

    if (!communityId) return;

    const control = community?.membershipControl;

    // Security Gates
    if (control?.memberVerificationRequired) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!userDoc.data()?.isVerified) {
            toast.error("Verification required to join this community");
            setJoining(false);
            return;
        }
    }

    if (control?.profileCompletionRequired) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const userData = userDoc.data();
        if (!userData?.bio || !userData?.photoURL) {
            toast.error("Complete your profile (Bio & Photo) to join");
            setJoining(false);
            return;
        }
    }

    const fee = feeOf(community);
    const isPrivateFlag = community?.isPrivate || (control?.accessType && control?.accessType !== 'public') || control?.approvalRequired;

    // Direct joins pay now, so check the balance first. Requests are charged on approval.
    if (fee && !isMember && !isPrivateFlag && community.creatorId !== auth.currentUser.uid) {
        if (!(await canAfford(auth.currentUser.uid, fee))) {
            toast.error(`You need ${formatFee(fee)} to join. Earn XP by posting and helping others.`);
            return;
        }
    }

    const hasOnboarding = control?.onboardingQuestions?.length > 0;

    if (isPrivateFlag || hasOnboarding) {
        if (!showOnboarding) {
            setShowOnboarding(true);
            return;
        }
    }

    const unanswered = (control?.onboardingQuestions || []).find((q: any) => q.required && !answers[q.id]?.trim());
    if (showOnboarding && unanswered) {
        toast.error(`Please answer: ${unanswered.question}`);
        return;
    }

    setJoining(true);
    try {
      if (isPrivateFlag) {
          // Submit join request
          const requestId = auth.currentUser.uid; // One request per user
          const requestRef = doc(db, 'communities', communityId, 'joinRequests', requestId);
          try {
            await setDoc(requestRef, {
                userId: auth.currentUser.uid,
                userName: auth.currentUser.displayName,
                userPhoto: auth.currentUser.photoURL,
                answers: answers,
                status: 'pending',
                createdAt: serverTimestamp()
            });
            setRequestStatus('pending');
            setShowOnboarding(false);

            // Send notification to admins
            try {
              // Fetch admins
              const membersRef = collection(db, 'communities', communityId, 'members');
              const adminsQuery = query(membersRef, where('role', 'in', ['owner', 'admin']));
              const adminsSnap = await getDocs(adminsQuery);
              
              const adminIds = adminsSnap.docs.map(doc => doc.id);
              
              // If no admins found via membership (maybe just owner/creator?), use creatorId
              if (adminIds.length === 0 && community.creatorId) {
                adminIds.push(community.creatorId);
              }

              // Create notification for each admin
              const notificationPromises = adminIds.map(adminId => {
                const notifRef = collection(db, 'notifications');
                return addDoc(notifRef, {
                  recipientId: adminId,
                  senderId: auth.currentUser?.uid,
                  senderName: auth.currentUser?.displayName || 'A user',
                  senderPhoto: auth.currentUser?.photoURL || '',
                  type: 'community',
                  category: 'community',
                  priority: 'normal',
                  content: `New join request for ${community.name} from ${auth.currentUser?.displayName || 'a user'}`,
                  relatedId: communityId,
                  read: false,
                  createdAt: serverTimestamp()
                });
              });
              
              await Promise.all(notificationPromises);
            } catch (notifErr) {
              console.error("Failed to send join request notifications:", notifErr);
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `communities/${communityId}/joinRequests/${requestId}`);
            throw err;
          }
      } else {
          try {
            await joinCommunity(auth.currentUser.uid, auth.currentUser.displayName, community, { onboardingAnswers: answers });
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `communities/${communityId}/members/${auth.currentUser.uid}`);
            throw err;
          }
          
          setIsMember(true);
    
          // Handle Invite Rewards & Statistics
          if (inviteCode && auth.currentUser) {
            try {
              const inviteQ = query(collection(db, 'communityInvites'), where('code', '==', inviteCode));
              const inviteSnap = await getDocs(inviteQ);
              if (!inviteSnap.empty) {
                const inviteDoc = inviteSnap.docs[0];
                const inviteData = inviteDoc.data();

                // Limits are enforced here: an expired, used-up or self-referred link is ignored.
                const expired = inviteData.expiresAt && new Date(inviteData.expiresAt).getTime() < Date.now();
                const usedUp = inviteData.maxUses > 0 && (inviteData.uses || 0) >= inviteData.maxUses;
                if (expired || usedUp || inviteData.creatorId === auth.currentUser.uid || inviteData.communityId !== communityId) {
                  if (onJoinSuccess) onJoinSuccess();
                  return;
                }
                inviteData.rewardXp = Math.min(Math.max(Number(inviteData.rewardXp) || 0, 0), 500);

                // Increment uses
                await updateDoc(inviteDoc.ref, {
                  uses: increment(1)
                });
                
                // Reward Referee (the joining user)
                if (inviteData.rewardXp > 0) {
                  await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                    xp: increment(inviteData.rewardXp)
                  });
                  toast.success(`Welcome Reward: +${inviteData.rewardXp} XP!`, { icon: '🎁' });
                }

                // Reward Referrer (the creator of the link)
                if (inviteData.creatorId && inviteData.rewardXp > 0) {
                  await updateDoc(doc(db, 'users', inviteData.creatorId), {
                    xp: increment(inviteData.rewardXp)
                  });
                  
                  // Notify referrer
                  await addDoc(collection(db, 'notifications'), {
                    recipientId: inviteData.creatorId,
                    senderId: auth.currentUser.uid,
                    senderName: auth.currentUser.displayName || 'A user',
                    senderPhoto: auth.currentUser.photoURL || '',
                    type: 'community',
                    category: 'reward',
                    priority: 'low',
                    content: `${auth.currentUser.displayName || 'Someone'} joined ${community.name} using your invite! +${inviteData.rewardXp} XP bonus.`,
                    relatedId: communityId,
                    read: false,
                    createdAt: serverTimestamp()
                  });
                }
              }
            } catch (inviteErr) {
              console.error("Failed to process invite rewards:", inviteErr);
            }
          }

          if (onJoinSuccess) onJoinSuccess();
      }
    } catch (error) {
      // Top level catch for unhandled errors within handleJoin
      console.error("Join operation failed:", error);
    } finally {
      setJoining(false);
    }
  };

  if (!isOpen) return null;

  const hue = community ? communityHue(community.id || community.name || 'x') : 0;
  const hasCover = !!community?.backdrop?.trim() && !community.backdrop.includes('picsum.photos');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-background text-black dark:text-white rounded-3xl w-full max-w-lg relative z-10 overflow-hidden shadow-2xl border border-foreground/10 max-h-[90vh] overflow-y-auto"
      >
        {loading ? (
          <div className="p-20 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : community ? (
          <>
            <div
              className="h-36 sm:h-44 relative"
              style={hasCover ? undefined : { background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 45) % 360} 65% 48%))` }}
            >
              {hasCover && <img src={community.backdrop} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
              <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-md" style={{ color: '#fff' }}>
                <X size={20} />
              </button>
            </div>

            <div className="px-6 sm:px-8 pb-6 sm:pb-8 -mt-10 relative z-10">
              <div className="flex flex-col items-start gap-3 mb-5">
                <CommunityIcon community={community} size={84} className="ring-4 ring-background shadow-xl" />
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold leading-tight">{community.name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-foreground/50 text-xs">
                    <span className="flex items-center gap-1"><Users size={12} /> {community.memberCount || 0} members</span>
                    {categoryOf(community) !== 'general' && <span>{categoryLabel(categoryOf(community))}</span>}
                    <span className="flex items-center gap-1">
                      {community.isPrivate ? <><Lock size={12} /> Private</> : <><Globe size={12} /> Public</>}
                    </span>
                    {inviteCode && (
                       <span className="flex items-center gap-1 text-primary font-black bg-primary/10 px-2 py-0.5 rounded uppercase tracking-widest text-[8px]">
                          <Zap size={10} className="fill-primary" /> Invite Active
                       </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {showOnboarding ? (
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-6 bg-primary/5 p-8 rounded-[2.5rem] border border-primary/20 shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-3 text-primary">
                                <Shield size={24} />
                                <h3 className="text-lg font-bold">A few questions first</h3>
                             </div>
                             <button onClick={() => setShowOnboarding(false)} className="text-[10px] uppercase font-black tracking-widest text-foreground/40 hover:text-foreground">Cancel</button>
                        </div>
                        
                        <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {(community.membershipControl.onboardingQuestions || []).map((q: any) => (
                                <div key={q.id} className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 pl-1">{q.question} {q.required && <span className="text-red-500">*</span>}</label>
                                    {q.type === 'multiple-choice' ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {(q.options || []).map((opt: string) => (
                                                <button 
                                                    key={opt}
                                                    onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                                                    className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${answers[q.id] === opt ? 'bg-primary border-primary text-white shadow-lg' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <textarea 
                                            value={answers[q.id] || ''}
                                            onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:border-primary transition-all resize-none min-h-[100px] placeholder:text-white/10"
                                            placeholder="Your answer"
                                        />
                                    )}
                                </div>
                            ))}

                            {feeOf(community) && !isMember && (
                              <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                                 <div className="flex items-center gap-3 text-amber-500">
                                   <Zap size={20} />
                                   <span className="text-sm font-semibold">Joining fee</span>
                                 </div>
                                 <p className="text-sm text-foreground/70">
                                   <span className="text-amber-500 font-semibold">{formatFee(feeOf(community)!)}</span>{' '}
                                   {(community.isPrivate || community.membershipControl?.approvalRequired || (community.membershipControl?.accessType && community.membershipControl.accessType !== 'public'))
                                     ? 'is charged only if your request is approved.'
                                     : 'is charged when you join.'}
                                 </p>
                              </div>
                            )}
                        </div>

                        <button
                            onClick={handleJoin}
                            disabled={joining}
                            className="w-full py-5 bg-primary text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                        >
                            {joining ? <Loader2 className="animate-spin" /> : <Shield size={18} />}
                            {(community.membershipControl.approvalRequired || community.isPrivate) ? 'Send request' : 'Join community'}
                        </button>
                    </motion.div>
                ) : (
                    <>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground/50 mb-1.5">About</h3>
                          <p className="text-foreground/80 text-sm leading-relaxed">
                            {community.description || "The creator hasn't added a description yet."}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-foreground/5 rounded-2xl border border-foreground/10">
                            <div className="text-xs text-foreground/50 mb-1">Started</div>
                            <div className="text-sm font-bold flex items-center gap-2">
                              <Calendar size={14} className="text-primary" />
                              {community.createdAt ? (() => {
                                try {
                                  const date = community.createdAt.toDate ? community.createdAt.toDate() : new Date(community.createdAt);
                                  return formatDate(date, 'MMMM d, yyyy');
                                } catch (e) {
                                  return 'Recently created';
                                }
                              })() : 'Recently created'}
                            </div>
                          </div>
                          <div className="p-4 bg-foreground/5 rounded-2xl border border-foreground/10">
                            <div className="text-xs text-foreground/50 mb-1">Created by</div>
                            <div className="text-sm font-bold flex items-center gap-2">
                              <Shield size={14} className="text-primary" />
                              {creatorProfile ? (creatorProfile.displayName || creatorProfile.username) : 'Community Creator'}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                          <button
                            onClick={handleJoin}
                            disabled={joining || isMember || requestStatus === 'pending' || requestStatus === 'rejected'}
                            className={`flex-1 py-3.5 rounded-full font-semibold text-base transition-all flex items-center justify-center gap-2 ${
                              isMember || requestStatus !== 'none'
                                ? 'bg-foreground/10 text-foreground/50 cursor-default' 
                                : 'bg-primary text-primary-foreground hover:opacity-90'
                            }`}
                          >
                            {isMember ? (
                                <>You're a member</>
                            ) : requestStatus === 'pending' ? (
                                <><Calendar size={20} /> Request Pending</>
                            ) : requestStatus === 'rejected' ? (
                                <>Request not accepted</>
                            ) : (
                                <>{joining ? 'Joining…' : feeOf(community) && !(community.membershipControl?.approvalRequired || community.isPrivate) ? `Join · ${formatFee(feeOf(community)!)}` : (community.membershipControl?.approvalRequired || community.isPrivate) ? 'Request to join' : 'Join community'} <UserPlus size={20} /></>
                            )}
                          </button>
                        </div>
                    </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="p-20 text-center">
            <p className="text-foreground/50">Community not found.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
