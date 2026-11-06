/**
 * Finds paid event registrations that were never paid for.
 *
 * The old EventDetails screen wrote `paid: true` on the client with no payment. Real tickets are
 * written by the server and always carry an `orderId`. So a registration with paid === true and no
 * orderId is one of the fake ones.
 *
 * Usage:
 *   npx tsx scripts/audit-paid-registrations.ts                 # report only (default)
 *   npx tsx scripts/audit-paid-registrations.ts --csv out.csv   # also write the list to a CSV for review
 *   npx tsx scripts/audit-paid-registrations.ts --remove        # delete the fake registrations
 *
 * --remove deletes each fake registration and decrements the event's attendeeCount.
 * Review the report (and CSV) first. Hosts may prefer to contact these attendees instead.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT (JSON) or GOOGLE_APPLICATION_CREDENTIALS
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';

const remove = process.argv.includes('--remove');
const csvIndex = process.argv.indexOf('--csv');
const csvPath = csvIndex > -1 ? process.argv[csvIndex + 1] : null;

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

const app = admin.initializeApp({
  credential: serviceAccount ? admin.credential.cert(JSON.parse(serviceAccount)) : admin.credential.applicationDefault(),
  projectId: config.projectId,
});
const firestore = getFirestore(app, config.firestoreDatabaseId);

interface Row {
  eventId: string;
  userId: string;
  amount: number;
  registeredAt: string;
  ref: DocumentReference;
}

async function main() {
  const snapshot = await firestore.collectionGroup('registrations').where('paid', '==', true).get();

  const fake: Row[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.orderId) continue; // Real, server-verified ticket.
    const eventId = doc.ref.parent.parent?.id;
    if (!eventId) continue;
    fake.push({
      eventId,
      userId: data.userId ?? doc.id,
      amount: Number(data.amount) || 0,
      registeredAt: data.registeredAt ?? '',
      ref: doc.ref,
    });
  }

  console.log(`Paid registrations: ${snapshot.size}. Without a payment record (fake): ${fake.length}.`);
  const byEvent = new Map<string, number>();
  for (const row of fake) byEvent.set(row.eventId, (byEvent.get(row.eventId) ?? 0) + 1);
  for (const [eventId, count] of byEvent) console.log(`  event ${eventId}: ${count}`);

  if (csvPath) {
    const lines = ['eventId,userId,amount,registeredAt', ...fake.map(r => [r.eventId, r.userId, r.amount, r.registeredAt].join(','))];
    fs.writeFileSync(csvPath, lines.join('\n'));
    console.log(`Wrote ${fake.length} rows to ${csvPath}`);
  }

  if (!remove) {
    if (fake.length) console.log('Nothing changed. Run with --remove to delete these registrations.');
    return;
  }

  let removed = 0;
  let failed = 0;
  for (const row of fake) {
    const eventRef = firestore.doc(`events/${row.eventId}`);
    try {
      await firestore.runTransaction(async tx => {
        const reg = await tx.get(row.ref);
        if (!reg.exists) return;
        tx.delete(row.ref);
        tx.update(eventRef, { attendeeCount: FieldValue.increment(-1) });
      });
      removed++;
    } catch (e) {
      failed++;
      console.error(`FAIL ${row.eventId}/${row.userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`Removed ${removed} fake registrations.${failed ? ` ${failed} failed.` : ''}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
