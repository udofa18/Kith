/**
 * Moves existing product files from the public `products/` folder into the private
 * `private_products/` folder, then mirrors each product into Supabase so downloads go through
 * the secure route (api/_lib/downloads.ts).
 *
 * Usage:
 *   npx tsx scripts/migrate-product-files.ts                              # dry run: prints the plan only
 *   npx tsx scripts/migrate-product-files.ts --apply                      # copies files, updates Supabase
 *   npx tsx scripts/migrate-product-files.ts --apply --delete-originals   # also deletes the public originals
 *
 * Safe to re-run: products already in `private_products/` are skipped, and copies overwrite identically.
 * Run --delete-originals only after checking the dry run and a few downloads.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS
 *   FIREBASE_STORAGE_BUCKET (optional, defaults to firebase-applet-config.json)
 *   SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const deleteOriginals = process.argv.includes('--delete-originals');

if (deleteOriginals && !apply) {
  console.error('--delete-originals only works together with --apply');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || config.storageBucket;
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

const app = admin.initializeApp({
  credential: serviceAccount ? admin.credential.cert(JSON.parse(serviceAccount)) : admin.credential.applicationDefault(),
  projectId: config.projectId,
  storageBucket: bucketName,
});
const firestore = getFirestore(app, config.firestoreDatabaseId);
const bucket = admin.storage().bucket(bucketName);

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Firebase download URLs look like .../o/<encoded storage path>?alt=media&token=... */
function storagePathFromUrl(url?: string): string | null {
  const match = url?.match(/\/o\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function main() {
  console.log(apply ? 'APPLYING' : 'DRY RUN (no changes)', `· bucket: ${bucketName}`);
  const snapshot = await firestore.collection('products').get();
  const totals = { planned: 0, migrated: 0, skipped: 0, failed: 0 };

  for (const doc of snapshot.docs) {
    const p = doc.data();
    const productId = doc.id;
    const oldPath = storagePathFromUrl(p.fileUrl);

    if (!oldPath) {
      totals.skipped++;
      console.log(`SKIP   ${productId}: no file`);
      continue;
    }
    if (oldPath.startsWith('private_products/')) {
      totals.skipped++;
      console.log(`SKIP   ${productId}: already private`);
      continue;
    }
    if (!p.creatorUid) {
      totals.skipped++;
      console.log(`SKIP   ${productId}: no creatorUid`);
      continue;
    }
    const price = Number(p.price) || 0;
    if (price > 0 && !p.currency) {
      totals.skipped++;
      console.log(`SKIP   ${productId}: paid but has no currency. Re-save it in the editor first.`);
      continue;
    }

    const fileName = oldPath.split('/').pop() || 'download';
    const newPath = `private_products/${p.creatorUid}/${fileName}`;
    totals.planned++;

    if (!apply) {
      console.log(`PLAN   ${productId}: ${oldPath} -> ${newPath}`);
      continue;
    }

    try {
      const [exists] = await bucket.file(oldPath).exists();
      if (!exists) throw new Error('original file is missing from Storage');

      await bucket.file(oldPath).copy(bucket.file(newPath));

      const { error: productError } = await supabase.from('products').upsert(
        {
          id: productId,
          creator_uid: p.creatorUid,
          creator_name: p.creatorName || 'Anonymous',
          title: p.title || 'Untitled',
          description: p.description ?? '',
          product_type: p.productType ?? 'other',
          category: p.category ?? p.productType ?? 'other',
          tags: Array.isArray(p.tags) ? p.tags : [],
          price_cents: Math.round(price * 100),
          currency: p.currency || 'NGN',
          cover_url: typeof p.previewImage === 'string' && p.previewImage.startsWith('https://') ? p.previewImage : null,
          status: 'published',
        },
        { onConflict: 'id' },
      );
      if (productError) throw new Error(`products: ${productError.message}`);

      const { error: deleteError } = await supabase.from('product_files').delete().eq('product_id', productId);
      if (deleteError) throw new Error(`product_files delete: ${deleteError.message}`);

      const { error: insertError } = await supabase.from('product_files').insert({
        product_id: productId,
        storage_path: newPath,
        file_name: fileName.replace(/^\d+_/, ''),
        position: 0,
      });
      if (insertError) throw new Error(`product_files insert: ${insertError.message}`);

      if (deleteOriginals) await bucket.file(oldPath).delete();

      totals.migrated++;
      console.log(`DONE   ${productId}`);
    } catch (e) {
      totals.failed++;
      console.error(`FAIL   ${productId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\nSummary:', apply ? { migrated: totals.migrated, skipped: totals.skipped, failed: totals.failed } : { planned: totals.planned, skipped: totals.skipped });
  if (!apply) console.log('Run again with --apply to copy the files.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
