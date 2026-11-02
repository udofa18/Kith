import { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, UserMinus, Gavel, X, Loader2 } from 'lucide-react';
import { Timestamp, doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';
import { queueAudit, type Membership } from '../../lib/communityRoles';

const TIMEOUTS = [
  { label: '60 seconds', ms: 60e3 },
  { label: '5 minutes', ms: 5 * 60e3 },
  { label: '1 hour', ms: 3600e3 },
  { label: '1 day', ms: 86400e3 },
  { label: '1 week', ms: 7 * 86400e3 },
];
const BAN_LENGTHS = [
  { label: 'Permanent', ms: 0 },
  { label: '1 day', ms: 86400e3 },
  { label: '7 days', ms: 7 * 86400e3 },
  { label: '30 days', ms: 30 * 86400e3 },
];

type Action = 'timeout' | 'remove' | 'ban';

interface Props {
  communityId: string;
  member: { id: string; name?: string; avatar?: string; role?: string; rank?: number; customRoles?: string[]; timeoutUntil?: any };
  me: Membership;
  onClose: () => void;
}

export default function MemberActionModal({ communityId, member, me, onClose }: Props) {
  const outranked = me.outranks(member as any);
  const available: { id: Action; label: string; icon: any }[] = [
    ...(outranked && me.can('moderate_chat') ? [{ id: 'timeout' as const, label: 'Timeout', icon: Clock }] : []),
    ...(outranked && me.can('manage_members') ? [
      { id: 'remove' as const, label: 'Remove', icon: UserMinus },
      { id: 'ban' as const, label: 'Ban', icon: Gavel },
    ] : []),
  ];
  const [action, setAction] = useState<Action | undefined>(available[0]?.id);
  const [duration, setDuration] = useState(TIMEOUTS[2].ms);
  const [banLength, setBanLength] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const name = member.name || 'this member';
  const timedOutUntil = member.timeoutUntil?.toMillis?.() ?? 0;
  const isTimedOut = timedOutUntil > Date.now();

  const run = async (fn: (batch: ReturnType<typeof writeBatch>) => void, done: string) => {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      fn(batch);
      await batch.commit();
      toast.success(done);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("That didn't go through. You may no longer outrank this member.");
    } finally {
      setBusy(false);
    }
  };

  const memberRef = doc(db, 'communities', communityId, 'members', member.id);
  const communityRef = doc(db, 'communities', communityId);
  const target = { targetId: member.id, targetName: member.name };
  const note = reason.trim();

  const timeout = () => run(b => {
    b.update(memberRef, { timeoutUntil: Timestamp.fromMillis(Date.now() + duration), timeoutReason: note });
    queueAudit(b, communityId, { action: 'member.timeout', ...target, details: `${TIMEOUTS.find(t => t.ms === duration)?.label}${note ? ` — ${note}` : ''}` });
  }, `${name} timed out`);

  const clearTimeout_ = () => run(b => {
    b.update(memberRef, { timeoutUntil: null, timeoutReason: '' });
    queueAudit(b, communityId, { action: 'member.timeout_clear', ...target });
  }, 'Timeout cleared');

  const remove = () => run(b => {
    b.delete(memberRef);
    b.update(communityRef, { memberCount: increment(-1) });
    queueAudit(b, communityId, { action: 'member.kick', ...target, details: note });
  }, `${name} removed`);

  const ban = () => run(b => {
    b.set(doc(db, 'communities', communityId, 'bans', member.id), {
      userId: member.id,
      bannedBy: auth.currentUser?.uid,
      bannedByName: auth.currentUser?.displayName || 'Someone',
      reason: note,
      createdAt: serverTimestamp(),
      ...(member.name ? { name: member.name } : {}),
      ...(member.avatar ? { avatar: member.avatar } : {}),
      ...(banLength ? { expiresAt: Timestamp.fromMillis(Date.now() + banLength) } : {}),
    });
    b.delete(memberRef);
    b.update(communityRef, { memberCount: increment(-1) });
    queueAudit(b, communityId, { action: 'member.ban', ...target, details: `${BAN_LENGTHS.find(l => l.ms === banLength)?.label}${note ? ` — ${note}` : ''}` });
  }, `${name} banned`);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        role="dialog" aria-label={`Moderate ${name}`}
        className="w-full max-w-md bg-background border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/10">
          <div className="flex items-center gap-3 min-w-0">
            <img src={member.avatar?.trim() ? member.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.id}`} className="w-9 h-9 rounded-full object-cover" alt="" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{member.name || 'Member'}</p>
              <p className="text-xs text-foreground/50 capitalize">{member.role}{isTimedOut && ' · timed out'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-foreground/50 hover:bg-foreground/10"><X size={18} /></button>
        </div>

        {available.length === 0 ? (
          <p className="p-5 text-sm text-foreground/60">
            {outranked ? "You don't have a permission that applies to this member." : 'This member has the same or a higher rank than you, so you can\'t moderate them.'}
          </p>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              {available.map(a => (
                <button key={a.id} onClick={() => setAction(a.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-colors ${action === a.id ? 'bg-primary/10 border-primary/30 text-primary' : 'border-foreground/10 text-foreground/60 hover:text-foreground'}`}>
                  <a.icon size={15} />{a.label}
                </button>
              ))}
            </div>

            {action === 'timeout' && (
              <>
                <p className="text-sm text-foreground/60">They stay in the community but can't post or chat until the timeout ends.</p>
                <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl px-3 py-2.5 text-sm">
                  {TIMEOUTS.map(t => <option key={t.ms} value={t.ms}>{t.label}</option>)}
                </select>
              </>
            )}
            {action === 'remove' && <p className="text-sm text-foreground/60">They're removed from the community and can rejoin if it's open to them.</p>}
            {action === 'ban' && (
              <>
                <p className="text-sm text-foreground/60">They're removed and can't rejoin or request to join until the ban ends.</p>
                <select value={banLength} onChange={e => setBanLength(Number(e.target.value))} className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl px-3 py-2.5 text-sm">
                  {BAN_LENGTHS.map(l => <option key={l.ms} value={l.ms}>{l.label}</option>)}
                </select>
              </>
            )}
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Reason (optional, visible to moderators)"
              className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/40" />

            <div className="flex items-center justify-between pt-1">
              {action === 'timeout' && isTimedOut
                ? <button onClick={clearTimeout_} disabled={busy} className="text-sm text-primary hover:underline">Clear current timeout</button>
                : <span />}
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-foreground/60 hover:text-foreground">Cancel</button>
                <button
                  disabled={busy}
                  onClick={action === 'timeout' ? timeout : action === 'remove' ? remove : ban}
                  className={`px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2 disabled:opacity-50 ${action === 'timeout' ? 'bg-primary' : 'bg-red-500'}`}
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {action === 'timeout' ? 'Timeout' : action === 'remove' ? 'Remove member' : 'Ban member'}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
