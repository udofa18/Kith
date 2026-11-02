import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { Trophy } from 'lucide-react';
import { auth, db } from '../firebase';
import Avatar from './ui/Avatar';
import VerifiedBadge from './VerifiedBadge';

interface Entry { id: string; xp: number; role: string; user: any }

const TOP = 50;
const MEDAL = ['bg-yellow-500 text-yellow-950', 'bg-slate-300 text-slate-800', 'bg-amber-600 text-white'];
const nameOf = (e: Entry) => e.user?.displayName || e.user?.username || 'Member';
const photoOf = (e: Entry) => e.user?.profileImage || e.user?.photoURL;

function Row({ rank, entry, mine, top }: { rank: number; entry: Entry; mine: boolean; top: number }) {
  return (
    <li>
      <Link to={`/creators/${entry.id}`} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.04] ${mine ? 'bg-primary/5' : ''}`}>
        <span className={`w-8 shrink-0 text-center text-sm font-semibold ${rank <= 3 ? '' : 'text-foreground/50'}`}>
          {rank <= 3 ? <span className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs ${MEDAL[rank - 1]}`}>{rank}</span> : rank}
        </span>
        <Avatar src={photoOf(entry)} seed={entry.id} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-sm font-medium">
            <span className="truncate">{nameOf(entry)}</span>
            <VerifiedBadge verified={entry.user?.verified} />
            {mine && <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[11px] font-semibold">You</span>}
            {entry.role !== 'member' && <span className="ml-1 text-xs text-foreground/45 capitalize">{entry.role}</span>}
          </span>
          <span className="block mt-1 h-1 rounded-full bg-foreground/10 overflow-hidden"><span className="block h-full bg-primary/60" style={{ width: `${top ? Math.max(2, (entry.xp / top) * 100) : 0}%` }} /></span>
        </span>
        <span className="text-sm font-semibold tabular-nums">{entry.xp.toLocaleString()} <span className="font-normal text-foreground/45">XP</span></span>
      </Link>
    </li>
  );
}

export default function CommunityLeaderboard({ communityId }: { communityId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [me, setMe] = useState<{ xp: number; rank: number } | null>(null);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'communities', communityId, 'members'), orderBy('xp', 'desc'), limit(TOP)));
        const rows = await Promise.all(snap.docs.map(async d => {
          const u = await getDoc(doc(db, 'users', d.id)).catch(() => null);
          return { id: d.id, xp: Number(d.data().xp) || 0, role: d.data().role || 'member', user: u?.exists() ? u.data() : null } as Entry;
        }));
        if (cancelled) return;
        setEntries(rows);

        // Someone outside the top list still wants to know where they stand.
        if (uid && !rows.some(r => r.id === uid)) {
          const mine = await getDoc(doc(db, 'communities', communityId, 'members', uid));
          if (!mine.exists()) return;
          const xp = Number(mine.data().xp) || 0;
          const ahead = await getCountFromServer(query(collection(db, 'communities', communityId, 'members'), where('xp', '>', xp)));
          if (!cancelled) setMe({ xp, rank: ahead.data().count + 1 });
        }
      } catch (e) {
        console.error('Leaderboard fetch error:', e);
        if (!cancelled) setEntries([]);
      }
    })();
    return () => { cancelled = true; };
  }, [communityId, uid]);

  if (!entries) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const ranked = entries.filter(e => e.xp > 0);
  const top = ranked[0]?.xp ?? 0;
  const myIndex = ranked.findIndex(e => e.id === uid);
  const myRank = myIndex >= 0 ? myIndex + 1 : me?.rank ?? null;
  const myXp = myIndex >= 0 ? ranked[myIndex].xp : me?.xp ?? 0;
  const above = myIndex > 0 ? ranked[myIndex - 1] : null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><Trophy size={20} className="text-yellow-500" />Leaderboard</h2>
        <p className="text-sm text-foreground/55">Members ranked by XP earned in this community.</p>
      </div>

      {myRank && (
        <div className="flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div className="text-center w-14"><p className="text-xs text-foreground/55">Your rank</p><p className="text-2xl font-semibold">#{myRank}</p></div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{myXp.toLocaleString()} XP</p>
            <p className="text-foreground/55">{above ? `${(above.xp - myXp + 1).toLocaleString()} XP to pass ${nameOf(above)}` : myRank === 1 ? "You're in the lead." : 'Keep chatting and posting to climb.'}</p>
          </div>
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-2 rounded-xl border border-dashed border-foreground/15 text-foreground/50">
          <Trophy size={30} /><p className="text-sm">No one has earned XP here yet. Join the conversation to be first.</p>
        </div>
      ) : (
        <>
          <ol className="rounded-xl border border-foreground/10 divide-y divide-foreground/10 overflow-hidden">
            {ranked.map((e, i) => <Row key={e.id} rank={i + 1} entry={e} mine={e.id === uid} top={top} />)}
          </ol>
          {ranked.length >= TOP && <p className="text-xs text-center text-foreground/45">Showing the top {TOP}.</p>}
        </>
      )}
    </div>
  );
}
