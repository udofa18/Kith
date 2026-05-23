
export const NOTIFICATION_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

let audioContextUnlocked = false;

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
      console.log('Audio system unlocked');
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    })
    .catch(() => {
      // Still blocked, will try again on next interaction
    });
};

export const playNotificationSound = () => {
  try {
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.volume = 0.4;
    audio.play().catch(err => {
      console.warn('Audio playback blocked: User must interact with the page first.', err.message);
    });
  } catch (error) {
    console.error('Error playing sound:', error);
  }
};
