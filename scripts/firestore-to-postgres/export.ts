/**
 * Export all top-level Firestore collections to JSONL files.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
 *   npx tsx scripts/firestore-to-postgres/export.ts [--output=./data/export]
 *
 * Exports from the named Firestore database configured in firebase-applet-config.json.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs-extra';
import path from 'path';
import firebaseConfig from '../../firebase-applet-config.json' assert { type: 'json' };

const outputArg = process.argv.find((a) => a.startsWith('--output='));
const outputDir = outputArg?.split('=')[1] || path.join(process.cwd(), 'data', 'firestore-export');

const TOP_LEVEL_COLLECTIONS = [
  'users',
  'posts',
  'articles',
  'communities',
  'conversations',
  'notifications',
  'xpTransactions',
  'purchases',
  'hashtags',
  'challenges',
  'events',
  'products',
  'jobs',
  'userInterests',
  'userEngagementProfiles',
  'communityInvites',
  'reports',
  'callSessions',
  'eventSessions',
  'messages',
  'components',
  'feedCaches',
  'contentMetrics',
];

if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function exportCollection(collectionName: string) {
  const filePath = path.join(outputDir, `${collectionName}.jsonl`);
  const stream = fs.createWriteStream(filePath);
  let count = 0;

  const snapshot = await db.collection(collectionName).get();
  for (const doc of snapshot.docs) {
    const line = JSON.stringify({ id: doc.id, data: doc.data(), subcollections: {} });
    stream.write(line + '\n');
    count++;

    // Export known subcollections for users and posts
    if (collectionName === 'users') {
      const subNames = ['followers', 'following', 'bookmarks', 'blockedUsers', 'notificationPrefs'];
      for (const sub of subNames) {
        const subSnap = await doc.ref.collection(sub).get();
        for (const subDoc of subSnap.docs) {
          const subLine = JSON.stringify({
            parentCollection: 'users',
            parentId: doc.id,
            subcollection: sub,
            id: subDoc.id,
            data: subDoc.data(),
          });
          stream.write(subLine + '\n');
        }
      }
    }

    if (collectionName === 'posts') {
      for (const sub of ['comments', 'likes', 'views']) {
        const subSnap = await doc.ref.collection(sub).get();
        for (const subDoc of subSnap.docs) {
          stream.write(JSON.stringify({
            parentCollection: 'posts',
            parentId: doc.id,
            subcollection: sub,
            id: subDoc.id,
            data: subDoc.data(),
          }) + '\n');
        }
      }
    }

    if (collectionName === 'communities') {
      for (const sub of ['members', 'channels', 'categories', 'roles', 'joinRequests']) {
        const subSnap = await doc.ref.collection(sub).get();
        for (const subDoc of subSnap.docs) {
          stream.write(JSON.stringify({
            parentCollection: 'communities',
            parentId: doc.id,
            subcollection: sub,
            id: subDoc.id,
            data: subDoc.data(),
          }) + '\n');

          if (sub === 'channels') {
            const msgSnap = await subDoc.ref.collection('messages').get();
            for (const msgDoc of msgSnap.docs) {
              stream.write(JSON.stringify({
                parentCollection: 'communities',
                parentId: doc.id,
                subcollection: `channels/${subDoc.id}/messages`,
                id: msgDoc.id,
                data: msgDoc.data(),
              }) + '\n');
            }
          }
        }
      }
    }

    if (collectionName === 'conversations') {
      const msgSnap = await doc.ref.collection('messages').get();
      for (const msgDoc of msgSnap.docs) {
        stream.write(JSON.stringify({
          parentCollection: 'conversations',
          parentId: doc.id,
          subcollection: 'messages',
          id: msgDoc.id,
          data: msgDoc.data(),
        }) + '\n');
      }
    }
  }

  stream.end();
  return count;
}

async function main() {
  await fs.ensureDir(outputDir);
  console.log(`Exporting Firestore database: ${firebaseConfig.firestoreDatabaseId}`);
  console.log(`Output directory: ${outputDir}\n`);

  const summary: Record<string, number> = {};

  for (const collection of TOP_LEVEL_COLLECTIONS) {
    try {
      const count = await exportCollection(collection);
      summary[collection] = count;
      console.log(`  ${collection}: ${count} documents`);
    } catch (err) {
      console.warn(`  ${collection}: skipped (${err instanceof Error ? err.message : err})`);
      summary[collection] = 0;
    }
  }

  await fs.writeJson(path.join(outputDir, '_summary.json'), {
    exportedAt: new Date().toISOString(),
    databaseId: firebaseConfig.firestoreDatabaseId,
    projectId: firebaseConfig.projectId,
    counts: summary,
  });

  console.log('\nExport complete.');
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
