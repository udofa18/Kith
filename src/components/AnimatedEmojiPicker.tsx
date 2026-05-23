import SafeAnimatedEmoji from './SafeAnimatedEmoji';
import { X } from 'lucide-react';

const ANIMATED_EMOJIS = [
  'smile', 'grin', 'sweat', 'party-popper', 'rocket', 'sparkles', 
  'thumbs-up', 'monkey', 'robot', 'turtle', 'snowflake', 'bell'
] as const;

type EmojiType = typeof ANIMATED_EMOJIS[number];

interface AnimatedEmojiPickerProps {
  onSelect: (emoji: EmojiType) => void;
  onClose: () => void;
}

export default function AnimatedEmojiPicker({ onSelect, onClose }: AnimatedEmojiPickerProps) {
  return (
    <div className="bg-white dark:bg-black/90 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-3xl p-4 w-72 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-xs font-bold uppercase tracking-widest text-black/40 dark:text-white/40">Animated Emojis</h3>
        <button onClick={onClose} className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg text-black/40 dark:text-white/40 transition-colors">
          <X size={14} />
        </button>
      </div>
      
      <div className="grid grid-cols-4 gap-2">
        {ANIMATED_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="aspect-square flex items-center justify-center rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all hover:scale-110 group"
          >
            <div className="w-14 h-14 pointer-events-none">
              <SafeAnimatedEmoji emoji={emoji} />
            </div>
          </button>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5 text-[10px] text-center text-black/20 dark:text-white/20 italic">
        Powered by Remotion
      </div>
    </div>
  );
}
