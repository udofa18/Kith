import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { BarChart2, Plus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { gainXP } from '../../lib/xp';

interface LivePollsProps {
  eventId: string;
  isHost: boolean;
}

export default function LivePolls({ eventId, isHost }: LivePollsProps) {
  const [polls, setPolls] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newPoll, setNewPoll] = useState({ question: '', options: ['', ''] });

  useEffect(() => {
    const q = query(
      collection(db, 'eventSessions', eventId, 'polls'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPolls(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => unsubscribe();
  }, [eventId]);

  const handleCreatePoll = async () => {
    if (!newPoll.question || newPoll.options.some(o => !o)) return;

    try {
      await addDoc(collection(db, 'eventSessions', eventId, 'polls'), {
        question: newPoll.question,
        options: newPoll.options.map(text => ({ text, votes: 0 })),
        voters: [],
        createdAt: new Date().toISOString()
      });
      setShowCreate(false);
      setNewPoll({ question: '', options: ['', ''] });
    } catch (error) {
      console.error('Error creating poll:', error);
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    if (!auth.currentUser) return;
    const poll = polls.find(p => p.id === pollId);
    if (poll.voters.includes(auth.currentUser.uid)) return;

    const updatedOptions = [...poll.options];
    updatedOptions[optionIndex].votes += 1;

    try {
      await updateDoc(doc(db, 'eventSessions', eventId, 'polls', pollId), {
        options: updatedOptions,
        voters: arrayUnion(auth.currentUser.uid)
      });
      await gainXP(auth.currentUser.uid, 'vote_poll', eventId);
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 border-l border-white/5">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-bold text-sm uppercase tracking-widest text-white/50">Polls</h3>
        {isHost && (
          <button 
            onClick={() => setShowCreate(!showCreate)}
            className="p-1 hover:bg-white/5 rounded text-primary transition-colors"
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        <AnimatePresence>
          {showCreate && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="glass p-4 rounded-2xl space-y-4 border border-primary/20"
            >
              <input 
                type="text"
                placeholder="Poll Question"
                value={newPoll.question}
                onChange={e => setNewPoll({ ...newPoll, question: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary"
              />
              {newPoll.options.map((opt, i) => (
                <input 
                  key={i}
                  type="text"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={e => {
                    const opts = [...newPoll.options];
                    opts[i] = e.target.value;
                    setNewPoll({ ...newPoll, options: opts });
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-primary"
                />
              ))}
              <div className="flex gap-2">
                <button 
                  onClick={() => setNewPoll({ ...newPoll, options: [...newPoll.options, ''] })}
                  className="flex-1 py-2 rounded-xl bg-white/5 text-xs font-bold hover:bg-white/10 transition-all"
                >
                  Add Option
                </button>
                <button 
                  onClick={handleCreatePoll}
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:scale-105 transition-all"
                >
                  Launch Poll
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {polls.map((poll) => {
          const totalVotes = poll.options.reduce((acc: number, opt: any) => acc + opt.votes, 0);
          const hasVoted = poll.voters.includes(auth.currentUser?.uid);

          return (
            <div key={poll.id} className="glass p-4 rounded-2xl border border-white/5 space-y-4">
              <h4 className="font-bold text-sm">{poll.question}</h4>
              <div className="space-y-2">
                {poll.options.map((opt: any, i: number) => {
                  const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                  return (
                    <button 
                      key={i}
                      onClick={() => handleVote(poll.id, i)}
                      disabled={hasVoted}
                      className="w-full relative h-10 rounded-xl overflow-hidden bg-white/5 group"
                    >
                      <div 
                        className="absolute inset-y-0 left-0 bg-primary/20 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                      <div className="absolute inset-0 px-4 flex items-center justify-between text-xs">
                        <span className="font-medium">{opt.text}</span>
                        <span className="text-white/40">{percentage}% ({opt.votes})</span>
                      </div>
                      {hasVoted && poll.voters.indexOf(auth.currentUser?.uid) === i && (
                        <Check size={14} className="absolute right-12 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-white/20 text-center">{totalVotes} total votes</p>
            </div>
          );
        })}

        {polls.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center py-12 text-white/20">
            <BarChart2 size={48} className="mb-4 opacity-20" />
            <p className="text-sm">No active polls</p>
          </div>
        )}
      </div>
    </div>
  );
}
