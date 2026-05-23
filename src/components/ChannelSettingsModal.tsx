import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, deleteDoc, collection, getDocs, writeBatch, query, orderBy, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Hash, MessageSquare, Code, FileText, Megaphone, Trash2, ShieldAlert, Save, Snowflake, Eraser, Lock, EyeOff, Calendar } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface ChannelSettingsModalProps {
  communityId: string;
  channel: any;
  isOpen: boolean;
  onClose: () => void;
  roles?: any[];
}

export default function ChannelSettingsModal({ communityId, channel, isOpen, onClose, roles = [] }: ChannelSettingsModalProps) {
  const [name, setName] = useState(channel?.name || '');
  const [description, setDescription] = useState(channel?.description || '');
  const [categoryId, setCategoryId] = useState(channel?.categoryId || 'uncategorized');
  const [categories, setCategories] = useState<any[]>([]);
  const [type, setType] = useState(channel?.type || 'chat');
  const [isFrozen, setIsFrozen] = useState(channel?.isFrozen || false);
  const [isLocked, setIsLocked] = useState(channel?.isLocked || false);
  const [isHidden, setIsHidden] = useState(channel?.isHidden || false);
  const [allowedRoles, setAllowedRoles] = useState<string[]>(channel?.allowedRoles || []);
  const [scheduledAt, setScheduledAt] = useState<string>(channel?.scheduledAt ? (channel.scheduledAt.toDate ? channel.scheduledAt.toDate().toISOString().slice(0, 16) : new Date(channel.scheduledAt).toISOString().slice(0, 16)) : '');
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    const q = query(collection(db, 'communities', communityId, 'categories'), orderBy('order', 'asc'));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [communityId]);

  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setDescription(channel.description || '');
      setCategoryId(channel.categoryId || 'uncategorized');
      setType(channel.type);
      setIsFrozen(channel.isFrozen || false);
      setIsLocked(channel.isLocked || false);
      setIsHidden(channel.isHidden || false);
      setAllowedRoles(channel.allowedRoles || []);
      setScheduledAt(channel.scheduledAt ? (channel.scheduledAt.toDate ? channel.scheduledAt.toDate().toISOString().slice(0, 16) : new Date(channel.scheduledAt).toISOString().slice(0, 16)) : '');
    }
  }, [channel]);

  const handleSave = async () => {
    if (!name.trim() || !communityId || !channel.id) return;
    setLoading(true);
    try {
      const channelRef = doc(db, 'communities', communityId, 'channels', channel.id);
      await updateDoc(channelRef, {
        name,
        description,
        categoryId: categoryId === 'uncategorized' ? null : categoryId,
        type,
        isFrozen,
        isLocked,
        isHidden,
        allowedRoles,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/channels/${channel.id}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setAllowedRoles(prev => 
      prev.includes(roleId) ? prev.filter(r => r !== roleId) : [...prev, roleId]
    );
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const channelRef = doc(db, 'communities', communityId, 'channels', channel.id);
      await deleteDoc(channelRef);
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/channels/${channel.id}`);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleClearMessages = async () => {
    setClearing(true);
    try {
      const messagesRef = collection(db, 'communities', communityId, 'channels', channel.id, 'messages');
      const snapshot = await getDocs(messagesRef);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => {
        batch.delete(d.ref);
      });
      
      const channelRef = doc(db, 'communities', communityId, 'channels', channel.id);
      batch.update(channelRef, { messageCount: 0 });
      
      await batch.commit();
      setShowClearConfirm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/channels/${channel.id}/messages`);
    } finally {
      setClearing(false);
    }
  };

  const channelTypes = [
    { id: 'feed', label: 'Feed', icon: <Hash size={16} />, desc: 'Social-style feed for posts and discussions' },
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={16} />, desc: 'Real-time messaging for quick conversations' },
    { id: 'code', label: 'Code', icon: <Code size={16} />, desc: 'Specialized chat with syntax highlighting' },
    { id: 'resources', label: 'Resources', icon: <FileText size={16} />, desc: 'Share links, files, and documentation' },
    { id: 'announcements', label: 'Announcements', icon: <Megaphone size={16} />, desc: 'Read-only for members, broadcast updates' }
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
            className="relative w-full max-w-lg bg-background rounded-[32px] overflow-hidden border border-foreground/10 shadow-2xl"
          >
            <div className="p-8 space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/20 text-primary rounded-xl">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Channel Settings</h2>
                    <p className="text-xs text-foreground/40">Manage #{channel.name}</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-foreground/5 rounded-xl text-foreground/20 hover:text-foreground transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Channel Name</label>
                  <input 
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. general-chat"
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm focus:border-primary outline-none transition-all text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm focus:border-primary outline-none transition-all text-foreground appearance-none"
                  >
                    <option value="uncategorized">No Category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Description</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this channel about?"
                    rows={2}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm focus:border-primary outline-none transition-all resize-none text-foreground custom-scrollbar"
                  />
                </div>

                {roles.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-foreground/30 uppercase tracking-widest mb-2">Role Restrictions</label>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleRole(role.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            allowedRoles.includes(role.id)
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-foreground/5 border-foreground/10 text-foreground/40 hover:border-foreground/20'
                          }`}
                          style={allowedRoles.includes(role.id) ? { borderColor: role.color, color: role.color } : {}}
                        >
                          {role.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-foreground/5">
                  <button
                    onClick={() => setIsFrozen(!isFrozen)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      isFrozen 
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                        : 'bg-foreground/5 border-foreground/5 text-foreground/40 hover:bg-foreground/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                        <Snowflake size={16} />
                        <p className="text-[10px] font-bold text-left">Freeze Chat</p>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-all flex-shrink-0 ${isFrozen ? 'bg-blue-500' : 'bg-foreground/10'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isFrozen ? 'left-4.5' : 'left-0.5'}`} />
                    </div>
                  </button>

                  <button
                    onClick={() => setIsLocked(!isLocked)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      isLocked 
                        ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                        : 'bg-foreground/5 border-foreground/5 text-foreground/40 hover:bg-foreground/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                        <Lock size={16} />
                        <p className="text-[10px] font-bold text-left">Lock Channel</p>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-all flex-shrink-0 ${isLocked ? 'bg-red-500' : 'bg-foreground/10'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isLocked ? 'left-4.5' : 'left-0.5'}`} />
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-6">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-400/10 rounded-xl transition-all text-sm font-bold"
                >
                  <Trash2 size={18} />
                  Delete
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-6 py-2 text-sm font-bold text-foreground/40 hover:text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading || !name.trim()}
                    className="px-8 py-2 bg-primary text-primary-foreground rounded-xl font-bold shadow-[0_0_20px_rgba(0,242,255,0.2)] hover:scale-105 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                  >
                    {loading ? 'Saving...' : <><Save size={18} /> Save</>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          <ConfirmModal 
            isOpen={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleDelete}
            title="Delete Channel"
            message={`Are you sure you want to delete #${channel.name}?`}
            confirmText="Delete"
            loading={loading}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
