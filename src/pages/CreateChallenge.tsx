import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft, Info, DollarSign, Zap, Crosshair, Target, FileText, Image as ImageIcon } from 'lucide-react';
import { ChallengeType, ChallengeSelectionMode, DistributionType } from '../types/challenges';
import Select from 'react-select';
import countryList from 'react-select-country-list';
import { toast } from 'react-hot-toast';

export default function CreateChallenge() {
  const navigate = useNavigate();
  const { challengeId } = useParams<{ challengeId: string }>();
  const isEditing = !!challengeId;
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditing);
  const [customPrizeError, setCustomPrizeError] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ChallengeType>('build');
  const [regionRestriction, setRegionRestriction] = useState({ value: 'Global', label: 'Global' });
  const [skillsNeeded, setSkillsNeeded] = useState('');
  const [contactLink, setContactLink] = useState('');
  const [image, setImage] = useState<string | null>(null);
  
  const [overview, setOverview] = useState('');
  const [objectives, setObjectives] = useState('');
  const [requirements, setRequirements] = useState('');

  const [cashAmount, setCashAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('USDC');
  const [xpAmount, setXpAmount] = useState<string>('1000');
  const [distribution, setDistribution] = useState<DistributionType | 'custom'>('top3');
  const [customBreakdown, setCustomBreakdown] = useState<{place: string, amount: string}[]>([{ place: '1st', amount: '' }]);
  const [selectionMode, setSelectionMode] = useState<ChallengeSelectionMode>('hybrid');
  
  const [customQuestions, setCustomQuestions] = useState<string[]>([]);
  
  // Dates Initialize
  const defaultStartDate = new Date();
  const defaultEndDate = new Date();
  defaultEndDate.setDate(defaultStartDate.getDate() + 7);
  const defaultAnnouncementDate = new Date();
  defaultAnnouncementDate.setDate(defaultEndDate.getDate() + 3);

  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().slice(0, 16));
  const [endDate, setEndDate] = useState(defaultEndDate.toISOString().slice(0, 16));
  const [announcementDate, setAnnouncementDate] = useState(defaultAnnouncementDate.toISOString().slice(0, 16));

  const countryOptions = useMemo(() => [
    { value: 'Global', label: 'Global' },
    ...countryList().getData()
  ], []);

  const selectStyles = {
    control: (base: any) => ({
      ...base,
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      padding: '2px',
      borderRadius: '0.75rem',
      cursor: 'pointer'
    }),
    placeholder: (base: any) => ({ ...base, color: 'rgba(255, 255, 255, 0.4)' }),
    singleValue: (base: any) => ({ ...base, color: 'white' }),
    menu: (base: any) => ({ ...base, backgroundColor: '#1a2235', border: '1px solid rgba(255, 255, 255, 0.1)' }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isFocused ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
      color: 'white',
      cursor: 'pointer'
    })
  };

  useEffect(() => {
    if (isEditing && challengeId) {
      const fetchChallenge = async () => {
        try {
          const docRef = doc(db, 'challenges', challengeId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.creatorId !== auth.currentUser?.uid) {
              toast.error("You do not have permission to edit this challenge.");
              navigate('/challenges');
              return;
            }
            setTitle(data.title || '');
            setType(data.type || 'build');
            setRegionRestriction({ value: data.regionRestriction || 'Global', label: data.regionRestriction || 'Global' });
            setSkillsNeeded((data.skillsNeeded || []).join(', '));
            setContactLink(data.contactLink || '');
            setImage(data.image || null);
            setOverview(data.overview || data.description || '');
            setObjectives((data.objectives || []).join('\n'));
            
            const reqs = data.requirements || [];
            setRequirements(reqs.map((r: any) => r.title ? `${r.title}: ${r.text}` : r.text).join('\n'));

            setCustomQuestions(data.customQuestions || []);

            if (data.rewardPool) {
              setCashAmount(data.rewardPool.cashAmount?.toString() || '');
              setCurrency(data.rewardPool.currency || 'USDC');
              setXpAmount(data.rewardPool.xpAmount?.toString() || '1000');
              setDistribution(data.rewardPool.distributionType || 'top3');
              if (data.rewardPool.breakdown) {
                setCustomBreakdown(data.rewardPool.breakdown.map((b: any) => ({ place: b.place, amount: b.amount.toString() })));
              }
            }

            if (data.deadlines) {
              if (data.deadlines.registrationStart) setStartDate(new Date(data.deadlines.registrationStart).toISOString().slice(0, 16));
              if (data.deadlines.submissionEnd) setEndDate(new Date(data.deadlines.submissionEnd).toISOString().slice(0, 16));
            }
            if (data.winnerAnnouncementDate) {
              setAnnouncementDate(new Date(data.winnerAnnouncementDate).toISOString().slice(0, 16));
            }
          }
        } catch (e) {
          console.error("Error fetching challenge", e);
        } finally {
          setFetching(false);
        }
      };
      fetchChallenge();
    }
  }, [isEditing, challengeId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setCustomPrizeError('');

    // Pre-flight sum check for Custom Breakdown
    const totalCash = parseInt(cashAmount) || 0;
    if (distribution === 'custom') {
      const sum = customBreakdown.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
      if (sum > totalCash) {
        setCustomPrizeError(`Total custom breakdown amount (${sum}) exceeds total prize limit (${totalCash}).`);
        return;
      }
    }
    
    setLoading(true);
    try {
      const parsedStartDate = new Date(startDate).getTime();
      const parsedEndDate = new Date(endDate).getTime();
      const parsedAnnouncementDate = new Date(announcementDate).getTime();
      
      const parsedObjectives = objectives.split('\n').filter(o => o.trim() !== '');
      const parsedRequirements = requirements.split('\n').filter(r => r.trim() !== '').map(req => {
        if (req.includes(':')) {
           const [title, ...rest] = req.split(':');
           return { title: title.trim(), text: rest.join(':').trim() };
        }
        return { text: req.trim() };
      });
      const parsedSkills = skillsNeeded.split(',').map(s => s.trim()).filter(s => s !== '');

      let rewardPoolData: any = {
        cashAmount: cashAmount ? parseInt(cashAmount) : 0,
        currency,
        xpAmount: parseInt(xpAmount),
        distributionType: distribution
      };
      
      if (distribution === 'custom') {
        rewardPoolData.breakdown = customBreakdown.map(b => ({ place: b.place, amount: b.amount }));
      }

      const challengeData = {
        creatorId: auth.currentUser.uid,
        title,
        description: overview, // legacy support
        overview,
        objectives: parsedObjectives,
        requirements: parsedRequirements,
        customQuestions: customQuestions.filter(q => q.trim() !== ''),
        type,
        image: image || '',
        regionRestriction: regionRestriction.value,
        skillsNeeded: parsedSkills,
        contactLink,
        status: 'active',
        rewardPool: rewardPoolData,
        deadlines: {
          registrationStart: parsedStartDate,
          submissionEnd: parsedEndDate,
          judgingEnd: parsedAnnouncementDate
        },
        winnerAnnouncementDate: parsedAnnouncementDate,
        selectionMode,
        participantCount: 0,
        submissionCount: 0,
        updatedAt: serverTimestamp()
      };

      let docId = challengeId;
      if (isEditing && challengeId) {
        await updateDoc(doc(db, 'challenges', challengeId), challengeData);
      } else {
        const fullData = { ...challengeData, createdAt: serverTimestamp() };
        const docRef = await addDoc(collection(db, 'challenges'), fullData);
        docId = docRef.id;
      }

      navigate(`/challenges/${docId}`);
    } catch (error) {
      console.error("Error creating/editing challenge:", error);
      toast.error("Failed to save challenge.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto px-4 md:px-8 py-12">
      <Link to="/challenges" className="flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors w-fit">
        <ChevronLeft size={20} /> Back to Challenges
      </Link>

      <div className="bg-[#111827] rounded-[32px] p-6 sm:p-10 border border-white/10 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-black mb-2">{isEditing ? 'Edit Challenge' : 'Host a Challenge'}</h1>
          <p className="text-white/50">{isEditing ? 'Update the details for your challenge listing.' : 'Setup the rules, define the prize pool, and launch your challenge to the community.'}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          
          {/* Basic Info */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2 border-b border-white/10 pb-2">
              <Crosshair size={20} className="text-primary"/> 1. Core Metadata
            </h3>
            
            <div>
              <label className="block text-sm font-bold text-white/70 mb-2">Challenge Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Xpend X Solana Writers Bounty"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-white/70 mb-2">Challenge Image URL (Optional)</label>
              <div className="relative">
                <ImageIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="url"
                  value={image || ''}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-primary transition-colors text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Category Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ChallengeType)}
                  className="w-full bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white appearance-none"
                >
                  <option value="content">Content Creation (Articles, Threads)</option>
                  <option value="build">Build (Engineering & PRs)</option>
                  <option value="design">Design (UI/UX)</option>
                  <option value="problem-solving">Problem Solving</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Start Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">End Date & Time (Submission Deadline)</label>
                <input
                  type="datetime-local"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white"
                  style={{ colorScheme: "dark" }}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Winners Announcement Date</label>
                <input
                  type="datetime-local"
                  required
                  value={announcementDate}
                  onChange={(e) => setAnnouncementDate(e.target.value)}
                  className="w-full bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Regional Listing</label>
                <Select
                  options={countryOptions}
                  value={regionRestriction}
                  onChange={(val) => setRegionRestriction(val as {value: string, label: string})}
                  styles={selectStyles}
                  className="w-full"
                  classNamePrefix="react-select"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Support Contact URL / Email</label>
                <input
                  type="text"
                  value={contactLink}
                  onChange={(e) => setContactLink(e.target.value)}
                  placeholder="e.g. https://discord.gg/yourlink or mailto:..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white"
                />
              </div>
            </div>
          </div>

          {/* Detailed Content */}
          <div className="space-y-6 pt-4">
            <h3 className="text-xl font-bold flex items-center gap-2 border-b border-white/10 pb-2">
              <FileText size={20} className="text-blue-400"/> 2. Description Details
            </h3>

            <div>
              <label className="block text-sm font-bold text-white/70 mb-2">Skills Needed (Comma separated)</label>
              <input
                type="text"
                required
                value={skillsNeeded}
                onChange={(e) => setSkillsNeeded(e.target.value)}
                placeholder="e.g. Content, Marketing, Copywriting"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-white/70 mb-2">General Overview</label>
              <textarea
                required
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                placeholder="Give the background story and context of what you are building..."
                className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white resize-y"
              />
            </div>

            <div>
              <label className="block text-sm flex items-center justify-between font-bold text-white/70 mb-2">
                Bounty Objectives <span className="text-[10px] font-normal text-white/40 border border-white/10 px-2 py-0.5 rounded">1 line = 1 bullet</span>
              </label>
              <textarea
                required
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                placeholder="What exactly should the submission do?&#10;Explain feature X&#10;Highlight benefit Y"
                className="w-full h-28 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white resize-y leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-sm flex justify-between items-center font-bold text-white/70 mb-2">
                Requirements
                <span className="text-[10px] font-normal text-white/40 border border-white/10 px-2 py-0.5 rounded">Format {`->`} Title: Description</span>
              </label>
              <textarea
                required
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Format: Substack or Medium article&#10;Originality: Must be 100% original&#10;Tags: Tag us on twitter"
                className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary transition-colors text-white resize-y leading-relaxed"
              />
            </div>
            
            <div>
              <label className="block text-sm flex justify-between items-center font-bold text-white/70 mb-2">
                Custom Questions (Optional)
                <button
                  type="button"
                  onClick={() => setCustomQuestions([...customQuestions, ''])}
                  className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors text-white"
                >
                  + Add Question
                </button>
              </label>
              {customQuestions.length > 0 && (
                <div className="space-y-3 mt-4">
                  {customQuestions.map((q, i) => (
                    <div key={i} className="flex gap-2 relative">
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => {
                          const updated = [...customQuestions];
                          updated[i] = e.target.value;
                          setCustomQuestions(updated);
                        }}
                        placeholder="e.g. Please provide your Figma design URL"
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-primary text-sm text-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = customQuestions.filter((_, idx) => idx !== i);
                          setCustomQuestions(updated);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-red-400 p-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reward Pool */}
          <div className="space-y-6 pt-4">
            <h3 className="text-xl font-bold flex items-center gap-2 border-b border-white/10 pb-2">
              <DollarSign size={20} className="text-green-400"/> 3. Reward Escrow
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Total Prize</label>
                <div className="relative">
                  <DollarSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-green-500 transition-colors text-white"
                  />
                </div>
                <p className="text-[10px] text-white/40 mt-1.5 flex items-center gap-1"><Info size={10}/> Funds held in secure escrow.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#1a2235] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-green-500 transition-colors text-white appearance-none"
                >
                  <option value="USDC">USDC</option>
                  <option value="USDT">USDT</option>
                  <option value="ETH">ETH</option>
                  <option value="SOL">SOL</option>
                  <option value="USD">USD (Fiat)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-white/70 mb-2">XP Reward</label>
                <div className="relative">
                  <Zap size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="number"
                    min="100"
                    required
                    value={xpAmount}
                    onChange={(e) => setXpAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-yellow-400 transition-colors text-white"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-white/70 mb-2">Prize Distribution Mode</label>
              <div className="flex bg-white/5 p-1.5 rounded-xl border border-white/10 flex-wrap">
                {(['top3', 'winner-takes-all', 'proportional', 'custom'] as const).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDistribution(d)}
                    className={`flex-1 py-2 px-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                      distribution === d ? 'bg-primary text-white shadow-md' : 'text-white/40 hover:text-white/80'
                    }`}
                  >
                    {d.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {distribution === 'custom' && (
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white/80">Custom Reward Breakdown</h4>
                  <button
                    type="button"
                    onClick={() => setCustomBreakdown([...customBreakdown, { place: `${customBreakdown.length + 1}th`, amount: '' }])}
                    className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded text-white font-medium transition-colors"
                  >
                    + Add Winner
                  </button>
                </div>
                {customPrizeError && (
                  <div className="mb-2 text-xs font-medium text-red-400 bg-red-400/10 p-2 rounded-lg border border-red-400/20">
                    {customPrizeError}
                  </div>
                )}
                {customBreakdown.map((breakdown, idx) => (
                  <div key={idx} className="flex gap-4 items-center">
                    <div className="w-1/3">
                      <input
                        type="text"
                        value={breakdown.place}
                        onChange={(e) => {
                          const newBreakdown = [...customBreakdown];
                          newBreakdown[idx].place = e.target.value;
                          setCustomBreakdown(newBreakdown);
                        }}
                        placeholder="e.g. 1st Place"
                        className="w-full bg-[#1a2235] border border-white/10 rounded-lg px-3 py-2 outline-none text-sm text-white focus:border-primary"
                      />
                    </div>
                    <div className="flex-1 relative">
                      <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                      <input
                        type="number"
                        value={breakdown.amount}
                        onChange={(e) => {
                          const newBreakdown = [...customBreakdown];
                          newBreakdown[idx].amount = e.target.value;
                          setCustomBreakdown(newBreakdown);
                        }}
                        placeholder="Amount"
                        className="w-full bg-[#1a2235] border border-white/10 rounded-lg pl-8 pr-3 py-2 outline-none text-sm text-white focus:border-green-500"
                      />
                    </div>
                    {customBreakdown.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newBreakdown = customBreakdown.filter((_, i) => i !== idx);
                          setCustomBreakdown(newBreakdown);
                        }}
                        className="text-red-400 hover:text-red-300 text-sm font-bold w-6 h-6 flex justify-center items-center rounded-full bg-red-400/10 hover:bg-red-400/20 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-8">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-primary text-white font-black text-lg py-4 rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50 flex justify-center items-center h-[60px]"
            >
              {loading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (isEditing ? 'Save Changes' : 'Launch Challenge to Network')}
            </button>
            <p className="text-center text-xs text-white/30 mt-4">By launching, you agree to the Challenge Escrow Terms of Service.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
