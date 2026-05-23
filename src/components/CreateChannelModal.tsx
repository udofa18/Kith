import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { X, Hash, MessageSquare, Code, FileText, Megaphone, Volume2, Radio, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CreateChannelModalProps {
  communityId: string;
  isOpen: boolean;
  onClose: () => void;
  roles?: any[];
  initialCategoryId?: string;
}

export default function CreateChannelModal({ communityId, isOpen, onClose, roles = [], initialCategoryId }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [categories, setCategories] = useState<any[]>([]);
  const [type, setType] = useState<'feed' | 'chat' | 'code' | 'resources' | 'announcements' | 'voice' | 'live'>('chat');
  const [isPremium, setIsPremium] = useState(false);
  const [allowedRoles, setAllowedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    const q = query(collection(db, 'communities', communityId, 'categories'), orderBy('order', 'asc'));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [communityId]);

  useEffect(() => {
    if (initialCategoryId) setCategoryId(initialCategoryId);
    else setCategoryId('');
  }, [initialCategoryId, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !communityId) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'communities', communityId, 'channels'), {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        description,
        type,
        categoryId: categoryId || 'uncategorized',
        isPremium,
        allowedRoles,
        creatorId: auth.currentUser?.uid,
        owners: [auth.currentUser?.uid],
        createdAt: new Date().toISOString(),
        order: Date.now(),
        messageCount: 0
      });
      onClose();
      setName('');
      setDescription('');
      setType('chat');
      setIsPremium(false);
      setAllowedRoles([]);
      setCategoryId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `communities/${communityId}/channels`);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setAllowedRoles(prev => 
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    );
  };

  const types = [
    { id: 'feed', icon: <Hash size={18} />, label: 'Feed', desc: 'Post-based discussions' },
    { id: 'chat', icon: <MessageSquare size={18} />, label: 'Chat', desc: 'Real-time messaging' },
    { id: 'voice', icon: <Volume2 size={18} />, label: 'Voice', desc: 'Drop-in audio rooms' },
    { id: 'live', icon: <Radio size={18} />, label: 'Live', desc: 'Streaming and presentations' },
    { id: 'code', icon: <Code size={18} />, label: 'Code', desc: 'Syntax highlighted threads' },
    { id: 'resources', icon: <FileText size={18} />, label: 'Resources', desc: 'Files and links' },
    { id: 'announcements', icon: <Megaphone size={18} />, label: 'Announcements', desc: 'Important updates' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md glass rounded-[32px] overflow-hidden border border-white/10 shadow-2xl"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-bold">Create Channel</h2>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-white/30">Channel Name</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20">#</span>
                  <input 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="new-channel"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white outline-none focus:border-primary transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-white/30">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all appearance-none"
                >
                  <option value="uncategorized" className="bg-background">No Category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id} className="bg-background">{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-white/30">Channel Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id as any)}
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-left ${
                        type === t.id 
                          ? 'bg-primary/10 border-primary text-primary' 
                          : 'bg-white/5 border-white/5 text-white/50 hover:border-white/20'
                      }`}
                    >
                      <div className={type === t.id ? 'text-primary' : 'text-white/20'}>
                        {t.icon}
                      </div>
                      <div>
                        <div className="text-[11px] font-bold">{t.label}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-white/30">Description</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this channel about?"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all min-h-[60px] resize-none"
                />
              </div>

              {roles.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/30">Role Restrictions</label>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRole(role.id)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                          allowedRoles.includes(role.id)
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                        }`}
                        style={allowedRoles.includes(role.id) ? { borderColor: role.color, color: role.color } : {}}
                      >
                        {role.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div>
                  <div className="text-sm font-bold">Premium Channel</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPremium(!isPremium)}
                  className={`w-12 h-6 rounded-full transition-all relative ${isPremium ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isPremium ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full py-4 bg-primary text-white font-bold rounded-2xl neon-glow hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? 'Creating...' : 'Create Channel'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
