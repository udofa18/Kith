import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, FolderPlus, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  Timestamp, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db } from '../../firebase';
import ConfirmModal from '../ConfirmModal';
import CreateChannelModal from '../CreateChannelModal';
import { CHANNEL_TYPES, toChannelSlug } from '../../lib/channelTypes';
import { queueAudit, useMembership } from '../../lib/communityRoles';
import { SaveBar, SwitchRow, inputClass } from './settingsUi';
import { clearChannelMessages, deleteChannelWithMessages } from '../../lib/channelAdmin';

const UNCATEGORIZED = 'uncategorized';
const typeInfo = (type: string) => CHANNEL_TYPES.find(t => t.id === type) ?? CHANNEL_TYPES[0]; // older types behave like Chat

const toLocalInput = (v: any) => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const pick = (c: any) => ({
  name: c.name || '', description: c.description || '', categoryId: c.categoryId || UNCATEGORIZED,
  isHidden: !!c.isHidden, isLocked: !!c.isLocked,
  allowedRoles: [...(c.allowedRoles || [])].sort(), postRoles: [...(c.postRoles || [])].sort(),
  scheduledAt: toLocalInput(c.scheduledAt),
});

function RoleChips({ roles, value, onChange, empty }: { roles: any[]; value: string[]; onChange: (v: string[]) => void; empty: string }) {
  if (roles.length === 0) return <p className="text-sm text-foreground/50">Create a role first under Roles & permissions.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {roles.map(r => {
        const on = value.includes(r.id);
        return (
          <button key={r.id} role="checkbox" aria-checked={on} onClick={() => onChange(on ? value.filter(x => x !== r.id) : [...value, r.id])}
            className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-foreground/15 text-foreground/70 hover:border-foreground/30'}`}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color || '#94A3B8' }} />{r.name}
          </button>
        );
      })}
      {value.length === 0 && <span className="text-sm text-foreground/50">{empty}</span>}
    </div>
  );
}

