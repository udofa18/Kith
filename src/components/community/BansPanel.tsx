import { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';
import { collection, doc, limit, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { db } from '../../firebase';
import { formatDate } from '../../lib/utils';
import { queueAudit, type Membership } from '../../lib/communityRoles';

const toDate = (v: any): Date | null => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

export default function BansPanel({ communityId, me }: { communityId: string; me: Membership }) {
  const [bans, setBans] = useState<any[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => onSnapshot(
    query(collection(db, 'communities', communityId, 'bans'), orderBy('createdAt', 'desc'), limit(200)),
    snap => setBans(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => setDenied(true),
  ), [communityId]);

  const unban = async (ban: any) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'communities', communityId, 'bans', ban.id));
      queueAudit(batch, communityId, { action: 'member.unban', targetId: ban.id, targetName: ban.name });
      await batch.commit();
      toast.success(`${ban.name || 'Member'} unbanned`);
    } catch {
      toast.error("Couldn't unban this member");
    }
  };

  if (denied) return <p className="text-sm text-foreground/50">You don't have access to the ban list.</p>;
  if (!bans) return null;
  const now = Date.now();
  const active = bans.filter(b => !toDate(b.expiresAt) || toDate(b.expiresAt)!.getTime() > now);

  return (
    <div className="space-y-3">
      {active.length === 0 && (
        <div className="py-20 flex flex-col items-center gap-3 rounded-2xl border border-foreground/10 text-foreground/40">
          <Gavel size={32} /><p className="text-sm">No one is banned.</p>
        </div>
      )}
      {active.map(b => {
        const expires = toDate(b.expiresAt);
        const when = toDate(b.createdAt);
        return (
          <div key={b.id} className="flex items-center gap-3 p-4 rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
            <img src={b.avatar?.trim() ? b.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${b.id}`} className="w-10 h-10 rounded-full object-cover" alt="" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{b.name || b.id}</p>
              <p className="text-xs text-foreground/50 truncate">
                {b.reason || 'No reason given'} · by {b.bannedByName || 'a moderator'}{when && ` · ${formatDate(when, 'MMM d')}`} · {expires ? `until ${formatDate(expires, 'MMM d, HH:mm')}` : 'permanent'}
              </p>
            </div>
            {me.can('manage_members') && (
              <button onClick={() => unban(b)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground/10 hover:bg-foreground/15">Unban</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
