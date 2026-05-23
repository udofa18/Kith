import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: any, formatStr: string = 'MMM d, yyyy'): string {
  if (!date) return 'N/A';
  
  let d: Date;
  // Handle Firestore Timestamp
  if (date?.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date?.seconds !== undefined) {
    d = new Date(date.seconds * 1000);
  } else if (date instanceof Date) {
    d = date;
  } else {
    // Attempt to parse string or number
    d = new Date(date);
  }

  if (!isValid(d)) return 'N/A';
  return format(d, formatStr);
}
