import type { ReactionSound } from './reactionSounds';

export interface SoundReaction {
  emoji: string;
  label: string;
  sound: ReactionSound;
}

/**
 * Reactions with a sound attached. These lead the live reaction bar and show a
 * little waveform so it is obvious they play audio as well as float.
 */
export const SOUND_REACTIONS: SoundReaction[] = [
  { emoji: '👏', label: 'Applause', sound: 'clap' },
  { emoji: '😂', label: 'Laugh', sound: 'laugh' },
  { emoji: '🥁', label: 'Drumroll', sound: 'drums' },
  { emoji: '🔥', label: 'Fire', sound: 'fire' },
];

/** Silent quick reactions that follow the sound tiles. */
export const QUIET_REACTIONS = ['😂', '🔥', '👏', '👍', '🍿', '🎉', '🚀', '😍', '💯', '🙌', '❤️'] as const;
