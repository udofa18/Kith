import { useState, useEffect, useRef } from 'react';
import { Hash, MessageSquare, Code, FileText, Megaphone, Plus, Lock, Volume2, Radio, EyeOff, X, GripVertical, Shield, MoreVertical, CheckCheck, BellOff, Trash2, Unlock, Layout, ChevronDown, ChevronRight, Edit2, Copy, Settings } from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'motion/react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'react-hot-toast';
import { channelTypeInfo } from '../lib/channelTypes';

interface Category {
  id: string;
  name: string;
  order: number;
}

interface Channel {
  id: string;
  name: string;
  type: 'feed' | 'chat' | 'code' | 'resources' | 'announcements' | 'voice' | 'live';
  categoryId?: string;
  isPremium?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  messageCount?: number;
  allowedRoles?: string[];
}

interface ChannelSidebarProps {
  communityId: string;
  channels: Channel[];
  activeChannelId: string;
  onChannelSelect: (id: string) => void;
  isAdmin: boolean;
  myPermissions?: string[];
  myCustomRoles?: string[];
  onCreateChannel: (categoryId?: string) => void;
  userChannelStats?: Record<string, number>;
  userMentions?: Record<string, number>;
  hiddenChannels?: string[];
  onLeaveChannel?: (channelId: string) => void;
  onReorderChannels?: (channels: Channel[]) => void;
  onMarkAsRead?: (channelId: string) => void;
  onMuteChannel?: (channelId: string) => void;
  onDeleteChannel?: (channelId: string) => void;
  onToggleLock?: (channelId: string) => void;
  onEditChannel?: (channel: Channel) => void;
  mutedChannels?: string[];
}

