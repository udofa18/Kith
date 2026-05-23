import { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Users, Shield, Link as LinkIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function CommunityInviteModal({ isOpen, onClose, communityId, communityName }: {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  communityName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [rewardXp, setRewardXp] = useState(50);
  const [maxUses, setMaxUses] = useState(10);

  const generateInvite = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const inviteData = {
        communityId,
        creatorId: auth.currentUser.uid,
        code: inviteCode,
        rewardXp,
        maxUses,
        uses: 0,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };

      await addDoc(collection(db, 'communityInvites'), inviteData);
      const url = `${window.location.origin}/join/${inviteCode}`;
      setInviteUrl(url);
    } catch (error) {
      console.error("Error creating invite:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass rounded-[32px] w-full max-w-lg p-8 relative z-10 border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-500" />

        <button onClick={onClose} className="absolute top-6 right-6 text-white/30 hover:text-white transition-colors">
          <X size={20} />
        </button>

        <div className="mb-8">
           <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
              <Users size={24} />
           </div>
           <h2 className="text-2xl font-bold">Invite to {communityName}</h2>
           <p className="text-white/40 text-sm mt-2">Build your community and earn rewards for active referrals.</p>
        </div>

        {/* General Link Section */}
        <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-[24px] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
              <Shield size={14} /> General Join Link
            </h3>
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">Permanent</span>
          </div>
          <p className="text-[10px] text-white/40 leading-relaxed">
            This link is always active and doesn't expire. Ideal for social profiles and public sharing.
          </p>
          <div className="relative group">
            <div className="flex items-center gap-2 bg-black/20 border border-white/5 rounded-xl p-1.5 pl-4 overflow-hidden">
               <input 
                  readOnly
                  value={`${window.location.origin}/community/${communityId}`}
                  className="bg-transparent text-[11px] flex-1 outline-none text-white/60 font-mono truncate"
               />
               <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/community/${communityId}`);
                    toast.success("General link copied!");
                  }}
                  className="p-2.5 bg-white/5 hover:bg-primary hover:text-white rounded-lg transition-all text-white/40"
               >
                  <Copy size={14} />
               </button>
            </div>
          </div>
        </div>

        <div className="h-[1px] bg-white/5 mb-8" />

        {!inviteUrl ? (
          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Referral Reward</label>
                   <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                      <Shield size={14} className="text-yellow-400" />
                      <input 
                        type="number" 
                        value={rewardXp}
                        onChange={(e) => setRewardXp(parseInt(e.target.value))}
                        className="bg-transparent text-sm font-bold w-full outline-none"
                      />
                      <span className="text-[10px] font-bold text-white/20">XP</span>
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Max Uses</label>
                   <div className="flex items-center gap-2 bg-white/5 border border-white/5 rounded-xl px-4 py-3">
                      <Users size={14} className="text-primary" />
                      <input 
                        type="number" 
                        value={maxUses}
                        onChange={(e) => setMaxUses(parseInt(e.target.value))}
                        className="bg-transparent text-sm font-bold w-full outline-none"
                      />
                   </div>
                </div>
             </div>

             <button 
                onClick={generateInvite}
                disabled={loading}
                className="w-full py-4 bg-primary text-white font-black rounded-2xl neon-glow hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
             >
                {loading ? 'Processing...' : 'Generate Secure Invite'} <LinkIcon size={18} />
             </button>
          </div>
        ) : (
          <div className="space-y-6">
             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Shareable Link</label>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 pl-4">
                   <input 
                      readOnly
                      value={inviteUrl}
                      className="bg-transparent text-sm flex-1 outline-none text-white/60 font-mono"
                   />
                   <button 
                      onClick={copyToClipboard}
                      className={`p-3 rounded-xl transition-all flex items-center gap-2 font-bold text-xs uppercase ${copied ? 'bg-green-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'bg-primary text-white hover:scale-105'}`}
                   >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      {copied ? 'Copied' : 'Copy'}
                   </button>
                </div>
             </div>

             <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-center gap-3">
                <Shield size={18} className="text-primary" />
                <p className="text-[10px] text-white/60 leading-relaxed">
                   This link expires in <span className="text-white font-bold">7 days</span> and grants <span className="text-primary font-bold">{rewardXp} XP</span> to you for every new member joined.
                </p>
             </div>

             <button 
                onClick={() => setInviteUrl('')}
                className="w-full py-3 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
             >
                Create another invite
             </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
