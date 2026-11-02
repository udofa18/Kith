import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart2, Plus, Trash2, X } from 'lucide-react';

interface PollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pollData: { question: string; options: string[]; expiresAt: string }) => void;
}

const DURATIONS = [
  { id: '1h', label: '1 hour', ms: 3600e3 },
  { id: '24h', label: '1 day', ms: 86400e3 },
  { id: '3d', label: '3 days', ms: 3 * 86400e3 },
  { id: '7d', label: '1 week', ms: 7 * 86400e3 },
];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const field = 'w-full rounded-lg bg-background border border-black/15 dark:border-white/15 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30';

export default function CreatePollModal({ isOpen, onClose, onSubmit }: PollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState('24h');

  useEffect(() => {
    if (!isOpen) return;
    setQuestion(''); setOptions(['', '']); setDuration('24h');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const cleaned = options.map(o => o.trim()).filter(Boolean);
  const duplicate = new Set(cleaned.map(o => o.toLowerCase())).size !== cleaned.length;
  const problem = !question.trim() ? 'Ask a question.'
    : cleaned.length < MIN_OPTIONS ? 'Add at least two options.'
    : duplicate ? 'Each option must be different.'
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    onSubmit({
      question: question.trim(),
      options: cleaned,
      expiresAt: new Date(Date.now() + (DURATIONS.find(d => d.id === duration)?.ms ?? 86400e3)).toISOString(),
    });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="poll-title"
        className="w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md flex flex-col bg-background text-black dark:text-white sm:rounded-2xl sm:border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="shrink-0 px-5 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><BarChart2 size={18} /></span>
            <div>
              <h2 id="poll-title" className="font-semibold leading-tight">Create a poll</h2>
              <p className="text-xs text-black/50 dark:text-white/50">Members pick one option. They can change their vote until it closes.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Question</span>
            <input autoFocus value={question} onChange={e => setQuestion(e.target.value)} maxLength={200} placeholder="What would you like to ask?" className={`mt-1.5 ${field}`} />
          </label>

          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Options</legend>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input value={opt} onChange={e => setOptions(options.map((o, j) => j === i ? e.target.value : o))} maxLength={80} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className={field} />
                  {options.length > MIN_OPTIONS && (
                    <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`} className="p-2 rounded-lg text-black/40 dark:text-white/40 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <button type="button" onClick={() => setOptions([...options, ''])} className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><Plus size={15} />Add option</button>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Closes after</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {DURATIONS.map(d => (
                <button key={d.id} type="button" role="radio" aria-checked={duration === d.id} onClick={() => setDuration(d.id)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${duration === d.id ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-black/15 dark:border-white/15 hover:border-black/30 dark:hover:border-white/30'}`}>{d.label}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-3">
          <p className={`text-sm ${problem && (question || cleaned.length) ? 'text-black/55 dark:text-white/55' : 'text-transparent'}`}>{problem || '.'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white">Cancel</button>
            <button type="submit" disabled={!!problem} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">Post poll</button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
