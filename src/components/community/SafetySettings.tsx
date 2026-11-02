import { useEffect, useState } from 'react';
import { ChevronRight, Gavel, Loader2, ScrollText, ShieldCheck } from 'lucide-react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';
import { formatDate } from '../../lib/utils';
import { queueAudit, useMembership } from '../../lib/communityRoles';
import MemberActionModal from './MemberActionModal';

type Status = 'pending' | 'resolved' | 'dismissed';
const FILTERS: { id: Status | 'all'; label: string }[] = [
  { id: 'pending', label: 'Open' }, { id: 'resolved', label: 'Resolved' }, { id: 'dismissed', label: 'Dismissed' }, { id: 'all', label: 'All' },
];
const toDate = (v: any): Date | null => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

export default function SafetySettings({ communityId, onNavigate }: { communityId: string; onNavigate: (s: 'members' | 'audit') => void }) {
  const me = useMembership(communityId);
  const [reports, setReports] = useState<any[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<Status | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [moderating, setModerating] = useState<any>(null);

  useEffect(() => onSnapshot(
    query(collection(db, 'communities', communityId, 'reports'), orderBy('createdAt', 'desc'), limit(200)),
    snap => setReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => setDenied(true),
  ), [communityId]);

  const act = async (report: any, status: 'resolved' | 'dismissed', removeContent = false) => {
    setBusy(report.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'communities', communityId, 'reports', report.id), {
        status, updatedAt: serverTimestamp(), resolvedBy: auth.currentUser?.uid, resolvedByName: auth.currentUser?.displayName || 'Moderator',
      });
      queueAudit(batch, communityId, {
        action: status === 'resolved' ? 'report.resolve' : 'report.dismiss',
        targetName: report.targetType === 'user' ? report.contentSnippet : undefined,
        details: `${report.reason || 'report'}${removeContent ? ' — message removed' : ''}`,
      });
      await batch.commit();
      if (removeContent && report.channelId) {
        try {
          await deleteDoc(doc(db, 'communities', communityId, 'channels', report.channelId, 'messages', report.targetId));
          toast.success('Message removed and report resolved');
        } catch {
          toast.error("Report resolved, but the message couldn't be removed. It may already be gone.");
        }
      } else {
        toast.success(status === 'resolved' ? 'Report resolved' : 'Report dismissed');
      }
    } catch {
      toast.error("Couldn't update the report");
    } finally {
      setBusy(null);
    }
  };

  const moderate = async (report: any) => {
    setBusy(report.id);
    try {
      const [member, user] = await Promise.all([
        getDoc(doc(db, 'communities', communityId, 'members', report.targetId)),
        getDoc(doc(db, 'users', report.targetId)),
      ]);
      if (!member.exists()) return toast('They are no longer a member of this community.');
      setModerating({ id: report.targetId, ...member.data(), name: user.data()?.displayName || report.contentSnippet || 'Member', avatar: user.data()?.photoURL });
    } finally {
      setBusy(null);
    }
  };

  if (denied) return <p className="text-sm text-foreground/55">Only moderators and admins can see reports.</p>;
  if (!reports) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-foreground/40" /></div>;

  const count = (s: Status) => reports.filter(r => r.status === s).length;
  const shown = reports.filter(r => filter === 'all' || r.status === filter);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl font-semibold">Safety</h3>
        <p className="text-sm text-foreground/55">Review reports from members and act on them.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(f => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f.id ? 'bg-primary text-white' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'}`}>
            {f.label}{f.id !== 'all' && <span className="ml-1.5 opacity-70">{count(f.id as Status)}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map(r => {
          const when = toDate(r.createdAt);
          const isUser = r.targetType === 'user';
          const pending = r.status === 'pending';
          return (
            <article key={r.id} className="rounded-xl border border-foreground/10 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold capitalize">{r.reason || 'Report'} <span className="font-normal text-foreground/55">· {isUser ? 'Member' : 'Message'}</span></p>
                  <p className="text-xs text-foreground/50">Reported by {r.reporterName ? `@${r.reporterName}` : 'a member'}{when && ` · ${formatDate(when, 'MMM d, HH:mm')}`}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {typeof r.aiModerationScore === 'number' && <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">AI score {Math.round(r.aiModerationScore * 100) / 100}</span>}
                  <span className={`px-2 py-0.5 rounded-full ${pending ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-foreground/10 text-foreground/60'}`}>{pending ? 'Open' : r.status === 'resolved' ? 'Resolved' : 'Dismissed'}</span>
                </div>
              </div>
              {r.contentSnippet && <blockquote className="px-3 py-2 rounded-lg bg-foreground/5 text-sm break-words line-clamp-3">{isUser ? <>Member: <span className="font-medium">{r.contentSnippet}</span></> : r.contentSnippet}</blockquote>}
              {r.details && <p className="text-sm text-foreground/70 break-words">{r.details}</p>}
              {!pending && r.resolvedByName && <p className="text-xs text-foreground/45">By {r.resolvedByName}</p>}
              {pending && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {isUser && (me.can('moderate_chat') || me.can('manage_members')) && (
                    <button disabled={busy === r.id} onClick={() => moderate(r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-50"><Gavel size={14} />Moderate member</button>
                  )}
                  {!isUser && r.channelId && (
                    <button disabled={busy === r.id} onClick={() => act(r, 'resolved', true)} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50">Remove message</button>
                  )}
                  <button disabled={busy === r.id} onClick={() => act(r, 'resolved')} className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50">Mark resolved</button>
                  <button disabled={busy === r.id} onClick={() => act(r, 'dismissed')} className="px-3 py-1.5 rounded-lg text-sm text-foreground/60 hover:text-foreground disabled:opacity-50">Dismiss</button>
                </div>
              )}
            </article>
          );
        })}
        {shown.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-2 rounded-xl border border-dashed border-foreground/15 text-foreground/50">
            <ShieldCheck size={30} /><p className="text-sm">{filter === 'pending' ? 'No open reports. All clear.' : 'Nothing here.'}</p>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-foreground/10 divide-y divide-foreground/10">
        {[
          { id: 'members' as const, icon: Gavel, title: 'Timeouts, removals and bans', body: 'Use the member directory and Bans tab.' },
          { id: 'audit' as const, icon: ScrollText, title: 'Audit log', body: 'See who changed what, and who was moderated.' },
        ].map(l => (
          <button key={l.id} onClick={() => onNavigate(l.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.03]">
            <l.icon size={17} className="text-foreground/50" />
            <span className="flex-1"><span className="block text-sm font-medium">{l.title}</span><span className="block text-sm text-foreground/55">{l.body}</span></span>
            <ChevronRight size={15} className="text-foreground/40" />
          </button>
        ))}
      </section>

      {moderating && <MemberActionModal communityId={communityId} member={moderating} me={me} onClose={() => setModerating(null)} />}
    </div>
  );
}
