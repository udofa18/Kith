import { format, isSameDay, isThisWeek, isThisYear, isToday, isYesterday } from 'date-fns';

/** Inbox timestamp: "14:05", "Mon", "Oct 3", "Oct 3, 2025". */
export function shortTime(date: Date | null): string {
  if (!date) return '';
  if (isToday(date)) return format(date, 'p');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEE');
  return isThisYear(date) ? format(date, 'MMM d') : format(date, 'MMM d, yyyy');
}

/** Divider between days in a chat. */
export function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return isThisYear(date) ? format(date, 'EEEE, MMMM d') : format(date, 'MMMM d, yyyy');
}

export const sameDay = (a: Date | null, b: Date | null) => !!a && !!b && isSameDay(a, b);

export const clock = (date: Date | null) => (date ? format(date, 'p') : '');

export function fileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const nameOf = (u: any) => u?.displayName || u?.username || 'Member';
export const photoOf = (u: any) => u?.profileImage || u?.photoURL || '';
