/**
 * Reaction sounds for live rooms.
 *
 * The four clips in `public/sounds/reactions` are trimmed to under three
 * seconds. They are preloaded when the live page loads so the first tap plays
 * immediately, and every tap gets its own Audio element so reactions can
 * overlap instead of cutting each other off.
 */

export type ReactionSound = 'clap' | 'laugh' | 'drums' | 'fire';

interface ReactionFile {
  src: string;
  volume: number;
}

const FILES: Record<ReactionSound, ReactionFile> = {
  clap: { src: '/sounds/reactions/applause.m4a', volume: 0.55 },
  laugh: { src: '/sounds/reactions/laugh.m4a', volume: 0.6 },
  drums: { src: '/sounds/reactions/drumroll.m4a', volume: 0.65 },
  fire: { src: '/sounds/reactions/fire.m4a', volume: 0.45 },
};

/** Fade the last third of a second so a clip never ends on a hard cut. */
const FADE_MS = 320;
/** Mobile browsers limit simultaneous media elements, so retire the oldest. */
const MAX_ACTIVE = 6;

const active = new Set<HTMLAudioElement>();
let preloaded = false;

function preload() {
  if (preloaded || typeof Audio === 'undefined') return;
  preloaded = true;
  Object.values(FILES).forEach(({ src }) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = src;
    audio.load();
  });
}

function scheduleFade(audio: HTMLAudioElement, volume: number) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const fadeStartMs = Math.max(0, (audio.duration - FADE_MS / 1000) * 1000);
  const delay = fadeStartMs - audio.currentTime * 1000;

  window.setTimeout(() => {
    const started = performance.now();
    const step = () => {
      const progress = Math.min(1, (performance.now() - started) / FADE_MS);
      audio.volume = Math.max(0, volume * (1 - progress));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, Math.max(0, delay));
}

/** Plays one reaction clip. No-op when audio is unavailable or blocked. */
export function playReactionSound(kind: ReactionSound) {
  if (typeof Audio === 'undefined') return;
  const file = FILES[kind];

  // Keep the number of live elements low on phones.
  if (active.size >= MAX_ACTIVE) {
    const oldest = active.values().next().value;
    if (oldest) {
      oldest.pause();
      active.delete(oldest);
    }
  }

  const audio = new Audio(file.src);
  audio.preload = 'auto';
  audio.volume = file.volume;
  active.add(audio);

  const release = () => {
    active.delete(audio);
  };
  audio.addEventListener('ended', release, { once: true });
  audio.addEventListener('error', release, { once: true });

  if (audio.readyState >= 1) {
    scheduleFade(audio, file.volume);
  } else {
    audio.addEventListener('loadedmetadata', () => scheduleFade(audio, file.volume), { once: true });
  }

  audio.play().catch(() => {
    // Autoplay was blocked or the file failed; the reaction bubble still plays.
    release();
  });
}

preload();
