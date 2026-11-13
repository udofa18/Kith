/**
 * Repairs events that a live room ending marked as ended before their date.
 *
 * Ending a room used to write `status: 'ended'` and overwrite `endDate` with
 * "now" for every event, including scheduled ones a host opened early. Extending
 * the date in the edit form then could not revive the event because the status
 * stayed `ended`, hiding it from listings and showing an "Ended" banner.
 *
 * This script finds events whose stored status is `ended` while their scheduled
 * `endDate` is still in the future, recomputes the status from the schedule and
 * clears the stale `endedAt` marker. Events that are genuinely over are left
 * untouched.
 *
 * Usage:
 *   npx tsx scripts/repair-ended-events.ts          # report only (default)
 *   npx tsx scripts/repair-ended-events.ts --apply  # write the repair
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

const app = admin.initializeApp({
  credential: serviceAccount ? admin.credential.cert(JSON.parse(serviceAccount)) : admin.credential.applicationDefault(),
  projectId: config.projectId,
});
const firestore = getFirestore(app, config.firestoreDatabaseId);

interface Row {
  id: string;
  title?: string;
  status?: string;
  endDate?: unknown;
  startDate?: unknown;
}

const toMillis = (value: unknown): number => {
  if (typeof value === 'string') return new Date(value).getTime();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  return NaN;
};

async function main() {
  const snapshot = await firestore.collection('events').where('status', '==', 'ended').get();
  const now = Date.now();
  const broken: Row[] = [];

  snapshot.forEach((doc) => {
    const event = doc.data() as Row;
    const end = toMillis(event.endDate);
    if (Number.isFinite(end) && end > now) {
      broken.push({ ...event, id: doc.id });
    }
  });

  if (broken.length === 0) {
    console.log('No events need repair.');
    return;
  }

  console.log(`Found ${broken.length} event(s) marked ended with a future end date:\n`);
  broken.forEach((event) => {
    console.log(`- ${event.id}  ${event.title ?? '(untitled)'}  ends ${new Date(toMillis(event.endDate)).toISOString()}`);
  });

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to repair these events.');
    return;
  }

  let repaired = 0;
  for (const event of broken) {
    // The schedule is the source of truth. `upcoming` is correct for both a
    // future event and one inside its window; isLive derives the window itself.
    await firestore.collection('events').doc(event.id).update({
      status: 'upcoming',
      endedAt: FieldValue.delete(),
    });
    repaired += 1;
  }
  console.log(`\nRepaired ${repaired} event(s).`);
}

main().catch((error) => {
  console.error('Repair failed:', error);
  process.exitCode = 1;
});