export function ChannelEditor({ communityId, channel, categories, roles, isWelcomeChannel, canEdit, onDelete, onClear, onSaved }: {
  communityId: string; channel: any; categories: any[]; roles: any[]; isWelcomeChannel: boolean; canEdit: boolean; onDelete: () => void;
  /** Offered next to delete when given. */
  onClear?: () => void;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState(() => pick(channel));
  const [saving, setSaving] = useState(false);
  const savedKey = JSON.stringify(pick(channel));
  useEffect(() => { setDraft(pick(channel)); }, [savedKey]);

  const dirty = JSON.stringify({ ...draft, allowedRoles: [...draft.allowedRoles].sort(), postRoles: [...draft.postRoles].sort() }) !== savedKey;
  const slug = toChannelSlug(draft.name);
  const error = !slug ? 'Give the channel a name.' : null;
  const isVoice = channel.type === 'voice' || channel.type === 'live';
  const roleName = (id: string) => roles.find(r => r.id === id)?.name || id;

  const save = async () => {
    if (error) return;
    setSaving(true);
    try {
      const before = pick(channel);
      const changes = [
        before.name !== slug && `renamed from #${before.name}`,
        before.categoryId !== draft.categoryId && 'moved category',
        before.isHidden !== draft.isHidden && (draft.isHidden ? 'hidden' : 'unhidden'),
        before.isLocked !== draft.isLocked && (draft.isLocked ? 'locked' : 'unlocked'),
        JSON.stringify(before.allowedRoles) !== JSON.stringify([...draft.allowedRoles].sort()) && `visible to: ${draft.allowedRoles.map(roleName).join(', ') || 'everyone'}`,
        JSON.stringify(before.postRoles) !== JSON.stringify([...draft.postRoles].sort()) && `posting limited to: ${draft.postRoles.map(roleName).join(', ') || 'everyone'}`,
        before.scheduledAt !== draft.scheduledAt && 'schedule',
        before.description !== draft.description.trim() && 'description',
      ].filter(Boolean).join('; ');
      const batch = writeBatch(db);
      batch.update(doc(db, 'communities', communityId, 'channels', channel.id), {
        name: slug,
        description: draft.description.trim(),
        categoryId: draft.categoryId,
        isHidden: draft.isHidden,
        isLocked: draft.isLocked,
        allowedRoles: draft.allowedRoles,
        postRoles: draft.postRoles,
        // `isPremium` is how the rest of the app marks role-restricted channels.
        isPremium: draft.allowedRoles.length > 0 || (channel.premiumRoles || []).length > 0,
        scheduledAt: draft.scheduledAt ? Timestamp.fromDate(new Date(draft.scheduledAt)) : null,
        updatedAt: serverTimestamp(),
      });
      queueAudit(batch, communityId, { action: 'channel.update', targetName: slug, details: changes });
      await batch.commit();
      toast.success('Channel saved');
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error("Couldn't save the channel");
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={!canEdit} className="border-t border-foreground/10 px-4 py-4 space-y-5 disabled:opacity-70">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Name</span>
          <div className="flex items-center"><span className="px-2.5 py-2 text-sm border border-r-0 border-foreground/15 rounded-l-lg bg-foreground/5 text-foreground/50">#</span>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={40} className={`${inputClass} !rounded-l-none`} /></div>
          {draft.name && slug !== draft.name && <span className="block text-xs text-foreground/45">Will be saved as #{slug}</span>}
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Category</span>
          <select value={draft.categoryId} onChange={e => setDraft({ ...draft, categoryId: e.target.value })} className={inputClass}>
            <option value={UNCATEGORIZED}>Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Description</span>
        <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={200} placeholder="What's this channel for?" className={inputClass} />
      </label>

      <div className="divide-y divide-foreground/10">
        <SwitchRow title="Hide from members" hint="Only moderators can see and open it." checked={draft.isHidden} onChange={isHidden => setDraft({ ...draft, isHidden })} />
        {!isVoice && <SwitchRow title="Lock" hint="Everyone can read, but only moderators can post." checked={draft.isLocked} onChange={isLocked => setDraft({ ...draft, isLocked })} />}
      </div>

      <div className="space-y-2">
        <div><p className="text-sm font-medium">Who can see this channel</p><p className="text-sm text-foreground/55">Limit it to members with these roles. Moderators always can.</p></div>
        <RoleChips roles={roles} value={draft.allowedRoles} onChange={allowedRoles => setDraft({ ...draft, allowedRoles })} empty="Everyone" />
      </div>
      {!isVoice && (
        <div className="space-y-2">
          <div><p className="text-sm font-medium">Who can post</p><p className="text-sm text-foreground/55">Everyone else can read but not post. Moderators always can.</p></div>
          <RoleChips roles={roles} value={draft.postRoles} onChange={postRoles => setDraft({ ...draft, postRoles })} empty="Everyone" />
        </div>
      )}

      <div className="space-y-2">
        <div><p className="text-sm font-medium">Publish later</p><p className="text-sm text-foreground/55">The channel stays hidden from members until this time.</p></div>
        <div className="flex items-center gap-2">
          <input type="datetime-local" value={draft.scheduledAt} onChange={e => setDraft({ ...draft, scheduledAt: e.target.value })} className={`${inputClass} !w-auto`} />
          {draft.scheduledAt && <button onClick={() => setDraft({ ...draft, scheduledAt: '' })} className="text-sm text-foreground/55 hover:text-foreground">Clear</button>}
        </div>
      </div>

      {(channel.premiumRoles || []).length > 0 && (
        <p className="text-sm text-foreground/55">Also restricted to premium roles: {(channel.premiumRoles as string[]).map(roleName).join(', ')}.</p>
      )}

      <SaveBar dirty={dirty} saving={saving} error={error} onSave={save} onDiscard={() => setDraft(pick(channel))} />

      {onClear && (
        <div className="pt-4 border-t border-foreground/10 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Clear messages</p>
            <p className="text-sm text-foreground/55">Deletes every message but keeps the channel.</p>
          </div>
          <button onClick={onClear} className="px-3 py-2 rounded-lg border border-red-500/40 text-red-500 text-sm hover:bg-red-500/10">Clear…</button>
        </div>
      )}
      <div className="pt-4 border-t border-foreground/10 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Delete channel</p>
          <p className="text-sm text-foreground/55">{isWelcomeChannel ? 'This is your welcome channel. Pick a new one after deleting it.' : 'Removes the channel and its messages.'}</p>
        </div>
        <button onClick={onDelete} className="px-3 py-2 rounded-lg border border-red-500/40 text-red-500 text-sm hover:bg-red-500/10">Delete…</button>
      </div>
    </fieldset>
  );
}

export default function ChannelSettings({ communityId, welcomeChannelId }: { communityId: string; welcomeChannelId?: string }) {
  const me = useMembership(communityId);
  const [channels, setChannels] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'channel' | 'category' | 'clear'; item: any } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const base = (name: string) => collection(db, 'communities', communityId, name);
    const unsubs = [
      onSnapshot(query(base('channels'), orderBy('order', 'asc')), s => setChannels(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(base('categories'), orderBy('order', 'asc')), s => setCategories(s.docs.map(d => ({ id: d.id, ...d.data() })))),
      onSnapshot(base('roles'), s => setRoles(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)))),
    ];
    return () => unsubs.forEach(u => u());
  }, [communityId]);

  const knownIds = new Set(categories.map(c => c.id));
  // Channels pointing at a category that no longer exists land under "Uncategorized".
  const groupOf = (c: any) => (c.categoryId && knownIds.has(c.categoryId) ? c.categoryId : UNCATEGORIZED);
  const groups = useMemo(() => [
    ...categories.map(c => ({ id: c.id, name: c.name, category: c })),
    { id: UNCATEGORIZED, name: 'Uncategorized', category: null as any },
  ].map(g => ({ ...g, channels: channels.filter(c => groupOf(c) === g.id) })), [categories, channels]);

  const moveChannel = async (group: { channels: any[] }, id: string, dir: -1 | 1) => {
    const list = [...group.channels];
    const from = list.findIndex(c => c.id === id);
    const to = from + dir;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    try {
      const batch = writeBatch(db);
      list.forEach((c, i) => { if (c.order !== i) batch.update(doc(db, 'communities', communityId, 'channels', c.id), { order: i }); });
      await batch.commit();
    } catch { toast.error('Failed to reorder channels'); }
  };

  const moveCategory = async (id: string, dir: -1 | 1) => {
    const list = [...categories];
    const from = list.findIndex(c => c.id === id);
    const to = from + dir;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    try {
      const batch = writeBatch(db);
      list.forEach((c, i) => { if (c.order !== i) batch.update(doc(db, 'communities', communityId, 'categories', c.id), { order: i }); });
      await batch.commit();
    } catch { toast.error('Failed to reorder categories'); }
  };

  const addCategory = async () => {
    const name = (newCategory || '').trim();
    if (!name) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'communities', communityId, 'categories')), { name, order: categories.length, createdAt: serverTimestamp() });
      queueAudit(batch, communityId, { action: 'category.create', targetName: name });
      await batch.commit();
      setNewCategory(null);
    } catch { toast.error("Couldn't create the category"); }
  };

  const renameCategory = async () => {
    if (!renaming || !renaming.name.trim()) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'communities', communityId, 'categories', renaming.id), { name: renaming.name.trim() });
      queueAudit(batch, communityId, { action: 'category.update', targetName: renaming.name.trim() });
      await batch.commit();
      setRenaming(null);
    } catch { toast.error("Couldn't rename the category"); }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.kind === 'category') {
        const batch = writeBatch(db);
        channels.filter(c => c.categoryId === pendingDelete.item.id)
          .forEach(c => batch.update(doc(db, 'communities', communityId, 'channels', c.id), { categoryId: UNCATEGORIZED }));
        batch.delete(doc(db, 'communities', communityId, 'categories', pendingDelete.item.id));
        queueAudit(batch, communityId, { action: 'category.delete', targetName: pendingDelete.item.name });
        await batch.commit();
      } else if (pendingDelete.kind === 'clear') {
        await clearChannelMessages(communityId, pendingDelete.item);
      } else {
        await deleteChannelWithMessages(communityId, pendingDelete.item);
        if (open === pendingDelete.item.id) setOpen(null);
      }
      toast.success('Deleted');
      setPendingDelete(null);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't delete that");
    } finally {
      setDeleting(false);
    }
  };

  const canCreate = me.can('create_channels');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Channels</h3>
          <p className="text-sm text-foreground/55">Organise channels into categories and choose who can see and post in each.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setNewCategory('')} disabled={!me.isAdmin && !canCreate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-40"><FolderPlus size={15} />New category</button>
          <button onClick={() => setCreating('')} disabled={!canCreate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40"><Plus size={15} />New channel</button>
        </div>
      </div>

      {!me.loading && !me.isAdmin && <p className="text-sm px-4 py-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">Only admins can edit or delete channels.</p>}

      {newCategory !== null && (
        <div className="flex gap-2">
          <input autoFocus value={newCategory} onChange={e => setNewCategory(e.target.value)} maxLength={40} placeholder="Category name" aria-label="Category name"
            onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setNewCategory(null); }} className={inputClass} />
          <button onClick={addCategory} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">Add</button>
          <button onClick={() => setNewCategory(null)} className="px-3 py-2 text-sm text-foreground/60">Cancel</button>
        </div>
      )}

      {groups.filter(g => g.category || g.channels.length > 0).map((g, gi) => (
        <section key={g.id} className="rounded-xl border border-foreground/10">
          <header className="flex items-center gap-2 px-4 py-2.5 bg-foreground/[0.03] border-b border-foreground/10 rounded-t-xl">
            {renaming?.id === g.id ? (
              <input autoFocus value={renaming.name} onChange={e => setRenaming({ id: g.id, name: e.target.value })} onBlur={renameCategory} maxLength={40} aria-label="Category name"
                onKeyDown={e => { if (e.key === 'Enter') renameCategory(); if (e.key === 'Escape') setRenaming(null); }} className={`${inputClass} !py-1`} />
            ) : <h4 className="text-sm font-semibold flex-1 truncate">{g.name} <span className="font-normal text-foreground/45">· {g.channels.length}</span></h4>}
            {renaming?.id === g.id && <span className="flex-1" />}
            {g.category && me.isAdmin && (
              <div className="flex items-center">
                <button aria-label="Move category up" disabled={gi === 0} onClick={() => moveCategory(g.id, -1)} className="p-1.5 text-foreground/50 hover:text-foreground disabled:opacity-25"><ChevronUp size={15} /></button>
                <button aria-label="Move category down" disabled={gi === categories.length - 1} onClick={() => moveCategory(g.id, 1)} className="p-1.5 text-foreground/50 hover:text-foreground disabled:opacity-25"><ChevronDown size={15} /></button>
                <button aria-label="Rename category" onClick={() => setRenaming({ id: g.id, name: g.name })} className="p-1.5 text-foreground/50 hover:text-foreground"><Pencil size={14} /></button>
                <button aria-label="Delete category" onClick={() => setPendingDelete({ kind: 'category', item: g.category })} className="p-1.5 text-foreground/50 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            )}
            {canCreate && <button aria-label={`New channel in ${g.name}`} onClick={() => setCreating(g.id === UNCATEGORIZED ? '' : g.id)} className="p-1.5 text-foreground/50 hover:text-foreground"><Plus size={15} /></button>}
          </header>

          {g.channels.length === 0 && <p className="px-4 py-4 text-sm text-foreground/50">No channels in this category.</p>}
          <ul className="divide-y divide-foreground/10">
            {g.channels.map((c, ci) => {
              const info = typeInfo(c.type);
              const Icon = info.icon;
              const restricted = (c.allowedRoles || []).length > 0;
              const expanded = open === c.id;
              return (
                <li key={c.id}>
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <Icon size={17} className="text-foreground/50 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-foreground/50 flex flex-wrap items-center gap-x-2">
                        <span>{info.label}</span>
                        {c.isHidden && <span className="flex items-center gap-1"><EyeOff size={11} />Hidden</span>}
                        {c.isLocked && <span className="flex items-center gap-1"><Lock size={11} />Locked</span>}
                        {restricted && <span className="flex items-center gap-1"><Users size={11} />Some roles only</span>}
                        {(c.postRoles || []).length > 0 && <span className="flex items-center gap-1"><Eye size={11} />Limited posting</span>}
                        {c.scheduledAt && <span>Scheduled</span>}
                      </p>
                    </div>
                    {me.isAdmin && (
                      <div className="flex items-center">
                        <button aria-label="Move up" disabled={ci === 0} onClick={() => moveChannel(g, c.id, -1)} className="p-1.5 text-foreground/50 hover:text-foreground disabled:opacity-25"><ChevronUp size={15} /></button>
                        <button aria-label="Move down" disabled={ci === g.channels.length - 1} onClick={() => moveChannel(g, c.id, 1)} className="p-1.5 text-foreground/50 hover:text-foreground disabled:opacity-25"><ChevronDown size={15} /></button>
                      </div>
                    )}
                    <button onClick={() => setOpen(expanded ? null : c.id)} aria-expanded={expanded} className="px-3 py-1.5 rounded-lg border border-foreground/15 text-sm hover:bg-foreground/5">{expanded ? 'Close' : 'Edit'}</button>
                  </div>
                  {expanded && (
                    <ChannelEditor communityId={communityId} channel={c} categories={categories} roles={roles} canEdit={me.isAdmin}
                      isWelcomeChannel={c.id === welcomeChannelId} onDelete={() => setPendingDelete({ kind: 'channel', item: c })} onClear={() => setPendingDelete({ kind: 'clear', item: c })} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {channels.length === 0 && <p className="text-sm text-foreground/50">No channels yet. Create one to get started.</p>}

      <CreateChannelModal communityId={communityId} isOpen={creating !== null} onClose={() => setCreating(null)} roles={roles} initialCategoryId={creating || undefined} />

      <ConfirmModal
        isOpen={!!pendingDelete} onClose={() => setPendingDelete(null)} onConfirm={confirmDelete} loading={deleting}
        title={pendingDelete?.kind === 'category' ? `Delete "${pendingDelete.item.name}"?` : pendingDelete?.kind === 'clear' ? `Clear #${pendingDelete.item.name}?` : `Delete #${pendingDelete?.item.name}?`}
        message={pendingDelete?.kind === 'category' ? 'Its channels move to Uncategorized. Nothing else is deleted.' : pendingDelete?.kind === 'clear' ? "Every message in this channel is permanently deleted. The channel stays. This can't be undone." : "The channel and all of its messages are permanently deleted. This can't be undone."}
        confirmText={pendingDelete?.kind === 'category' ? 'Delete category' : pendingDelete?.kind === 'clear' ? 'Clear messages' : 'Delete channel'}
      />
    </div>
  );
}
