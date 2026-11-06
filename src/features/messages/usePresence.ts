import { useEffect } from 'react';
import { heartbeat } from './api';

const INTERVAL_MS = 2 * 60_000;

/**
 * Keeps `users/{uid}.lastActiveAt` fresh while the app is open and visible
 * ("Active now"). Pass `enabled = false` when the member has turned presence off.
 */
export function usePresence(uid: string | null | undefined, enabled = true) {
  useEffect(() => {
    if (!uid || !enabled) return;
    let last = 0;
    const beat = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < INTERVAL_MS / 2) return;
      last = Date.now();
      heartbeat(uid);
    };
    beat();
    const timer = setInterval(beat, INTERVAL_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [uid, enabled]);
}
