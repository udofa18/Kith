import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft, Trophy, ExternalLink, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ChallengeSubmissions() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [challenge, setChallenge] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [winners, setWinners] = useState<Record<string, string>>({}); // submissionId -> place

  useEffect(() => {
    const fetchData = async () => {
      if (!challengeId || !auth.currentUser) return;
      
      try {
        const challengeRef = doc(db, 'challenges', challengeId);
        const challengeSnap = await getDoc(challengeRef);
        
        if (!challengeSnap.exists()) {
          toast.error("Challenge not found");
          navigate('/challenges');
          return;
        }
        
        const challengeData = challengeSnap.data();
        
        if (challengeData.creatorId !== auth.currentUser.uid) {
          toast.error("Unauthorized access");
          navigate(`/challenges/${challengeId}`);
          return;
        }
        
        setChallenge({ id: challengeSnap.id, ...challengeData });

        const submissionsRef = collection(db, 'challenges', challengeId, 'submissions');
        const submissionsSnap = await getDocs(submissionsRef);
        
        const subs = submissionsSnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setSubmissions(subs);
        
        // initialize existing winners if any
        const existingWinners: Record<string, string> = {};
        subs.forEach((sub: any) => {
          if (sub.isWinner && sub.placement) {
            existingWinners[sub.id] = sub.placement;
          }
        });
        setWinners(existingWinners);
        
      } catch (err) {
        console.error("Error fetching submissions", err);
        toast.error("Failed to load subs");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [challengeId, auth.currentUser, navigate]);

  const handleSelectWinner = (submissionId: string, place: string) => {
    if (challenge?.status === 'completed') return; // Do not edit if already completed

    setWinners(prev => {
      const updated = { ...prev };
      
      // If the placement is already assigned to someone else, unassign it from them
      if (place !== '') {
         Object.keys(updated).forEach(key => {
            if (updated[key] === place && key !== submissionId) {
               delete updated[key];
            }
         });
      }

      if (place === '') {
        delete updated[submissionId];
      } else {
        updated[submissionId] = place;
      }
      return updated;
    });
  };

  const finalizeWinners = async () => {
    if (!challengeId) return;
    setSaving(true);
    
    try {
      const batch = writeBatch(db);
      
      // Update each submission
      submissions.forEach(sub => {
        const subRef = doc(db, 'challenges', challengeId, 'submissions', sub.id);
        const placement = winners[sub.id];
        
        if (placement) {
          batch.update(subRef, { 
            isWinner: true, 
            placement,
            status: 'winner'
          });
        } else {
          batch.update(subRef, { 
            isWinner: false,
            placement: null,
            status: 'completed'
          });
        }
      });
      
      // Update challenge status
      const challengeRef = doc(db, 'challenges', challengeId);
      batch.update(challengeRef, { 
        status: 'completed',
        completedAt: serverTimestamp()
      });
      
      await batch.commit();
      
      // Update local state instead of doing another fetch 
      setChallenge((prev: any) => ({ ...prev, status: 'completed' }));
      
      toast.success("Winners finalized and challenge closed!");
      navigate(`/challenges/${challengeId}`);
      
    } catch (err) {
      console.error("Failed to finalize", err);
      toast.error("Failed to save winners");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const breakdownOptions = challenge?.rewardPool?.breakdown || [
    { place: '1st', amount: '800' },
    { place: '2nd', amount: '500' },
    { place: '3rd', amount: '200' },
  ];

  const timeIsUp = challenge?.deadlines?.submissionEnd && challenge.deadlines.submissionEnd < Date.now();
  const isCompleted = challenge?.status === 'completed';

  return (
    <div className="max-w-[1000px] mx-auto px-4 md:px-8 py-10 text-foreground">
      <Link to={`/challenges/${challengeId}`} className="flex items-center gap-2 text-foreground/50 hover:text-foreground mb-8 transition-colors w-fit text-sm font-medium">
        <ChevronLeft size={16} /> Back to Challenge
      </Link>

      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-foreground/10">
        <div>
          <h1 className="text-3xl font-bold mb-2">Review Submissions</h1>
          <p className="text-foreground/60">
            {challenge?.title} <span className="mx-2">•</span> {submissions.length} Total Submissions
          </p>
        </div>
        
        {isCompleted ? (
           <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30 rounded-xl font-bold">
             <CheckCircle2 size={18} /> Winners Finalized
           </div>
        ) : (
          <button 
            disabled={!timeIsUp || saving}
            onClick={finalizeWinners}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Finalize Winners'}
          </button>
        )}
      </div>

      {!timeIsUp && !isCompleted && (
        <div className="mb-8 p-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500/90 rounded-xl text-sm font-medium flex items-center gap-3">
          <Trophy size={18} />
          Challenge has not yet ended! You can review submissions but cannot finalize winners until the deadline passes.
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="text-center py-20 bg-foreground/5 border border-foreground/10 rounded-2xl">
          <FileText size={48} className="mx-auto text-foreground/20 mb-4" />
          <h3 className="text-xl font-bold mb-2">No submissions yet</h3>
          <p className="text-foreground/50">Participants haven't submitted anything for this challenge.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {submissions.map((sub) => (
            <div key={sub.id} className="bg-transparent border border-foreground/10 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
              
              <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/10 border-2 border-foreground/5 overflow-hidden shrink-0">
                <img src={sub.userPhoto} alt={sub.userName} referrerPolicy="no-referrer" />
              </div>

              <div className="flex-1 space-y-4 min-w-0">
                <div>
                   <h3 className="text-xl font-bold text-foreground mb-1">{sub.userName}</h3>
                   <div className="flex items-center gap-2">
                     <a 
                       href={sub.submissionLink} 
                       target="_blank" 
                       rel="noopener noreferrer"
                       className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors break-all"
                     >
                       <ExternalLink size={14} className="shrink-0" /> {sub.submissionLink}
                     </a>
                   </div>
                </div>

                {sub.notes && (
                  <div className="bg-foreground/5 border border-foreground/5 rounded-xl p-4 text-sm text-foreground/80 leading-relaxed">
                    {sub.notes}
                  </div>
                )}
                
                {sub.customAnswers && Object.keys(sub.customAnswers).length > 0 && (
                  <div className="space-y-3 pt-2">
                    {Object.entries(sub.customAnswers).map(([q, a]) => (
                      <div key={q} className="text-sm">
                        <div className="text-foreground/50 mb-1">{q}</div>
                        <div className="text-foreground/90">{(a as string) || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Placement Selector */}
              <div className="md:w-64 shrink-0 md:border-l md:border-foreground/10 md:pl-6 flex flex-col justify-center">
                <label className="block text-xs font-bold text-foreground/40 uppercase tracking-widest mb-3">
                  Assign Winner
                </label>
                
                {isCompleted ? (
                   <div className="bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 flex items-center justify-between">
                     <span className="text-sm font-medium text-foreground/90">
                       {winners[sub.id] || 'Participant'}
                     </span>
                     {winners[sub.id] && <Trophy size={16} className="text-yellow-500 dark:text-yellow-400" />}
                   </div>
                ) : (
                  <select 
                    value={winners[sub.id] || ''}
                    onChange={(e) => handleSelectWinner(sub.id, e.target.value)}
                    className="w-full bg-background border border-foreground/10 hover:border-black/30 dark:hover:border-white/30 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-foreground appearance-none"
                  >
                    <option value="">-- No Placement --</option>
                    {breakdownOptions.map((opt: any) => (
                      <option key={opt.place} value={opt.place}>
                        {opt.place} - {opt.amount} {challenge?.rewardPool?.currency || 'USDC'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
