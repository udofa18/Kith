import { useState, useEffect, useRef } from 'react';
import { Plus, Lock, EyeOff, GripVertical, MoreVertical, CheckCheck, Bell, BellOff, Trash2, Unlock, ChevronDown, ChevronRight, Edit2, Copy, Settings, FolderPlus } from 'lucide-react';
import { motion, Reorder, AnimatePresence } from 'motion/react';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, addDoc, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'react-hot-toast';
import { channelTypeInfo } from '../lib/channelTypes';
import { queueAudit, useMembership } from '../lib/communityRoles';
import ConfirmModal from './ConfirmModal';

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
  description?: string;
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
  // The channel menu is positioned on screen (not inside the scrolling list), so the last channels' menus aren't clipped.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; up: boolean } | null>(null);
  const [pendingCategory, setPendingCategory] = useState<Category | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const me = useMembership(communityId);
  // Moderators see the whole list, but only admins can organise it (the rules agree).
  const canOrganise = me.isAdmin;

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
    if (!canOrganise) return;
    try {
      const ref = doc(collection(db, 'communities', communityId, 'categories'));
      const batch = writeBatch(db);
      batch.set(ref, { name: 'New category', order: categories.length, createdAt: serverTimestamp() });
      queueAudit(batch, communityId, { action: 'category.create', targetName: 'New category' });
      await batch.commit();
      // Straight into renaming, since nobody wants to keep "New category".
      setEditingCategoryId(ref.id);
      setEditCategoryName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `communities/${communityId}/categories`);
      toast.error("Couldn't create the category");
    }
  };

  const handleRenameCategory = async (id: string) => {
    const name = editCategoryName.trim();
    setEditingCategoryId(null);
    if (!name) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'communities', communityId, 'categories', id), { name });
      queueAudit(batch, communityId, { action: 'category.update', targetName: name });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `communities/${communityId}/categories/${id}`);
      toast.error("Couldn't rename the category");
    }
  };

  const confirmDeleteCategory = async () => {
    const category = pendingCategory;
    if (!category) return;
    try {
      // Its channels move to Uncategorized so none of them drop out of the list.
      const batch = writeBatch(db);
      channels.filter(c => c.categoryId === category.id)
        .forEach(c => batch.update(doc(db, 'communities', communityId, 'channels', c.id), { categoryId: 'uncategorized' }));
      batch.delete(doc(db, 'communities', communityId, 'categories', category.id));
      queueAudit(batch, communityId, { action: 'category.delete', targetName: category.name });
      await batch.commit();
      toast.success('Category deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `communities/${communityId}/categories/${category.id}`);
      toast.error("Couldn't delete the category");
    } finally {
      setPendingCategory(null);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

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

  const visibleChannels = channels.filter(c => {
    if (isAdmin) return true;
    if (hiddenChannels.includes(c.id)) return false;
    if (c.allowedRoles && c.allowedRoles.length > 0) {
      if (!c.allowedRoles.some(roleId => myCustomRoles.includes(roleId))) return false;
    }
    if (c.isHidden) return false;
    return true;
  });

  // A channel pointing at a category that no longer exists belongs under "Uncategorized".
  const knownCategories = new Set(categories.map(c => c.id));
  const groupOf = (c: Channel) => (c.categoryId && knownCategories.has(c.categoryId) ? c.categoryId : 'uncategorized');
  const sortedIn = (categoryId: string) =>
    visibleChannels.filter(c => groupOf(c) === categoryId).sort((a, b) => ((a as any).order ?? 0) - ((b as any).order ?? 0));

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    if (menu?.id === id) return setMenu(null);
    const r = e.currentTarget.getBoundingClientRect();
    const up = r.bottom + 280 > window.innerHeight;
    setMenu({ id, x: Math.max(8, Math.min(r.right - 208, window.innerWidth - 216)), y: up ? r.top - 4 : r.bottom + 4, up });
  };

  const menuItem = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-foreground/5 hover:text-foreground transition-colors text-left';

  const renderMenu = () => {
    const channel = channels.find(c => c.id === menu?.id);
    if (!menu || !channel) return null;
    const unread = Math.max(0, (channel.messageCount || 0) - (userChannelStats[channel.id] || 0));
    const muted = mutedChannels.includes(channel.id);
    const done = () => setMenu(null);
    return (
      <div
        ref={menuRef} role="menu" aria-label={`${channel.name} options`}
        className="fixed w-52 rounded-xl border border-foreground/10 bg-background py-1 z-[100] shadow-xl overflow-hidden"
        style={{ left: menu.x, top: menu.y, transform: menu.up ? 'translateY(-100%)' : undefined }}
      >
        {unread > 0 && onMarkAsRead && (
          <button role="menuitem" onClick={() => { onMarkAsRead(channel.id); done(); }} className={menuItem}><CheckCheck size={15} className="text-green-500" />Mark as read</button>
        )}
        {onMuteChannel && (
          <button role="menuitem" onClick={() => { onMuteChannel(channel.id); done(); }} className={menuItem}>
            {muted ? <><Bell size={15} />Unmute</> : <><BellOff size={15} />Mute channel</>}
          </button>
        )}
        <button
          role="menuitem"
          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/feed?view=community&id=${communityId}&channelId=${channel.id}`); toast.success('Channel link copied'); done(); }}
          className={menuItem}
        ><Copy size={15} />Copy link</button>
        {isAdmin && (
          <>
            <div className="h-px bg-foreground/10 my-1" />
            <button role="menuitem" onClick={() => { onEditChannel?.(channel); done(); }} className={menuItem}><Settings size={15} />Channel settings</button>
            {canOrganise && (
              <>
                {channel.type !== 'voice' && channel.type !== 'live' && (
                  <button role="menuitem" onClick={() => { onToggleLock?.(channel.id); done(); }} className={menuItem}>
                    {channel.isLocked ? <><Unlock size={15} />Unlock</> : <><Lock size={15} />Lock channel</>}
                  </button>
                )}
                <button role="menuitem" onClick={() => { onDeleteChannel?.(channel.id); done(); }} className={`${menuItem} !text-red-500 hover:!bg-red-500/10`}><Trash2 size={15} />Delete channel</button>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  const renderChannel = (channel: Channel) => {
    const Icon = channelTypeInfo(channel.type).icon;
    const isMuted = mutedChannels.includes(channel.id);
    const isVoiceOnly = channel.type === 'voice';
    const isLiveChannel = channel.type === 'live';
    const active = activeChannelId === channel.id;
    // Muted channels stay quiet: only @mentions get a badge. Voice and live rooms have no "unread".
    const unreadCount = isVoiceOnly || isLiveChannel || isMuted ? 0 : Math.max(0, (channel.messageCount || 0) - (userChannelStats[channel.id] || 0));
    const mentions = userMentions[channel.id] || 0;
    const participants = voiceParticipants[channel.id] || [];
    const activeStreams = activeLiveStreams[channel.id] || [];
    const isLive = isLiveChannel && activeStreams.length > 0;
    const hasUnread = unreadCount > 0 || mentions > 0;

    return (
      <Reorder.Item value={channel} key={channel.id} id={channel.id} dragListener={canOrganise} className="relative mb-0.5">
        <div className="group flex items-center">
          {canOrganise && (
            <span aria-hidden className="w-4 shrink-0 flex justify-center opacity-0 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing"><GripVertical size={13} /></span>
          )}

          <button
            onClick={() => onChannelSelect(channel.id)}
            aria-current={active ? 'page' : undefined}
            title={channel.description || undefined}
            className={`flex-1 min-w-0 flex items-center justify-between gap-2 pl-2 pr-2 py-1.5 rounded-lg transition-colors ${
              active ? 'bg-foreground/10 text-foreground' : 'text-foreground/70 hover:bg-foreground/5 hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Icon size={16} className={`shrink-0 ${isLive ? 'text-rose-500' : active ? 'text-foreground/70' : 'text-foreground/45'}`} />
              <span className={`text-sm truncate ${active ? 'font-semibold' : hasUnread ? 'font-semibold text-foreground' : 'font-medium'} ${isMuted && !active ? 'text-foreground/50' : ''}`}>
                {channel.name}
              </span>
            </span>

            <span className="flex items-center gap-1.5 shrink-0">
              {channel.isHidden && <EyeOff size={13} className="text-foreground/45" aria-label="Hidden from members" />}
              {isMuted && <BellOff size={12} className="text-foreground/40" aria-label="Muted" />}
              {channel.isLocked && <Lock size={12} className="text-foreground/45" aria-label="Locked" />}
              {isLive && <span className="px-1.5 py-0.5 rounded bg-rose-500 text-[10px] font-semibold text-white leading-none">Live</span>}
              {unreadCount > 0 && mentions === 0 && !active && <span className="w-2 h-2 rounded-full bg-primary" aria-label="Unread messages" />}
              {mentions > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center" aria-label={`${mentions} mentions`}>
                  {mentions > 99 ? '99+' : mentions}
                </span>
              )}
            </span>
          </button>

          <button
            onClick={e => openMenu(e, channel.id)}
            aria-label={`Options for ${channel.name}`} aria-haspopup="menu" aria-expanded={menu?.id === channel.id}
            className={`ml-0.5 p-1.5 rounded-lg shrink-0 transition-opacity text-foreground/50 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 ${menu?.id === channel.id ? 'opacity-100 bg-foreground/10' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <MoreVertical size={15} />
          </button>
        </div>

        {(isVoiceOnly || isLiveChannel) && participants.length > 0 && (
          <ul className="ml-8 mt-0.5 mb-1.5 space-y-1">
            {participants.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <img src={(p.userPhoto && p.userPhoto.trim() !== '') ? p.userPhoto : `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.userId}`} className="w-5 h-5 rounded-full bg-foreground/10" alt="" />
                <span className="text-xs text-foreground/60 truncate">{p.userName}</span>
              </li>
            ))}
          </ul>
        )}
      </Reorder.Item>
    );
  };

  const renderCategory = (category: Category | null) => {
    const categoryId = category?.id || 'uncategorized';
    const categoryName = category?.name || 'Uncategorized';
    const isCollapsed = collapsedCategories.includes(categoryId);
    const list = sortedIn(categoryId);
    const hasUnreadInside = isCollapsed && list.some(c => c.type !== 'voice' && c.type !== 'live' && !mutedChannels.includes(c.id) && ((c.messageCount || 0) - (userChannelStats[c.id] || 0) > 0 || (userMentions[c.id] || 0) > 0));

    // Empty categories only show for people who can add channels to them; the catch-all only when it has channels.
    if (list.length === 0 && (!category || !isAdmin)) return null;

    return (
      <section key={categoryId} className="mt-4 first:mt-0" aria-label={categoryName}>
        <div className="group/category flex items-center pr-1">
          {editingCategoryId === categoryId ? (
            <input
              autoFocus value={editCategoryName} maxLength={40} aria-label="Category name" placeholder="Category name"
              onChange={e => setEditCategoryName(e.target.value)}
              onBlur={() => handleRenameCategory(categoryId)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameCategory(categoryId); if (e.key === 'Escape') setEditingCategoryId(null); }}
              className="flex-1 min-w-0 mx-1 px-2 py-1 rounded-md bg-foreground/5 text-xs font-semibold text-foreground outline-none ring-1 ring-primary/40"
            />
          ) : (
            <button
              onClick={() => toggleCategory(categoryId)} aria-expanded={!isCollapsed}
              className="flex-1 min-w-0 flex items-center gap-1 px-1 py-1 rounded-md text-xs font-semibold text-foreground/60 hover:text-foreground transition-colors text-left"
            >
              {isCollapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
              <span className="truncate">{categoryName}</span>
              {hasUnreadInside && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-label="Unread channels inside" />}
            </button>
          )}

          {category && canOrganise && editingCategoryId !== categoryId && (
            <span className="flex items-center opacity-0 group-hover/category:opacity-100 focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity">
              <button onClick={() => { setEditingCategoryId(categoryId); setEditCategoryName(categoryName); }} aria-label={`Rename ${categoryName}`} className="p-1 rounded text-foreground/50 hover:bg-foreground/10 hover:text-foreground"><Edit2 size={12} /></button>
              <button onClick={() => setPendingCategory(category)} aria-label={`Delete ${categoryName}`} className="p-1 rounded text-foreground/50 hover:bg-foreground/10 hover:text-red-500"><Trash2 size={12} /></button>
            </span>
          )}

          {(isAdmin || myPermissions.includes('create_channels')) && (
            <button
              onClick={() => onCreateChannel(categoryId !== 'uncategorized' ? categoryId : undefined)}
              aria-label={`New channel in ${categoryName}`}
              className="p-1 rounded text-foreground/50 hover:bg-foreground/10 hover:text-foreground opacity-0 group-hover/category:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity"
            ><Plus size={15} /></button>
          )}
        </div>

        {!isCollapsed && (
          <Reorder.Group
            axis="y" values={list}
            onReorder={newOrder => { if (canOrganise && onReorderChannels) onReorderChannels(newOrder.map((c, i) => ({ ...c, order: i }))); }}
            className="mt-0.5 space-y-0.5"
          >
            {list.map(renderChannel)}
          </Reorder.Group>
        )}
      </section>
    );
  };

  return (
    <nav aria-label="Channels" className="space-y-1">
      {categories.map(cat => renderCategory(cat))}
      {renderCategory(null)}

      {canOrganise && (
        <button
          onClick={handleAddCategory}
          className="mt-3 w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <FolderPlus size={15} /> New category
        </button>
      )}

      {renderMenu()}

      <ConfirmModal
        isOpen={!!pendingCategory} onClose={() => setPendingCategory(null)} onConfirm={confirmDeleteCategory}
        title={`Delete "${pendingCategory?.name}"?`}
        message="Its channels move to Uncategorized. Nothing else is deleted."
        confirmText="Delete category"
      />
    </nav>
  );
}
