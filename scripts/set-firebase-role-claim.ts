/**
 * One-time script: set role: 'authenticated' custom claim on all Firebase users.
 * Required for Supabase third-party Firebase Auth integration.
 *
 * Usage:
 *   npm run db:claims            # apply to every Firebase user
 *   npm run db:claims -- --dry-run
 *
 * Credentials come from FIREBASE_SERVICE_ACCOUNT (JSON) in .env, or from
 * GOOGLE_APPLICATION_CREDENTIALS if that is set instead.
 *
 * Options:
 *   --dry-run   List users without updating claims
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const dryRun = process.argv.includes('--dry-run');
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: serviceAccount
      ? admin.credential.cert(JSON.parse(serviceAccount))
      : admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
}

const auth = admin.auth();

async function setRoleClaimForAllUsers() {
  let nextPageToken: string | undefined;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  do {
    const listResult = await auth.listUsers(1000, nextPageToken);

    for (const user of listResult.users) {
      const existingRole = user.customClaims?.role;

      if (existingRole === 'authenticated') {
        skipped++;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] Would set claim for ${user.uid} (${user.email})`);
        updated++;
        continue;
      }

      try {
        await auth.setCustomUserClaims(user.uid, {
          ...user.customClaims,
          role: 'authenticated',
        });
        console.log(`Set role claim for ${user.uid} (${user.email})`);
        updated++;
      } catch (err) {
        console.error(`Failed for ${user.uid}:`, err);
        errors++;
      }
    }

    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log('\nDone.');
  console.log(`Updated: ${updated}, Skipped (already set): ${skipped}, Errors: ${errors}`);

  if (dryRun) {
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('Note: users must re-authenticate or refresh tokens for claims to take effect.');
  }
}

setRoleClaimForAllUsers().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
