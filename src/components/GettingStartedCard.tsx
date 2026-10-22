import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, PenLine, Users, UserCircle, X } from 'lucide-react';

/**
 * First-run checklist shown on the feed after onboarding.
 * State is per-device (localStorage); it's a nudge, not a source of truth.
 */
const storageKey = (uid: string) => `kith:getting-started:${uid}`;

type TaskId = 'post' | 'community' | 'profile';

export function startGettingStarted(uid: string) {
  localStorage.setItem(storageKey(uid), JSON.stringify([]));
}

function readDone(uid: string): TaskId[] | null {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function GettingStartedCard({ uid, onWritePost }: { uid: string; onWritePost: () => void }) {
  const [done, setDone] = useState<TaskId[] | null>(() => readDone(uid));

  if (!done) return null;

  const TASKS: { id: TaskId; label: string; icon: typeof PenLine; to?: string; onClick?: () => void }[] = [
    { id: 'post', label: 'Write your first post', icon: PenLine, onClick: onWritePost },
    { id: 'community', label: 'Join a community', icon: Users, to: '/feed?view=communities' },
    { id: 'profile', label: 'Add links to your profile', icon: UserCircle, to: '/settings' },
  ];

  const dismiss = () => {
    localStorage.removeItem(storageKey(uid));
    setDone(null);
  };

  const complete = (id: TaskId) => {
    const next = done.includes(id) ? done : [...done, id];
    if (next.length === TASKS.length) return dismiss();
    localStorage.setItem(storageKey(uid), JSON.stringify(next));
    setDone(next);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 my-4 p-5 rounded-2xl border border-primary/20 bg-primary/5"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="font-bold">Get started</p>
          <p className="text-sm text-white/50">{done.length} of {TASKS.length} done</p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {TASKS.map(task => {
          const isDone = done.includes(task.id);
          const className = `flex items-center gap-3 p-3 rounded-xl border text-sm font-medium text-left transition-colors ${
            isDone ? 'border-white/5 text-white/40 line-through' : 'border-white/10 bg-white/5 hover:border-primary/40'
          }`;
          const content = (
            <>
              <span className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${isDone ? 'bg-primary text-white' : 'bg-white/5 text-primary'}`}>
                {isDone ? <Check size={14} /> : <task.icon size={14} />}
              </span>
              {task.label}
            </>
          );
          return task.to ? (
            <Link key={task.id} to={task.to} onClick={() => complete(task.id)} className={className}>{content}</Link>
          ) : (
            <button key={task.id} onClick={() => { task.onClick?.(); complete(task.id); }} className={className}>{content}</button>
          );
        })}
      </div>
    </motion.div>
  );
}
