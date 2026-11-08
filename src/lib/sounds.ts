import { canPlayNotificationSound } from './notificationPreferences';

/** Bundled so the chime never depends on a third-party CDN or offline cache. */
export const NOTIFICATION_SOUND = '/sounds/notification.wav';

let audioContextUnlocked = false;
let notificationAudio: HTMLAudioElement | null = null;

/**
 * Browsers block audio until the user interacts with the page.
 * This function "warms up" the audio system on the first user interaction.
 */
export const unlockAudio = () => {
  if (audioContextUnlocked) return;

  const audio = new Audio(NOTIFICATION_SOUND);
  audio.volume = 0; // Silent play to unlock
  audio.play()
    .then(() => {
      audioContextUnlocked = true;
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    })
    .catch(() => {
      // Still blocked, will try again on next interaction
    });
};

/**
 * Plays the chime when the user's notification preferences allow it.
 * Pass `force` to preview the sound from settings.
 */
export const playNotificationSound = (force = false) => {
  if (!force && !canPlayNotificationSound()) return;

  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SOUND);
      notificationAudio.preload = 'auto';
    }

    notificationAudio.currentTime = 0;
    notificationAudio.volume = 0.4;
    notificationAudio.play().catch((error) => {
      console.warn('Audio playback blocked: User must interact with the page first.', error.message);
    });
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};
