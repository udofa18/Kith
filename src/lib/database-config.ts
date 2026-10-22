/**
 * Phased cutover configuration for Firestore → Supabase migration.
 *
 * - firestore:       reads and writes go to Firestore only (legacy)
 * - dual_write:      writes go to both; reads from Firestore (default during migration)
 * - supabase_reads:  writes to both; reads from Supabase
 * - supabase:        reads and writes go to Supabase only (final state)
 */
export type DatabasePhase = 'firestore' | 'dual_write' | 'supabase_reads' | 'supabase';

const phase = (import.meta.env.VITE_DB_PHASE as DatabasePhase) || 'dual_write';

export const DB_PHASE: DatabasePhase = phase;

export function shouldReadFromSupabase(): boolean {
  return phase === 'supabase_reads' || phase === 'supabase';
}

export function shouldWriteToSupabase(): boolean {
  return phase === 'dual_write' || phase === 'supabase_reads' || phase === 'supabase';
}

export function shouldWriteToFirestore(): boolean {
  return phase === 'firestore' || phase === 'dual_write' || phase === 'supabase_reads';
}

export function shouldReadFromFirestore(): boolean {
  return phase === 'firestore' || phase === 'dual_write';
}

/** Per-collection read overrides (Phase C: flip low-risk collections first) */
const supabaseReadCollections = new Set(
  (import.meta.env.VITE_SUPABASE_READ_COLLECTIONS || 'notifications,hashtags,user_interests,user_engagement_profiles')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

export function shouldReadCollectionFromSupabase(collection: string): boolean {
  if (phase === 'supabase') return true;
  if (phase === 'supabase_reads') return true;
  if (phase === 'dual_write' && supabaseReadCollections.has(collection)) return true;
  return false;
}
