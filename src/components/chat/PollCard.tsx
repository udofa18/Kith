import { useEffect, useMemo, useState } from 'react';
import { collection, doc, increment, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { BarChart2, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';

interface Props {
  msg: any;
  communityId: string;
  channelId: string;
  canVote: boolean;
  isAuthor: boolean;
  /** Polls created before votes got their own records keep voting through the message itself. */
  onLegacyVote: (optionIndex: number) => void;
  onEnd: () => void;
}

const toDate = (v: any): Date | null => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

/**
 * A poll in the chat. New polls store one vote record per member under the message, so two people
 * voting at once never overwrite each other. Older polls (counts kept on the message) still work.
 */
export default function PollCard({ msg, communityId, channelId, canVote, isAuthor, onLegacyVote, onEnd }: Props) {
  const poll = msg.poll;
  const legacy = poll.v !== 2;
  const uid = auth.currentUser?.uid;
  const options: any[] = poll.options || [];
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [peek, setPeek] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (legacy || msg.isOptimistic) return;
    return onSnapshot(collection(db, 'communities', communityId, 'channels', channelId, 'messages', msg.id, 'votes'),
      snap => setVotes(Object.fromEntries(snap.docs.map(d => [d.id, Number(d.data().option)]))),
      () => {});
  }, [legacy, msg.id, msg.isOptimistic, communityId, channelId]);

  const { counts, mine } = useMemo(() => {
    if (legacy) {
      const entry = poll.voters?.find((v: unknown) => typeof v === 'string' && v.startsWith(`${uid}:`)) as string | undefined;
      return { counts: options.map(o => o.votes || 0), mine: entry ? parseInt(entry.split(':')[1]) : poll.voters?.includes(uid) ? -2 : -1 };
    }
    const counts = options.map(() => 0);
    Object.values(votes).forEach(i => { if (counts[i] !== undefined) counts[i]++; });
    return { counts, mine: uid && votes[uid] !== undefined ? votes[uid] : -1 };
  }, [legacy, poll.voters, votes, options.length, uid]);

  const total = counts.reduce((a, b) => a + b, 0);
  const expires = toDate(poll.expiresAt);
  const closed = !!poll.closed || (!!expires && expires.getTime() < Date.now());
  const hasVoted = mine !== -1;
  const showResults = hasVoted || closed || peek;
  const top = Math.max(0, ...counts);
  const interactive = canVote && !closed && !!uid && !msg.isOptimistic;

  const vote = async (i: number) => {
    if (!interactive || busy || mine === i) return;
    if (legacy) return onLegacyVote(i);
    setBusy(true);
    try {
      const ref = doc(db, 'communities', communityId, 'channels', channelId, 'messages', msg.id, 'votes', uid!);
      await setDoc(ref, { option: i, votedAt: serverTimestamp() });
      if (!hasVoted) updateDoc(doc(db, 'communities', communityId, 'members', uid!), { xp: increment(1) }).catch(() => {});
    } catch {
      toast.error("Couldn't record your vote");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 max-w-md rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground/50"><BarChart2 size={13} />Poll{closed && ' · Closed'}</p>
      <p className="mt-1 font-semibold leading-snug break-words">{poll.question}</p>

      <div role="radiogroup" aria-label={poll.question} className="mt-3 space-y-2">
        {options.map((o, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          const isMine = mine === i;
          const winner = closed && total > 0 && counts[i] === top;
          return (
            <button
              key={i} role="radio" aria-checked={isMine} disabled={!interactive}
              onClick={() => vote(i)}
              className={`relative w-full min-h-[42px] rounded-lg overflow-hidden border text-left transition-colors ${isMine ? 'border-primary' : 'border-foreground/15'} ${interactive && !isMine ? 'hover:border-primary/50' : ''} disabled:cursor-default`}
            >
              {showResults && <span aria-hidden className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${isMine || winner ? 'bg-primary/20' : 'bg-foreground/[0.07]'}`} style={{ width: `${pct}%` }} />}
              <span className="relative flex items-center gap-2.5 px-3 py-2 text-sm">
                <span className={`w-4 h-4 shrink-0 rounded-full border-2 flex items-center justify-center ${isMine ? 'border-primary bg-primary text-white' : 'border-foreground/30'}`}>{isMine && <Check size={10} strokeWidth={3} />}</span>
                <span className={`flex-1 break-words ${isMine || winner ? 'font-semibold' : ''}`}>{o.text}</span>
                {showResults && <span className="shrink-0 text-foreground/60 tabular-nums">{pct}% <span className="text-foreground/40">({counts[i]})</span></span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/50">
        <span>{total} {total === 1 ? 'vote' : 'votes'}</span>
        {!closed && expires && <span>Ends {formatDistanceToNow(expires, { addSuffix: true })}</span>}
        {closed && <span>Final results</span>}
        {!closed && !hasVoted && interactive && <span>Pick one to vote</span>}
        {!closed && hasVoted && interactive && <span>You can change your vote</span>}
        {!hasVoted && !closed && total > 0 && <button onClick={() => setPeek(p => !p)} className="text-primary hover:underline">{peek ? 'Hide results' : 'Show results'}</button>}
        {!canVote && !closed && <span>You can't vote here</span>}
        {isAuthor && !closed && !msg.isOptimistic && <button onClick={onEnd} className="ml-auto text-foreground/60 hover:text-foreground hover:underline">End poll</button>}
      </div>
    </div>
  );
}
