/**
 * Synthesized reaction sounds for live rooms.
 *
 * Everything is generated with the Web Audio API so the app ships no extra
 * audio files and a reaction never waits on a network request. Every call
 * starts from a tap, which is what browsers require before audio may play.
 */

export type ReactionSound = 'clap' | 'laugh' | 'drums' | 'fire';

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface BurstOptions {
  gain?: number;
  frequency?: number;
  q?: number;
  type?: BiquadFilterType;
  sweepTo?: number;
}

/** A short filtered-noise hit: applause, snare, crackle. */
function noiseBurst(ctx: AudioContext, at: number, duration: number, options: BurstOptions = {}) {
  const { gain = 0.14, frequency = 1200, q = 0.9, type = 'bandpass', sweepTo } = options;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, duration);

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, at);
  filter.Q.value = q;
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + duration);

  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(filter).connect(volume).connect(ctx.destination);
  source.start(at);
  source.stop(at + duration);
}

function tone(
  ctx: AudioContext,
  at: number,
  duration: number,
  options: { from: number; to?: number; gain?: number; type?: OscillatorType },
) {
  const { from, to, gain = 0.06, type = 'triangle' } = options;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  volume.gain.setValueAtTime(0.0001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(volume).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

/** A filtered "ha" syllable: a sawtooth through a formant-ish bandpass. */
function laughSyllable(ctx: AudioContext, at: number, base: number, gain: number) {
  const oscillator = ctx.createOscillator();
  const formant = ctx.createBiquadFilter();
  const volume = ctx.createGain();

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(base + Math.random() * 24, at);
  oscillator.frequency.exponentialRampToValueAtTime(base * 0.62, at + 0.16);

  formant.type = 'bandpass';
  formant.frequency.value = 780 + Math.random() * 340;
  formant.Q.value = 2.4;

  volume.gain.setValueAtTime(0.0001, at);
  volume.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);

  oscillator.connect(formant).connect(volume).connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.2);
}

const SOUNDS: Record<ReactionSound, (ctx: AudioContext, at: number) => void> = {
  // A crowd applauding for ~2 seconds: a soft roar bed with dozens of
  // overlapping claps at random pitches.
  clap(ctx, at) {
    noiseBurst(ctx, at + 0.02, 1.9, { gain: 0.035, frequency: 900, q: 0.5, type: 'lowpass' });
    for (let i = 0; i < 46; i += 1) {
      const hit = at + Math.random() * 1.85;
      noiseBurst(ctx, hit, 0.05 + Math.random() * 0.06, {
        gain: 0.04 + Math.random() * 0.075,
        frequency: 1100 + Math.random() * 1500,
        q: 0.7 + Math.random(),
      });
    }
  },
  // A group laugh: three staggered voices, each a string of "ha" syllables.
  laugh(ctx, at) {
    [0, 0.07, 0.15].forEach((start, voice) => {
      const base = 300 - voice * 42;
      const gain = 0.05 - voice * 0.009;
      [0, 0.21, 0.42, 0.63, 0.85, 1.06].forEach((offset, index) => {
        if (Math.random() > 0.88) return;
        const syllableAt = at + start + offset + Math.random() * 0.04;
        laughSyllable(ctx, syllableAt, base - index * 4, gain);
        noiseBurst(ctx, syllableAt, 0.05, {
          gain: 0.018,
          frequency: 1700 + Math.random() * 900,
          q: 0.9,
        });
      });
    });
  },
  // A snare drum roll that accelerates and lands on a kick, ~2 seconds.
  drums(ctx, at) {
    let hit = at;
    for (let i = 0; i < 26; i += 1) {
      const progress = i / 26;
      noiseBurst(ctx, hit, 0.075, {
        gain: 0.045 + progress * 0.05,
        frequency: 1800 + Math.random() * 800,
        q: 0.8,
      });
      if (i % 4 === 0) {
        tone(ctx, hit, 0.09, { from: 185, to: 92, gain: 0.045, type: 'sine' });
      }
      hit += 0.085 - progress * 0.03;
    }
    tone(ctx, hit + 0.04, 0.24, { from: 160, to: 46, gain: 0.2, type: 'sine' });
    noiseBurst(ctx, hit + 0.04, 0.2, { gain: 0.09, frequency: 2000, q: 0.8 });
  },
  fire(ctx, at) {
    noiseBurst(ctx, at, 1.2, { gain: 0.05, frequency: 900, q: 0.6, sweepTo: 260, type: 'lowpass' });
    for (let i = 0; i < 10; i += 1) {
      noiseBurst(ctx, at + Math.random() * 1.1, 0.04, {
        gain: 0.04,
        frequency: 2200 + Math.random() * 1600,
        q: 2,
      });
    }
  },
};

/** Plays one of the synthesized reaction sounds. No-op when audio is unavailable. */
export function playReactionSound(kind: ReactionSound) {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    SOUNDS[kind](ctx, ctx.currentTime + 0.01);
  } catch {
    // Sound is a bonus; the reaction animation still plays.
  }
}
