import { useState } from 'react';
import { Check } from 'lucide-react';
import { TOPIC_GROUPS, RECOMMENDED_TOPIC_COUNT } from '../../lib/onboarding-topics';
import StepLayout from './StepLayout';

interface TopicsStepProps {
  initial: string[];
  onNext: (topics: string[]) => Promise<void>;
  onSkip: () => Promise<void>;
  onBack: () => void;
}

export default function TopicsStep({ initial, onNext, onSkip, onBack }: TopicsStepProps) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);

  const toggle = (topic: string) =>
    setSelected(prev => (prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const remaining = RECOMMENDED_TOPIC_COUNT - selected.length;

  return (
    <StepLayout
      title="What are you into?"
      subtitle="We'll use this to tune your feed and suggest people to follow."
      onBack={onBack}
      onSkip={() => run(onSkip)}
      primaryLabel="Continue"
      onPrimary={() => run(() => onNext(selected))}
      primaryDisabled={selected.length === 0}
      busy={busy}
    >
      <p className="text-sm mb-6 text-white/50" aria-live="polite">
        {remaining > 0
          ? `Pick ${remaining} more for better recommendations.`
          : <span className="text-primary font-semibold">{selected.length} selected. Nice.</span>}
      </p>

      <div className="space-y-6 max-h-[52vh] overflow-y-auto pr-1 -mr-1 custom-scrollbar">
        {TOPIC_GROUPS.map(group => (
          <section key={group.label}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">{group.label}</h2>
            <div className="flex flex-wrap gap-2">
              {group.topics.map(topic => {
                const isSelected = selected.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => toggle(topic)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary border-primary text-white'
                        : 'bg-white/5 border-white/10 text-white/70 hover:border-white/30'
                    }`}
                  >
                    {isSelected && <Check size={14} />}
                    {topic}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </StepLayout>
  );
}
