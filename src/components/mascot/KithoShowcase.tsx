import { useRef, useState } from 'react';
import { HeartHandshake, PartyPopper, Sparkles, Hand } from 'lucide-react';
import { Badge, Button, Card, CardEyebrow } from '../ui';
import { cn } from '../../lib/cn';
import Kitho, {
  KITHO_ACTIONS,
  KITHO_ACTION_LABELS,
  KITHO_MOODS,
  KITHO_MOOD_LABELS,
  type KithoAction,
  type KithoHandle,
  type KithoMood,
} from './Kitho';

const ACTION_ICONS: Record<KithoAction, typeof Hand> = {
  wave: Hand,
  celebrate: PartyPopper,
  surprise: Sparkles,
  encourage: HeartHandshake,
};

export default function KithoShowcase() {
  const kitho = useRef<KithoHandle>(null);
  const [mood, setMood] = useState<KithoMood>('idle');
  const [lastAction, setLastAction] = useState<KithoAction | null>(null);

  const play = (action: KithoAction) => {
    kitho.current?.play(action);
    setLastAction(action);
  };

  return (
    <Card variant="elevated" className="overflow-hidden p-0">
      <div className="grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="relative flex items-center justify-center overflow-hidden border-b border-border bg-[radial-gradient(circle_at_50%_32%,rgba(182,156,255,0.2),transparent_62%),radial-gradient(circle_at_72%_82%,rgba(130,230,200,0.14),transparent_58%)] p-5 sm:border-b-0 sm:border-r">
          <Kitho ref={kitho} mood={mood} size={260} />
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div>
            <CardEyebrow>Mood</CardEyebrow>
            <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Kitho mood">
              {KITHO_MOODS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mood === option}
                  onClick={() => setMood(option)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors',
                    mood === option
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                  )}
                >
                  {KITHO_MOOD_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <CardEyebrow>Actions</CardEyebrow>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {KITHO_ACTIONS.map((action) => {
                const Icon = ACTION_ICONS[action];
                return (
                  <Button
                    key={action}
                    variant="outline"
                    size="sm"
                    leftIcon={<Icon size={15} />}
                    onClick={() => play(action)}
                  >
                    {KITHO_ACTION_LABELS[action]}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Badge variant="primary" dot>
              {KITHO_MOOD_LABELS[mood]}
            </Badge>
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              {lastAction
                ? `${KITHO_ACTION_LABELS[lastAction]} plays once, then returns to ${KITHO_MOOD_LABELS[mood].toLowerCase()}.`
                : 'Actions are one-shot overlays; the mood keeps breathing underneath.'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
