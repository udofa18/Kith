/**
 * Ship-log streaks: consecutive days (in the user's local time) with at least one ship log.
 * Stored on users/{uid}.streak and updated by the author when they post a ship log.
 */
import { doc, increment, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export interface Streak {
  current: number;
  longest: number;
  /** Local date of the most recent ship log, YYYY-MM-DD. */
  lastDay: string;
  /** Recent days with a ship log, newest first (capped). */
  days: string[];
}

export const SHIPLOG_XP = 10;
const RECENT_DAYS = 30;

export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** Streak after shipping on `today`. Shipping twice in one day doesn't double count. */
export function advanceStreak(prev: Streak | null | undefined, today = dayKey()): Streak {
  if (prev?.lastDay === today) return prev;
  const current = prev?.lastDay === previousDay(today) ? prev.current + 1 : 1;
  return {
    current,
    longest: Math.max(prev?.longest ?? 0, current),
    lastDay: today,
    days: [today, ...(prev?.days ?? [])].slice(0, RECENT_DAYS),
  };
}

/** The streak as it stands today: it's still alive if they shipped today or yesterday. */
export function activeStreak(streak: Streak | null | undefined, today = dayKey()): number {
  if (!streak) return 0;
  return streak.lastDay === today || streak.lastDay === previousDay(today) ? streak.current : 0;
}

export const shippedToday = (streak: Streak | null | undefined, today = dayKey()) => streak?.lastDay === today;

/** Last `n` days (oldest first) with whether a ship log was posted, for the streak dots. */
export function recentDays(streak: Streak | null | undefined, n = 7, today = new Date()): { key: string; shipped: boolean }[] {
  const shipped = new Set(streak?.days ?? []);
  return Array.from({ length: n }, (_, i) => {
    const key = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i)));
    return { key, shipped: shipped.has(key) };
  });
}

/** Persist the new streak and grant the daily ship-log XP (once per day). */
export async function recordShipLog(uid: string, prev: Streak | null | undefined): Promise<Streak> {
  const next = advanceStreak(prev);
  if (next === prev) return next;
  await updateDoc(doc(db, 'users', uid), { streak: next, xp: increment(SHIPLOG_XP) });
  return next;
}