export default function ChannelSidebar({ 
  communityId,
  channels, 
  activeChannelId, 
  onChannelSelect, 
  isAdmin, 
  myPermissions = [],
  myCustomRoles = [],
  onCreateChannel,
  userChannelStats = {},
  userMentions = {},
  hiddenChannels = [],
  onLeaveChannel,
  onReorderChannels,
  onMarkAsRead,
  onMuteChannel,
  onDeleteChannel,
  onToggleLock,
  onEditChannel,
  mutedChannels = []
}: ChannelSidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem(`collapsed_${communityId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, any[]>>({});
  const [activeLiveStreams, setActiveLiveStreams] = useState<Record<string, any[]>>({});
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(`collapsed_${communityId}`, JSON.stringify(collapsedCategories));
  }, [collapsedCategories, communityId]);

  useEffect(() => {
    if (!communityId) return;
    const q = query(collection(db, 'communities', communityId, 'categories'), orderBy('order', 'asc'));
    return onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `communities/${communityId}/categories`);
    });
  }, [communityId]);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => 
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    );
  };

  const handleAddCategory = async () => {
    if (!isAdmin) return;
    try {
      await addDoc(collection(db, 'communities', communityId, 'categories'), {
        name: 'New Category',
        order: categories.length,
        createdAt: serverTimestamp()
      });
      toast.success("Category created!");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `communities/${communityId}/categories`);
      toast.error("Failed to create category");
    }
  };

  const handleRenameCategory = async (id: string) => {
    if (!editCategoryName.trim()) return;
    try {
      await updateDoc(doc(db, 'communities', communityId, 'categories', id), {
        name: editCategoryName
      });
      setEditingCategoryId(null);
      toast.success("Category renamed!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/categories/${id}`);
      toast.error("Failed to rename category");
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? Channels within this category will become uncategorized.`)) return;
    try {
      await deleteDoc(doc(db, 'communities', communityId, 'categories', id));
      toast.success("Category deleted!");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/categories/${id}`);
      toast.error("Failed to delete category");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  useEffect(() => {
    if (!communityId || !channels.length) return;

    const voiceUnsubs = channels
      .filter(c => c.type === 'voice')
      .map(channel => {
        if (!channel.id) return null;
        try {
          const q = query(collection(db, 'communities', communityId, 'channels', channel.id, 'voiceParticipants'));
          return onSnapshot(q, (snapshot) => {
            setVoiceParticipants(prev => ({
              ...prev,
              [channel.id]: snapshot.docs.map(doc => doc.data())
            }));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `communities/${communityId}/channels/${channel.id}/voiceParticipants`);
          });
        } catch (err) {
          console.error("Error voice snapshot:", err);
          return null;
        }
      });

    const liveUnsubs = channels
      .filter(c => c.type === 'live')
      .map(channel => {
        if (!channel.id) return null;
        try {
          // Only live streams, and only ones whose host checked in recently (see LiveStreamView).
          const q = query(collection(db, 'communities', communityId, 'channels', channel.id, 'liveStreams'), where('status', '==', 'live'));
          return onSnapshot(q, (snapshot) => {
            const seen = (v: any) => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : 0);
            const activeStreams = snapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((s: any) => Date.now() - (seen(s.lastSeenAt) || seen(s.startTime)) < 2 * 60_000);
            
            setActiveLiveStreams(prev => ({
              ...prev,
              [channel.id]: activeStreams
            }));
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `communities/${communityId}/channels/${channel.id}/liveStreams`);
          });
        } catch (err) {
          console.error("Error live stream snapshot:", err);
          return null;
        }
      });

    const allUnsubs = [...voiceUnsubs, ...liveUnsubs].filter((unsub): unsub is (() => void) => unsub !== null);

    return () => allUnsubs.forEach(unsub => unsub());
  }, [channels, communityId]);

  const getIcon = (type: string) => {
    const Icon = channelTypeInfo(type).icon;
    return <Icon size={18} />;
  };

  const visibleChannels = channels.filter(c => {
    if (isAdmin) return true;
    if (hiddenChannels.includes(c.id)) return false;
    if (c.allowedRoles && c.allowedRoles.length > 0) {
      if (!c.allowedRoles.some(roleId => myCustomRoles.includes(roleId))) return false;
    }
    if ((c as any).isHidden) return false;
    return true;
  });

  const renderChannel = (channel: Channel) => {
    const unreadCount = Math.max(0, (channel.messageCount || 0) - (userChannelStats[channel.id] || 0));
    const mentions = userMentions[channel.id] || 0;
    const isVoiceOnly = channel.type === 'voice';
    const isLiveChannel = channel.type === 'live';
    const participants = voiceParticipants[channel.id] || [];
    const activeStreams = activeLiveStreams[channel.id] || [];
    const isLive = isLiveChannel && activeStreams.length > 0;
    const totalViewers = activeStreams.reduce((acc, s) => acc + (s.viewerCount || 0), 0);
    const isMuted = mutedChannels.includes(channel.id);
    
    return (
      <Reorder.Item
        value={channel}
        key={channel.id}
        id={channel.id}
        dragListener={isAdmin}
        className="relative group/channel-item mb-0.5"
      >
        <div className="flex items-center gap-1 group">
          {isAdmin && (
            <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing p-1">
              <GripVertical size={12} className="text-foreground/40" />
            </div>
          )}
          
          <button
            onClick={() => onChannelSelect(channel.id)}
            className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg transition-all relative ${
              activeChannelId === channel.id 
                ? 'bg-foreground/10 text-foreground' 
                : 'text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70'
            } ${channel.isHidden ? 'opacity-30' : ''} ${unreadCount > 0 ? 'bg-foreground/[0.03]' : ''}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-foreground/20 group-hover:text-foreground/40 shrink-0 ${isLive ? 'text-rose-500 animate-pulse' : ''}`}>
                {getIcon(channel.type)}
              </span>
              <span className={`text-[15px] font-bold tracking-tight truncate ${unreadCount > 0 && !isVoiceOnly && !isLiveChannel ? 'text-foreground font-black' : ''}`}>
                {channel.name}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 shrink-0">
              {isMuted && <BellOff size={10} className="text-foreground/20" />}
              {isLive && (
                <div className="flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-rose-500 text-[8px] font-black text-white uppercase tracking-tighter">Live</span>
                </div>
              )}
              {mentions > 0 && (
                <div className="flex items-center justify-center bg-red-500 text-white text-[10px] font-bold h-4 min-w-[16px] px-1 rounded-full shadow-sm shadow-red-500/20">
                  {mentions}
                </div>
              )}
              {unreadCount > 0 && !isVoiceOnly && !isLiveChannel && (
                <div className="w-2 h-2 rounded-full bg-primary shadow-sm shadow-primary/40" />
              )}
              {channel.isLocked && <Lock size={12} className="text-foreground/20" />}
            </div>
          </button>

          <div className="relative shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuId(activeMenuId === channel.id ? null : channel.id);
              }}
              className={`p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${
                activeMenuId === channel.id ? 'opacity-100 bg-foreground/10 text-foreground' : 'text-foreground/30 hover:bg-foreground/5'
              }`}
            >
              <MoreVertical size={14} />
            </button>

            {activeMenuId === channel.id && (
              <div 
                ref={menuRef}
                className="absolute right-0 top-full mt-1 w-48 glass rounded-xl border border-foreground/10 py-1 z-[100] shadow-2xl scale-in-center overflow-hidden"
              >
                {unreadCount > 0 && onMarkAsRead && (
                  <button 
                    onClick={() => { onMarkAsRead(channel.id); setActiveMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-all"
                  >
                    <CheckCheck size={14} className="text-green-500" /> Mark as Read
                  </button>
                )}
                
                {onMuteChannel && (
                  <button 
                    onClick={() => { onMuteChannel(channel.id); setActiveMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-all"
                  >
                    {isMuted ? <><CheckCheck size={14} /> Unmute</> : <><BellOff size={14} /> Mute Channel</>}
                  </button>
                ) }

                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/community/${communityId}/channel/${channel.id}`);
                    toast.success("Channel link copied!");
                    setActiveMenuId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-all"
                >
                  <Copy size={14} /> Copy Link
                </button>

                {isAdmin && (
                  <>
                    <div className="h-px bg-foreground/5 my-1" />
                    <button 
                      onClick={() => { onEditChannel?.(channel); setActiveMenuId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-all"
                    >
                      <Settings size={14} /> Channel Settings
                    </button>
                    <button 
                      onClick={() => { onToggleLock?.(channel.id); setActiveMenuId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-all"
                    >
                      {channel.isLocked ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock Channel</>}
                    </button>
                    <button 
                      onClick={() => { onDeleteChannel?.(channel.id); setActiveMenuId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-400/10 transition-all"
                    >
                      <Trash2 size={14} /> Delete Channel
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {(isVoiceOnly || isLiveChannel) && participants.length > 0 && (
          <div className="ml-7 flex flex-col gap-1.5 pb-2">
            {participants.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <img src={(p.userPhoto && p.userPhoto.trim() !== '') ? p.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.userId}`} className="w-4 h-4 rounded-full bg-foreground/10 border border-foreground/5 shadow-sm" alt="" />
                <span className="text-[11px] text-foreground/40 font-medium truncate">{p.userName}</span>
              </div>
            ))}
          </div>
        )}
      </Reorder.Item>
    );
  };

  const renderCategory = (category: Category | null) => {
    const categoryId = category?.id || 'uncategorized';
    const categoryName = category?.name || 'Uncategorized';
    const isCollapsed = collapsedCategories.includes(categoryId);
    const categoryChannels = visibleChannels.filter(c => (c.categoryId || 'uncategorized') === categoryId);

    if (categoryChannels.length === 0 && !isAdmin) return null;

    return (
      <div key={categoryId} className="space-y-1 mt-4">
        <div className="flex items-center justify-between px-2 group/category">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button 
              onClick={() => toggleCategory(categoryId)}
              className="p-0.5 hover:bg-foreground/5 rounded transition-colors text-foreground/20 hover:text-foreground/40"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            
            {editingCategoryId === categoryId ? (
              <input 
                autoFocus
                value={editCategoryName}
                onChange={e => setEditCategoryName(e.target.value)}
                onBlur={() => handleRenameCategory(categoryId)}
                onKeyDown={e => e.key === 'Enter' && handleRenameCategory(categoryId)}
                className="bg-foreground/5 border-none text-[10px] font-bold uppercase tracking-widest text-foreground outline-none px-1 rounded h-5"
              />
            ) : (
              <button 
                onClick={() => toggleCategory(categoryId)}
                className="text-[10px] font-bold uppercase tracking-widest text-foreground/30 hover:text-foreground/50 transition-colors truncate text-left"
              >
                {categoryName}
              </button>
            )}

            {isAdmin && category && (
              <div className="flex items-center opacity-0 group-hover/category:opacity-100 transition-opacity ml-1">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingCategoryId(categoryId);
                    setEditCategoryName(categoryName);
                  }}
                  className="p-1 hover:bg-foreground/5 rounded text-foreground/20 hover:text-foreground/40"
                >
                  <Edit2 size={10} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(categoryId, categoryName);
                  }}
                  className="p-1 hover:bg-foreground/5 rounded text-foreground/20 hover:text-red-400"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )}
          </div>

          {(isAdmin || myPermissions.includes('create_channels')) && (
            <button 
              onClick={() => onCreateChannel(categoryId !== 'uncategorized' ? categoryId : undefined)}
              className="p-1 hover:bg-foreground/5 rounded-md text-foreground/20 hover:text-foreground/40 transition-colors opacity-0 group-hover/category:opacity-100"
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {!isCollapsed && (
          <Reorder.Group
            axis="y"
            values={categoryChannels.sort((a,b) => (a as any).order - (b as any).order)}
            onReorder={(newOrder) => {
              if (isAdmin && onReorderChannels) {
                // Update order for these specific channels
                const updatedChannels = newOrder.map((c, i) => ({ ...c, order: i }));
                onReorderChannels(updatedChannels);
              }
            }}
            className="space-y-0.5 pl-2"
          >
            {categoryChannels.sort((a,b) => (a as any).order - (b as any).order).map(renderChannel)}
          </Reorder.Group>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {isAdmin && (
        <button 
          onClick={handleAddCategory}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-foreground/30 hover:text-primary hover:bg-primary/5 transition-all mb-4 border border-dashed border-foreground/10"
        >
          <Plus size={14} /> Create Category
        </button>
      )}

      {categories.map(cat => renderCategory(cat))}
      {renderCategory(null)}
    </div>
  );
}
