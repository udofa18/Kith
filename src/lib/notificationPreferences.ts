import type { Settings } from '../features/settings/types';

type NotificationSettings = Settings['notifications'];

/**
 * The notification settings of the signed-in user, mirrored outside React so
 * sound playback (which happens in Firestore listeners and effects) can honour
 * the same preferences the settings screen shows.
 */
let current: NotificationSettings | null = null;

export function applyNotificationPreferences(value: NotificationSettings | null | undefined): void {
  current = value ?? null;
}

export function clearNotificationPreferences(): void {
  current = null;
}

const toMinutes = (hhmm: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const minutesNow = (now: Date) => now.getHours() * 60 + now.getMinutes();

function isWithinQuietHours(settings: NotificationSettings, now: Date): boolean {
  const { enabled, start, end } = settings.quietHours;
  if (!enabled) return false;

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;

  const value = minutesNow(now);
  // A window such as 22:00 → 07:00 wraps past midnight.
  return startMinutes < endMinutes
    ? value >= startMinutes && value < endMinutes
    : value >= startMinutes || value < endMinutes;
}

function isPaused(settings: NotificationSettings, now: Date): boolean {
  return isPauseActive(settings.pauseUntil, now);
}

/** Pause windows are stored as an absolute ISO timestamp. */
export function isPauseActive(pauseUntil?: string | null, now = new Date()): boolean {
  if (!pauseUntil) return false;
  const until = Date.parse(pauseUntil);
  return Number.isFinite(until) && until > now.getTime();
}

/** True when a notification sound should play right now. */
export function canPlayNotificationSound(now = new Date()): boolean {
  if (!current) return true;
  if (!current.sound) return false;
  if (isPaused(current, now)) return false;
  if (isWithinQuietHours(current, now)) return false;
  return true;
}
