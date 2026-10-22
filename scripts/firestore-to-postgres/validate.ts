/**
 * Validate row counts between Firestore export summary and Supabase tables.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/firestore-to-postgres/validate.ts [--export-summary=./data/firestore-export/_summary.json]
 */

import fs from 'fs-extra';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const summaryArg = process.argv.find((a) => a.startsWith('--export-summary='));
const summaryPath =
  summaryArg?.split('=')[1] || path.join(process.cwd(), 'data', 'firestore-export', '_summary.json');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLE_MAP: Record<string, string> = {
  users: 'users',
  posts: 'posts',
  articles: 'articles',
  communities: 'communities',
  notifications: 'notifications',
  hashtags: 'hashtags',
  challenges: 'challenges',
  events: 'events',
  products: 'products',
  jobs: 'jobs',
  userInterests: 'user_interests',
  userEngagementProfiles: 'user_engagement_profiles',
  xpTransactions: 'xp_transactions',
  purchases: 'purchases',
};

async function countTable(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  if (!(await fs.pathExists(summaryPath))) {
    console.error(`Export summary not found: ${summaryPath}`);
    console.error('Run export.ts first.');
    process.exit(1);
  }

  const summary = await fs.readJson(summaryPath);
  const firestoreCounts = summary.counts as Record<string, number>;

  console.log('Collection          Firestore   Supabase   Match');
  console.log('──────────────────  ─────────   ────────   ─────');

  let allMatch = true;

  for (const [collection, table] of Object.entries(TABLE_MAP)) {
    const fsCount = firestoreCounts[collection] ?? 0;
    let sbCount = 0;

    try {
      sbCount = await countTable(table);
    } catch (err) {
      console.log(`${collection.padEnd(20)}${String(fsCount).padEnd(12)}ERROR`);
      allMatch = false;
      continue;
    }

    const match = fsCount === sbCount ? '✓' : '✗';
    if (fsCount !== sbCount) allMatch = false;

    console.log(
      `${collection.padEnd(20)}${String(fsCount).padEnd(12)}${String(sbCount).padEnd(11)}${match}`
    );
  }

  console.log(allMatch ? '\nAll counts match.' : '\nSome counts differ — review transform/load logs.');
  process.exit(allMatch ? 0 : 1);
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
