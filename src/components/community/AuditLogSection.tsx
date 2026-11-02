import { useEffect, useState } from 'react';
import { ScrollText, Loader2 } from 'lucide-react';
import { collection, getDocs, limit, orderBy, query, startAfter, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatDate } from '../../lib/utils';
import { AUDIT_LABELS } from '../../lib/communityRoles';

const PAGE = 40;
const GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'roles', label: 'Roles' },
  { id: 'members', label: 'Members' },
  { id: 'channels', label: 'Channels' },
  { id: 'community', label: 'Community' },
] as const;

export default function AuditLogSection({ communityId }: { communityId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [group, setGroup] = useState<(typeof GROUPS)[number]['id']>('all');

  const load = async (after?: QueryDocumentSnapshot | null) => {
    setLoading(true);
    try {
      const base = collection(db, 'communities', communityId, 'auditLog');
      const snap = await getDocs(after
        ? query(base, orderBy('createdAt', 'desc'), startAfter(after), limit(PAGE))
        : query(base, orderBy('createdAt', 'desc'), limit(PAGE)));
      setEntries(prev => [...(after ? prev : []), ...snap.docs.map(d => ({ id: d.id, ...d.data() }))]);
      setCursor(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE);
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [communityId]);

  if (denied) return <p className="text-sm text-foreground/50">Only moderators and admins can see the audit log.</p>;

  const shown = entries.filter(e => group === 'all' || AUDIT_LABELS[e.action]?.group === group);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">Audit log</h3>
        <p className="text-sm text-foreground/50">A record of role, member and channel-access changes. Entries can't be edited or deleted.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {GROUPS.map(g => (
          <button key={g.id} onClick={() => setGroup(g.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${group === g.id ? 'bg-primary text-white' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'}`}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-foreground/10 divide-y divide-foreground/5 overflow-hidden">
        {shown.map(e => {
          const at = e.createdAt?.toDate ? e.createdAt.toDate() : null;
          return (
            <div key={e.id} className="px-5 py-3.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{e.actorName || 'Someone'}</span>{' '}
                  <span className="text-foreground/60">{(AUDIT_LABELS[e.action]?.label || e.action).toLowerCase()}</span>
                  {e.targetName && <> <span className="font-medium">{e.targetName}</span></>}
                </p>
                {e.details && <p className="text-xs text-foreground/50 mt-0.5 break-words">{e.details}</p>}
              </div>
              <span className="text-xs text-foreground/40 whitespace-nowrap">{at ? formatDate(at, 'MMM d, HH:mm') : ''}</span>
            </div>
          );
        })}
        {!loading && shown.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 text-foreground/40">
            <ScrollText size={32} /><p className="text-sm">Nothing here yet.</p>
          </div>
        )}
      </div>

      {loading && <div className="flex justify-center py-2"><Loader2 className="animate-spin text-foreground/40" size={18} /></div>}
      {hasMore && !loading && (
        <div className="flex justify-center">
          <button onClick={() => load(cursor)} className="px-4 py-2 rounded-xl text-sm font-medium bg-foreground/5 hover:bg-foreground/10">Load more</button>
        </div>
      )}
    </div>
  );
}
