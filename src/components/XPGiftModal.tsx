import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, runTransaction, serverTimestamp, collection, addDoc, increment } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, X, Zap, AlertCircle } from 'lucide-react';
import { createNotification } from '../lib/notifications';
import { updateDailyStats } from '../lib/stats';

export default function XPGiftModal({ isOpen, onClose, receiverId, receiverName, communityId }: { 
  isOpen: boolean, 
  onClose: () => void, 
  receiverId: string,
  receiverName: string,
  communityId?: string
}) {
  const [amount, setAmount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userXPData, setUserXPData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && auth.currentUser) {
      const fetchXP = async () => {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        if (userDoc.exists()) {
          setUserXPData(userDoc.data());
        }
      };
      fetchXP();
    }
  }, [isOpen]);

  const handleGift = async () => {
    if (!auth.currentUser || !receiverId) return;
    if (auth.currentUser.uid === receiverId) {
      setError("You can't gift XP to yourself!");
      return;
    }

    setLoading(true);
    setError('');

    try {
      await runTransaction(db, async (transaction) => {
        const senderRef = doc(db, 'users', auth.currentUser!.uid);
        const receiverRef = doc(db, 'users', receiverId);
        
        const senderDoc = await transaction.get(senderRef);
        const receiverDoc = await transaction.get(receiverRef);

        let communitySenderRef = null;
        let communityReceiverRef = null;
        
        if (communityId) {
          communitySenderRef = doc(db, 'communities', communityId, 'members', auth.currentUser!.uid);
          communityReceiverRef = doc(db, 'communities', communityId, 'members', receiverId);
        }

        if (!senderDoc.exists() || !receiverDoc.exists()) {
          throw new Error("User not found");
        }

        const senderData = senderDoc.data();
        const now = new Date();
        const lastResetStr = senderData.lastGiftingReset || now.toISOString();
        const lastReset = new Date(lastResetStr);
        
        let dailyRemaining = senderData.dailyGiftingRemaining !== undefined ? senderData.dailyGiftingRemaining : 100;
        
        if (now.toDateString() !== lastReset.toDateString()) {
          dailyRemaining = 100;
        }

        if (dailyRemaining < amount) {
          throw new Error(`Daily limit reached. Remaining: ${dailyRemaining} XP`);
        }

        if (senderData.xp < amount) {
          throw new Error("Insufficient XP balance");
        }

        // Update sender (Global)
        transaction.update(senderRef, {
          xp: senderData.xp - amount,
          dailyGiftingRemaining: dailyRemaining - amount,
          lastGiftingReset: now.toISOString()
        });

        // Update receiver (Global)
        transaction.update(receiverRef, {
          xp: (receiverDoc.data().xp || 0) + amount
        });

        // Update Community XP if applicable
        if (communityId && communitySenderRef && communityReceiverRef) {
          transaction.update(communityReceiverRef, { xp: increment(amount) });
          // Optionally decrement sender community XP too, though gifting is usually altruistic
        }

        // Log transaction
        const transRef = doc(collection(db, 'xpTransactions'));
        transaction.set(transRef, {
          senderId: auth.currentUser!.uid,
          receiverId: receiverId,
          communityId: communityId || null,
          amount: amount,
          timestamp: now.toISOString()
        });
      });

      // Trigger notification
      await createNotification({
        recipientId: receiverId,
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Someone',
        senderPhoto: auth.currentUser.photoURL || '',
        type: 'xp_gift',
        content: `gifted you ${amount} XP!`,
        relatedId: communityId || auth.currentUser.uid
      });

      if (communityId) {
        updateDailyStats(communityId, 'xpAwarded', amount).catch(console.error);
      }

      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="glass rounded-[32px] w-full max-w-md p-8 relative z-10 overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-500" />
        
        <button onClick={onClose} className="absolute top-6 right-6 text-white/30 hover:text-white">
          <X size={24} />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400/20 to-orange-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/10">
            <Gift className="text-amber-400" size={32} />
          </div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-amber-200 to-white">Gift XP to {receiverName}</h2>
          <p className="text-white/50 text-sm mt-2">
            Show appreciation for their contribution!
          </p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-3">
            {[5, 10, 15, 20].map(val => (
              <button
                key={val}
                onClick={() => setAmount(val)}
                className={`py-3 rounded-xl font-bold transition-all border cursor-pointer ${
                  amount === val 
                    ? 'bg-gradient-to-r from-amber-400 to-orange-500 border-transparent text-white shadow-md shadow-amber-500/15' 
                    : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'
                }`}
              >
                {val}
              </button>
            ))}
          </div>

          <div className="glass rounded-2xl p-4 bg-white/5 border-white/10">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-white/40">Your Balance</span>
              <span className="text-white/80 font-mono">{userXPData?.xp || 0} XP</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Daily Limit Remaining</span>
              <span className="text-white/80 font-mono">{userXPData?.dailyGiftingRemaining || 0} XP</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-4 rounded-xl border border-red-400/20">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            onClick={handleGift}
            disabled={loading || (userXPData?.xp < amount)}
            className="w-full py-4 bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-500 hover:from-amber-300 hover:to-orange-400 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-300 shadow-lg shadow-amber-500/25 hover:scale-105 active:scale-95 cursor-pointer"
          >
            {loading ? 'Processing...' : `Gift ${amount} XP`} <Gift size={20} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
