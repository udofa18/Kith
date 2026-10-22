/**
 * Delta sync: re-export Firestore collections modified since last sync and upsert to Supabase.
 * Run nightly during dual_write phase to fix drift.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/firestore-to-postgres/delta-sync.ts [--since=2026-06-01T00:00:00Z]
 */

import admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import firebaseConfig from '../../firebase-applet-config.json' assert { type: 'json' };
import {
  firestoreUserToRow,
  firestorePostToRow,
  firestoreNotificationToRow,
} from '../../src/lib/db-mappers.js';

const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const sinceDate = sinceArg
  ? new Date(sinceArg.split('=')[1])
  : new Date(Date.now() - 24 * 60 * 60 * 1000);

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sinceTimestamp = Timestamp.fromDate(sinceDate);

async function syncCollection(
  collectionName: string,
  table: string,
  mapper: (id: string, data: Record<string, unknown>) => Record<string, unknown>
) {
  const snap = await db
    .collection(collectionName)
    .where('updatedAt', '>=', sinceTimestamp)
    .get()
    .catch(async () => {
      // Fallback: sync all if updatedAt index missing
      return db.collection(collectionName).get();
    });

  if (snap.empty) {
    console.log(`  ${collectionName}: 0 changes`);
    return 0;
  }

  const rows = snap.docs.map((doc) => mapper(doc.id, doc.data() as Record<string, unknown>));
  const { error } = await supabase.from(table).upsert(rows as never[], { onConflict: 'id' });

  if (error) {
    console.error(`  ${collectionName}: error - ${error.message}`);
    return 0;
  }

  console.log(`  ${collectionName}: ${rows.length} synced`);
  return rows.length;
}

async function main() {
  console.log(`Delta sync since ${sinceDate.toISOString()}\n`);

  const total =
    (await syncCollection('users', 'users', firestoreUserToRow)) +
    (await syncCollection('posts', 'posts', firestorePostToRow)) +
    (await syncCollection('notifications', 'notifications', firestoreNotificationToRow));

  console.log(`\nDelta sync complete. ${total} documents synced.`);
}

main().catch((err) => {
  console.error('Delta sync failed:', err);
  process.exit(1);
});
