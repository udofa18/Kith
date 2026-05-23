import { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, doc, setDoc, increment, updateDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Image as ImageIcon, Layout, Shield, Globe, Lock, DollarSign, Tag } from 'lucide-react';

export default function CreateCommunityModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState('0');
  const [loading, setLoading] = useState(false);

  const categories = [
    { id: 'technology', label: 'Technology' },
    { id: 'build-projects', label: 'Build & Projects' },
    { id: 'career', label: 'Career' },
    { id: 'education-learning', label: 'Education & Learning' },
    { id: 'challenges-competition', label: 'Challenges & Competition' },
    { id: 'monetization-sales', label: 'Monetization & Sales' },
    { id: 'brand', label: 'Brand' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !name.trim()) return;

    setLoading(true);
    try {
      const communityData = {
        name: name.trim(),
        description: description.trim(),
        category,
        creatorId: auth.currentUser.uid,
        memberCount: 1,
        isPrivate,
        membershipControl: {
          accessType: isPrivate ? 'private' : 'public',
          approvalRequired: isPrivate,
          onboardingQuestions: [],
          memberVerificationRequired: false,
          profileCompletionRequired: false,
          autoRoles: []
        },
        isPaid,
        price: isPaid ? parseFloat(price) : 0,
        image: `https://picsum.photos/seed/${name.trim()}/400/400`,
        backdrop: `https://picsum.photos/seed/${name.trim()}_bg/1200/400`,
        createdAt: serverTimestamp(),
        stats: {
          messagesCount: 0,
          totalXp: 0
        }
      };

      const docRef = await addDoc(collection(db, 'communities'), communityData);
      
      // Add creator as owner member
      await setDoc(doc(db, 'communities', docRef.id, 'members', auth.currentUser.uid), {
        userId: auth.currentUser.uid,
        role: 'owner',
        joinedAt: serverTimestamp(),
        permissions: ['all']
      });

      // Create default categories
      const categoriesRef = collection(db, 'communities', docRef.id, 'categories');
      
      const chatCat = await addDoc(categoriesRef, {
        name: 'Chat',
        order: 0,
        createdAt: serverTimestamp()
      });

      const resourcesCat = await addDoc(categoriesRef, {
        name: 'Resources',
        order: 1,
        createdAt: serverTimestamp()
      });

      const voiceCat = await addDoc(categoriesRef, {
        name: 'Voice and Stream',
        order: 2,
        createdAt: serverTimestamp()
      });

      // Create default channels
      const channelsRef = collection(db, 'communities', docRef.id, 'channels');
      
      // Chat Category Channels
      await addDoc(channelsRef, {
        name: 'announcements',
        type: 'announcements',
        description: 'Important updates and news',
        categoryId: chatCat.id,
        order: 1,
        createdAt: serverTimestamp(),
        messageCount: 0
      });
      await addDoc(channelsRef, {
        name: 'general',
        type: 'chat',
        description: 'General discussion for everyone',
        categoryId: chatCat.id,
        order: 2,
        createdAt: serverTimestamp(),
        messageCount: 0
      });
      await addDoc(channelsRef, {
        name: 'feed',
        type: 'feed',
        description: 'Community posts and discussions',
        categoryId: chatCat.id,
        order: 3,
        createdAt: serverTimestamp(),
        messageCount: 0
      });

      // Resources Category Channels
      await addDoc(channelsRef, {
        name: 'resources',
        type: 'resources',
        description: 'Community resources and links',
        categoryId: resourcesCat.id,
        order: 1,
        createdAt: serverTimestamp(),
        messageCount: 0
      });

      // Voice Category Channels
      await addDoc(channelsRef, {
        name: 'general-voice',
        type: 'voice',
        description: 'Jump in for a quick chat!',
        categoryId: voiceCat.id,
        order: 1,
        createdAt: serverTimestamp(),
        messageCount: 0
      });
      await addDoc(channelsRef, {
        name: 'live-stream',
        type: 'live',
        description: 'Live presentations and events',
        categoryId: voiceCat.id,
        order: 2,
        createdAt: serverTimestamp(),
        messageCount: 0
      });

      onClose();
      setName('');
      setDescription('');
      setIsPaid(false);
      setPrice('0');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'communities');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
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
        className="bg-background shadow-2xl border border-foreground/10 rounded-[32px] w-full max-w-xl p-8 relative z-10 overflow-hidden max-h-[90vh] overflow-y-auto scrollbar-hide text-foreground"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-purple-500" />
        
        <button onClick={onClose} className="absolute top-6 right-6 text-foreground/30 hover:text-foreground transition-colors">
          <X size={24} />
        </button>
 
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center">
            <Users className="text-primary" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Create Community</h2>
            <p className="text-foreground/40 text-sm">Build a space for developers to collaborate.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-foreground/30 ml-1">Community Name</label>
              <input 
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. React Wizards"
                className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl py-3 px-4 outline-none focus:border-primary transition-all text-sm text-foreground placeholder:text-foreground/20"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-foreground/30 ml-1">Category</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl py-3 px-4 outline-none focus:border-primary transition-all appearance-none text-sm text-foreground"
              >
                {categories.map(c => <option key={c.id} value={c.id} className="bg-background text-foreground">{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-foreground/30 ml-1">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about?"
              className="w-full bg-foreground/5 border border-foreground/10 rounded-2xl py-3 px-4 outline-none focus:border-primary transition-all min-h-[100px] resize-none text-sm text-foreground placeholder:text-foreground/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setIsPrivate(false)}
              className={`p-4 rounded-2xl border transition-all flex flex-col gap-2 text-left ${!isPrivate ? 'bg-primary/10 border-primary' : 'bg-foreground/5 border-foreground/10 hover:border-foreground/20'}`}
            >
              <Globe size={20} className={!isPrivate ? 'text-primary' : 'text-foreground/40'} />
              <div>
                <div className="text-sm font-bold text-foreground">Public</div>
                <div className="text-[10px] text-foreground/40">Anyone can view and join</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setIsPrivate(true)}
              className={`p-4 rounded-2xl border transition-all flex flex-col gap-2 text-left ${isPrivate ? 'bg-primary/10 border-primary' : 'bg-foreground/5 border-foreground/10 hover:border-foreground/20'}`}
            >
              <Lock size={20} className={isPrivate ? 'text-primary' : 'text-foreground/40'} />
              <div>
                <div className="text-sm font-bold text-foreground">Private</div>
                <div className="text-[10px] text-foreground/40">Requires approval to join</div>
              </div>
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-foreground/5 rounded-2xl border border-foreground/10">
              <div className="flex items-center gap-3">
                <DollarSign size={20} className={isPaid ? 'text-primary' : 'text-foreground/40'} />
                <div>
                  <div className="text-sm font-bold text-foreground">Paid Community</div>
                  <div className="text-[10px] text-foreground/40">Monetize your community with a join fee</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaid(!isPaid)}
                className={`w-12 h-6 rounded-full transition-all relative ${isPaid ? 'bg-primary' : 'bg-foreground/10'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isPaid ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <AnimatePresence>
              {isPaid && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-primary/60 ml-1">One-time Join Fee (USD)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40">$</span>
                      <input 
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full bg-foreground/5 border border-primary/20 rounded-xl py-3 pl-8 pr-4 text-foreground outline-none focus:border-primary transition-all text-sm font-mono"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-4 bg-foreground/5 rounded-2xl border border-foreground/10 flex items-center gap-3">
            <Shield size={20} className="text-primary shrink-0" />
            <p className="text-[10px] text-foreground/50">
              As the creator, you will be the <span className="text-primary font-bold">Owner</span> with full permissions.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(0,242,255,0.2)] disabled:shadow-none"
          >
            {loading ? 'Creating...' : 'Create Community'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
