import {
  shouldReadFromSupabase,
  shouldWriteToSupabase,
  shouldWriteToFirestore,
  shouldReadFromFirestore,
  shouldReadCollectionFromSupabase,
} from '../../lib/database-config';

export async function dualWrite<T>(
  firestoreFn: () => Promise<T>,
  supabaseFn: () => Promise<T>,
  label: string
): Promise<T> {
  const writeFs = shouldWriteToFirestore();
  const writeSb = shouldWriteToSupabase();

  if (writeFs && writeSb) {
    const [fsResult, sbResult] = await Promise.allSettled([firestoreFn(), supabaseFn()]);
    if (fsResult.status === 'rejected') console.warn(`[dual-write] Firestore ${label} failed:`, fsResult.reason);
    if (sbResult.status === 'rejected') console.warn(`[dual-write] Supabase ${label} failed:`, sbResult.reason);
    if (fsResult.status === 'fulfilled') return fsResult.value;
    if (sbResult.status === 'fulfilled') return sbResult.value;
    throw fsResult.reason;
  }

  if (writeSb) return supabaseFn();
  return firestoreFn();
}

export async function dualRead<T>(
  firestoreFn: () => Promise<T>,
  supabaseFn: () => Promise<T>,
  collection?: string
): Promise<T> {
  const useSupabase =
    shouldReadFromSupabase() ||
    (collection !== undefined && shouldReadCollectionFromSupabase(collection));

  if (useSupabase) {
    try {
      return await supabaseFn();
    } catch (err) {
      if (shouldReadFromFirestore()) {
        console.warn(`[dual-read] Supabase failed for ${collection}, falling back to Firestore:`, err);
        return firestoreFn();
      }
      throw err;
    }
  }

  return firestoreFn();
}

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}
