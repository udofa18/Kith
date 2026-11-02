import { useEffect, useState } from 'react';
import { Copy, Link as LinkIcon, Loader2, Plus, Trash2 } from 'lucide-react';
import { collection, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';
import { formatDate } from '../../lib/utils';
import ConfirmModal from '../ConfirmModal';
import { queueAudit, useMembership } from '../../lib/communityRoles';
import { Card, inputClass } from './settingsUi';

export const MAX_INVITE_REWARD = 500;
const EXPIRY = [{ days: 1, label: '1 day' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];
const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;

type Draft = { code: string; rewardXp: number; maxUses: number; days: number };
const EMPTY: Draft = { code: '', rewardXp: 50, maxUses: 0, days: 7 };

const statusOf = (i: any) =>
  new Date(i.expiresAt).getTime() < Date.now() ? 'Expired'
    : i.maxUses > 0 && (i.uses || 0) >= i.maxUses ? 'Used up'
    : 'Active';

export default function InviteSettings({ communityId, community }: { communityId: string; community: any }) {
  const me = useMembership(communityId);
  const [invites, setInvites] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<any>(null);

  useEffect(() => onSnapshot(
    query(collection(db, 'communityInvites'), where('communityId', '==', communityId), orderBy('createdAt', 'desc')),
    snap => setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => setInvites([]),
  ), [communityId]);

  const code = draft.code.trim().toUpperCase();
  const problem =
    code && !/^[A-Z0-9]{4,12}$/.test(code) ? 'Codes are 4 to 12 letters or numbers.'
      : draft.rewardXp < 0 || draft.rewardXp > MAX_INVITE_REWARD ? `The reward can be 0 to ${MAX_INVITE_REWARD} XP.`
      : draft.maxUses < 0 || draft.maxUses > 10000 ? 'Max uses can be 0 (no limit) to 10,000.'
      : null;

  const create = async () => {
    if (!auth.currentUser || problem) return;
    setBusy(true);
    try {
      const finalCode = code || Math.random().toString(36).slice(2, 8).toUpperCase();
      if (!(await getDocs(query(collection(db, 'communityInvites'), where('code', '==', finalCode)))).empty) {
        toast.error('That code is already taken. Try another.');
        return;
      }
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'communityInvites')), {
        communityId, creatorId: auth.currentUser.uid, code: finalCode,
        rewardXp: Math.round(draft.rewardXp), maxUses: Math.round(draft.maxUses), uses: 0,
        createdAt: serverTimestamp(), expiresAt: new Date(Date.now() + draft.days * 86400e3).toISOString(),
      });
      queueAudit(batch, communityId, { action: 'invite.create', details: finalCode });
      await batch.commit();
      await navigator.clipboard?.writeText(inviteUrl(finalCode)).catch(() => {});
      toast.success('Invite created and link copied');
      setOpen(false);
      setDraft(EMPTY);
    } catch {
      toast.error("Couldn't create the invite");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'communityInvites', revoking.id));
      queueAudit(batch, communityId, { action: 'invite.revoke', details: revoking.code });
      await batch.commit();
      toast.success('Invite revoked');
      setRevoking(null);
    } catch {
      toast.error("Couldn't revoke the invite");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (c: string) => {
    try { await navigator.clipboard.writeText(inviteUrl(c)); toast.success('Link copied'); } catch { toast.error("Couldn't copy. Select the link and copy it."); }
  };

  if (!invites) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-foreground/40" /></div>;
  const active = invites.filter(i => statusOf(i) === 'Active');
  const joins = invites.reduce((n, i) => n + (i.uses || 0), 0);
  const canInvite = me.can('invite_users');
  const needsApproval = community?.membershipControl?.approvalRequired || (community?.membershipControl?.accessType ?? 'public') !== 'public';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">Invites</h3>
          <p className="text-sm text-foreground/55">Share a link that opens your community. People who join through it can earn XP, and so do you.</p>
        </div>
        <button onClick={() => setOpen(o => !o)} disabled={!canInvite} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40"><Plus size={15} />New invite</button>
      </div>

      {!me.loading && !canInvite && <p className="text-sm px-4 py-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">You don't have permission to create invites.</p>}
      {needsApproval && (
        <p className="text-sm px-4 py-3 rounded-lg bg-foreground/5 text-foreground/70">People still need your approval to join, so invite rewards only apply to communities that members can join straight away.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        {[{ label: 'Active links', value: active.length }, { label: 'People joined through invites', value: joins }].map(c => (
          <div key={c.label} className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
            <p className="text-sm text-foreground/55">{c.label}</p><p className="text-3xl font-semibold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {open && (
        <Card title="New invite">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1"><span className="text-sm font-medium">Custom code <span className="font-normal text-foreground/50">(optional)</span></span>
              <input value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} maxLength={12} placeholder="Random" className={inputClass} /></label>
            <label className="block space-y-1"><span className="text-sm font-medium">Expires after</span>
              <select value={draft.days} onChange={e => setDraft({ ...draft, days: Number(e.target.value) })} className={inputClass}>{EXPIRY.map(e => <option key={e.days} value={e.days}>{e.label}</option>)}</select></label>
            <label className="block space-y-1"><span className="text-sm font-medium">XP for you and the new member</span>
              <input type="number" min={0} max={MAX_INVITE_REWARD} value={draft.rewardXp} onChange={e => setDraft({ ...draft, rewardXp: Number(e.target.value) })} className={inputClass} />
              <span className="block text-xs text-foreground/45">Each of you gets this much. 0 to {MAX_INVITE_REWARD}.</span></label>
            <label className="block space-y-1"><span className="text-sm font-medium">Limit uses</span>
              <input type="number" min={0} value={draft.maxUses} onChange={e => setDraft({ ...draft, maxUses: Number(e.target.value) })} className={inputClass} />
              <span className="block text-xs text-foreground/45">0 means no limit.</span></label>
          </div>
          {problem && <p className="text-sm text-red-500 mt-3">{problem}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-foreground/60 hover:text-foreground">Cancel</button>
            <button onClick={create} disabled={busy || !!problem} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">Create invite</button>
          </div>
        </Card>
      )}

      <section className="rounded-xl border border-foreground/10 divide-y divide-foreground/10">
        {invites.length === 0 && <p className="px-4 py-10 text-sm text-center text-foreground/50">No invite links yet.</p>}
        {invites.map(i => {
          const status = statusOf(i);
          return (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <LinkIcon size={16} className="text-foreground/45 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium"><span className="font-mono">{i.code}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${status === 'Active' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-foreground/10 text-foreground/60'}`}>{status}</span></p>
                <p className="text-xs text-foreground/50">{i.uses || 0} of {i.maxUses > 0 ? i.maxUses : 'unlimited'} uses · {i.rewardXp} XP each · {status === 'Expired' ? 'expired' : 'expires'} {formatDate(i.expiresAt, 'MMM d')}</p>
              </div>
              <button onClick={() => copy(i.code)} disabled={status !== 'Active'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-40"><Copy size={14} />Copy link</button>
              {canInvite && <button onClick={() => setRevoking(i)} aria-label={`Revoke ${i.code}`} className="p-2 rounded-lg text-foreground/40 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>}
            </div>
          );
        })}
      </section>

      <ConfirmModal isOpen={!!revoking} onClose={() => setRevoking(null)} onConfirm={revoke} loading={busy}
        title={`Revoke ${revoking?.code}?`} message="The link stops working straight away. People who already joined stay in." confirmText="Revoke invite" />
    </div>
  );
}
