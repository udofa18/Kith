import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, BarChart2 } from 'lucide-react';

interface PollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (pollData: { question: string; options: string[]; expiresAt: string }) => void;
}

export default function CreatePollModal({ isOpen, onClose, onSubmit }: PollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState('24h');

  const handleAddOption = () => {
    if (options.length < 5) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || options.some(opt => !opt.trim())) return;

    let expiresAt;
    const now = new Date();
    switch (duration) {
      case '1h': expiresAt = new Date(now.getTime() + 60 * 60 * 1000); break;
      case '24h': expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); break;
      case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
      default: expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    onSubmit({
      question,
      options,
      expiresAt: expiresAt.toISOString()
    });
    setQuestion('');
    setOptions(['', '']);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-primary">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <BarChart2 size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Create Poll</h2>
                    <p className="text-[10px] uppercase tracking-widest font-bold opacity-40 text-white">Gather community feedback</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Question</label>
                  <input 
                    autoFocus
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What would you like to ask?"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Options</label>
                  {options.map((option, idx) => (
                    <div key={idx} className="relative group">
                      <input 
                        value={option}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                      {options.length > 2 && (
                        <button 
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 5 && (
                    <button 
                      type="button"
                      onClick={handleAddOption}
                      className="w-full py-4 border-2 border-dashed border-white/5 rounded-2xl text-white/20 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                    >
                      <Plus size={18} /> Add Option
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Duration</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['1h', '24h', '7d'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={`py-3 rounded-2xl font-bold text-xs transition-all ${
                          duration === d 
                            ? 'bg-primary text-white shadow-neon' 
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {d === '1h' ? '1 Hour' : d === '24h' ? '24 Hours' : '7 Days'}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={!question.trim() || options.some(opt => !opt.trim())}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black shadow-neon hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                >
                  <BarChart2 size={20} />
                  Create Poll
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
