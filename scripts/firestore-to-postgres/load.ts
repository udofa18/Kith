/**
 * Load transformed JSONL data into Supabase Postgres.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/firestore-to-postgres/load.ts [--input=./data/transformed]
 *
 * Loads in FK order: users → content → junction/child tables.
 */

import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

const inputArg = process.argv.find((a) => a.startsWith('--input='));
const inputDir = inputArg?.split('=')[1] || path.join(process.cwd(), 'data', 'transformed');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const LOAD_ORDER = [
  'users',
  'communities',
  'community_members',
  'channels',
  'posts',
  'post_comments',
  'post_likes',
  'articles',
  'notifications',
  'hashtags',
  'user_interests',
  'user_engagement_profiles',
  'user_blocked_users',
  'channel_messages',
  'conversations',
  'conversation_messages',
  'xp_transactions',
  'purchases',
  'challenges',
  'events',
  'products',
  'jobs',
];

async function readJsonl(filePath: string): Promise<Record<string, unknown>[]> {
  if (!(await fs.pathExists(filePath))) return [];

  const rows: Record<string, unknown>[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

async function upsertBatch(table: string, rows: Record<string, unknown>[], batchSize = 500) {
  let loaded = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch as never[], { onConflict: 'id' });

    if (error) {
      // community_members uses composite PK
      if (table === 'community_members') {
        const { error: err2 } = await supabase.from(table).upsert(batch as never[], {
          onConflict: 'community_id,user_id',
        });
        if (err2) {
          console.error(`  Batch error (${table}):`, err2.message);
          errors += batch.length;
          continue;
        }
      } else if (table === 'post_likes' || table === 'user_blocked_users') {
        const { error: err2 } = await supabase.from(table).upsert(batch as never[]);
        if (err2) {
          console.error(`  Batch error (${table}):`, err2.message);
          errors += batch.length;
          continue;
        }
      } else {
        console.error(`  Batch error (${table}):`, error.message);
        errors += batch.length;
        continue;
      }
    }
    loaded += batch.length;
  }

  return { loaded, errors };
}

async function main() {
  console.log(`Loading from: ${inputDir}\n`);

  const results: Record<string, { loaded: number; errors: number }> = {};

  for (const table of LOAD_ORDER) {
    const filePath = path.join(inputDir, `${table}.jsonl`);
    const rows = await readJsonl(filePath);

    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (skipped)`);
      continue;
    }

    const { loaded, errors } = await upsertBatch(table, rows);
    results[table] = { loaded, errors };
    console.log(`  ${table}: ${loaded} loaded, ${errors} errors`);
  }

  await fs.writeJson(path.join(inputDir, '_load_summary.json'), {
    loadedAt: new Date().toISOString(),
    results,
  });

  console.log('\nLoad complete.');
}

main().catch((err) => {
  console.error('Load failed:', err);
  process.exit(1);
});
