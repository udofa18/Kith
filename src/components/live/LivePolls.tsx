import { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { BarChart2, Check, Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db } from '../../firebase';
import { gainXP } from '../../lib/xp';

interface LivePollsProps {
  /** Event sessions pass `eventId`; community streams pass the stream document path. */
  eventId?: string;
  path?: string;
  isHost: boolean;
}

/** Votes live in `votes: { uid: optionIndex }`, so simultaneous votes never overwrite each other. */
function tally(poll: any) {
  const counts: number[] = poll.options.map((o: any) => 0 + (poll.votes ? 0 : o.votes || 0));
  if (poll.votes) for (const i of Object.values(poll.votes) as number[]) if (counts[i] !== undefined) counts[i]++;
  return counts;
}

export default function LivePolls({ eventId, path, isHost }: LivePollsProps) {
  const base = path ?? `eventSessions/${eventId}`;
  const [polls, setPolls] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const me = auth.currentUser?.uid;

  useEffect(() => onSnapshot(query(collection(db, `${base}/polls`), orderBy('createdAt', 'desc')), snap => {
    setPolls(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, () => setPolls([])), [base]);

  const create = async () => {
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return toast.error('Add a question and at least two options');
    try {
      await addDoc(collection(db, `${base}/polls`), {
        question: question.trim(),
        options: opts.map(text => ({ text, votes: 0 })),
        votes: {},
        voters: [],
        createdAt: new Date().toISOString(),
      });
      setCreating(false);
      setQuestion('');
      setOptions(['', '']);
    } catch {
      toast.error("Couldn't start the poll");
    }
  };

  const vote = async (poll: any, i: number) => {
    if (!me) return;
    try {
      await updateDoc(doc(db, `${base}/polls`, poll.id), { [`votes.${me}`]: i });
      if (eventId && poll.votes?.[me] === undefined) gainXP(me, 'vote_poll', eventId).catch(() => undefined);
    } catch {
      toast.error("Couldn't record your vote");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {isHost && (
        <div className="shrink-0 p-3 border-b border-foreground/10">
          {creating ? (
            <div className="space-y-2">
              <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={140} placeholder="Ask the audience…" className="w-full px-3.5 py-2 rounded-xl bg-foreground/5 border border-transparent focus:border-primary outline-none text-sm" />
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={opt} onChange={e => setOptions(o => o.map((v, j) => (j === i ? e.target.value : v)))} maxLength={60} placeholder={`Option ${i + 1}`} className="flex-1 px-3.5 py-2 rounded-xl bg-foreground/5 border border-transparent focus:border-primary outline-none text-sm" />
                  {options.length > 2 && <button onClick={() => setOptions(o => o.filter((_, j) => j !== i))} aria-label="Remove option" className="p-1.5 rounded-full hover:bg-foreground/10"><X size={14} /></button>}
                </div>
              ))}
              <div className="flex gap-2">
                {options.length < 5 && <button onClick={() => setOptions(o => [...o, ''])} className="px-3 py-1.5 rounded-full text-sm border border-foreground/15 hover:bg-foreground/5">Add option</button>}
                <button onClick={() => setCreating(false)} className="ml-auto px-3 py-1.5 rounded-full text-sm hover:bg-foreground/5">Cancel</button>
                <button onClick={create} className="px-4 py-1.5 rounded-full text-sm font-semibold bg-primary text-white">Start poll</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full border border-dashed border-foreground/20 text-sm font-medium hover:bg-foreground/5">
              <Plus size={15} /> New poll
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {polls.map(poll => {
          const counts = tally(poll);
          const total = counts.reduce((a, b) => a + b, 0);
          const myChoice: number | undefined = me ? poll.votes?.[me] : undefined;
          const votedLegacy = !poll.votes && poll.voters?.includes(me);
          const voted = myChoice !== undefined || votedLegacy;
          return (
            <div key={poll.id} className="p-3.5 rounded-2xl border border-foreground/10">
              <p className="font-semibold text-sm">{poll.question}</p>
              <div className="mt-2.5 space-y-1.5">
                {poll.options.map((opt: any, i: number) => {
                  const pct = total ? Math.round((counts[i] / total) * 100) : 0;
                  const chosen = myChoice === i;
                  return (
                    <button key={i} onClick={() => vote(poll, i)} disabled={votedLegacy} className={`relative w-full h-10 rounded-xl overflow-hidden border text-left ${chosen ? 'border-primary' : 'border-foreground/15 hover:border-primary/50'}`}>
                      <span className={`absolute inset-y-0 left-0 transition-all duration-500 ${chosen ? 'bg-primary/20' : 'bg-foreground/[0.06]'}`} style={{ width: voted ? `${pct}%` : 0 }} />
                      <span className="relative flex items-center justify-between px-3 text-sm">
                        <span className={`flex items-center gap-1.5 ${chosen ? 'text-primary font-medium' : ''}`}>{opt.text}{chosen && <Check size={13} />}</span>
                        {voted && <span className="text-foreground/55 text-xs">{pct}%</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-foreground/50">{total} {total === 1 ? 'vote' : 'votes'}{!voted && ' · Tap to vote'}{myChoice !== undefined && ' · Tap another to change'}</p>
            </div>
          );
        })}
        {polls.length === 0 && (
          <div className="py-12 text-center text-foreground/50">
            <BarChart2 size={28} className="mx-auto opacity-50" />
            <p className="mt-2 text-sm">{isHost ? 'Start a poll to hear from your audience.' : 'No polls yet.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
