/**
 * Event boosts (paid promotion), shared by api/boost-*.ts (Vercel) and server.ts (local dev).
 *
 * - Prices live here only; the client sends a tier id, never an amount.
 * - Only a host/co-host of a public, not-yet-ended event can start checkout.
 * - Promotion is written here with the Admin SDK after Stripe confirms payment. Firestore rules
 *   stop clients from writing `promotion`, and `boosts/{sessionId}` makes confirmation idempotent.
 *
 * Needs STRIPE_SECRET_KEY, and on Vercel FIREBASE_SERVICE_ACCOUNT (service account JSON) so the
 * Admin SDK can write Firestore. Locally it falls back to application default credentials.
 */
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0475896362';
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-a6c9e366-2e98-4fcd-bf9b-04eac80f64b4';
const DAY = 86_400_000;

export const BOOST_TIERS = {
  feed_3d: { label: 'Feed boost · 3 days', placement: 'feed', days: 3, cents: 900 },
  spotlight_3d: { label: 'Spotlight · 3 days', placement: 'spotlight', days: 3, cents: 2900 },
  spotlight_7d: { label: 'Spotlight · 7 days', placement: 'spotlight', days: 7, cents: 5900 },
} as const;
export type BoostTierId = keyof typeof BOOST_TIERS;

export interface BoostResult {
  status: number;
  body: Record<string, unknown>;
}
const fail = (status: number, error: string): BoostResult => ({ status, body: { error } });

function adminApp() {
  if (admin.apps.length === 0) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp(
      sa
        ? { credential: admin.credential.cert(JSON.parse(sa)), projectId: PROJECT_ID }
        : { credential: admin.credential.applicationDefault(), projectId: PROJECT_ID },
    );
  }
  return admin.app();
}
const firestore = () => getFirestore(adminApp(), DATABASE_ID);

async function uidFrom(authorization?: string): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    return (await adminApp().auth().verifyIdToken(authorization.slice(7))).uid;
  } catch {
    return null;
  }
}

const stripe = () => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);
const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

export async function createBoostCheckout(body: any, authorization?: string): Promise<BoostResult> {
  const uid = await uidFrom(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const tierId = body?.tierId as BoostTierId;
  const tier = BOOST_TIERS[tierId];
  if (!/^[\w-]{1,128}$/.test(eventId) || !tier) return fail(400, 'Invalid boost request');

  const s = stripe();
  if (!s) return fail(500, 'Payments are not configured on this server');

  const snap = await firestore().doc(`events/${eventId}`).get();
  const event = snap.data();
  if (!event) return fail(404, 'Event not found');
  const isHost = event.hostId === uid || (event.coHostIds ?? []).includes(uid);
  if (!isHost) return fail(403, 'Only the host can boost this event');
  if (event.visibility !== 'public') return fail(400, 'Only public events can be boosted');
  if (event.status === 'ended' || new Date(event.endDate).getTime() < Date.now()) {
    return fail(400, 'This event has already ended');
  }

  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: tier.cents,
          product_data: { name: `${tier.label}: ${String(event.title).slice(0, 80)}` },
        },
      },
    ],
    metadata: { kind: 'event_boost', eventId, tierId, uid },
    success_url: `${appUrl()}/events/${eventId}?boost_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/events/${eventId}?boost=cancelled`,
  });
  return { status: 200, body: { url: session.url } };
}

export async function confirmBoost(body: any, authorization?: string): Promise<BoostResult> {
  const uid = await uidFrom(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (!/^cs_[\w]{1,200}$/.test(sessionId)) return fail(400, 'Invalid session');
  const s = stripe();
  if (!s) return fail(500, 'Payments are not configured on this server');

  const session = await s.checkout.sessions.retrieve(sessionId);
  const m = session.metadata ?? {};
  if (m.kind !== 'event_boost' || m.uid !== uid) return fail(403, 'Not your boost');
  if (session.payment_status !== 'paid') return fail(402, 'Payment not completed');
  const tier = BOOST_TIERS[m.tierId as BoostTierId];
  if (!tier) return fail(400, 'Unknown tier');

  const db = firestore();
  const eventRef = db.doc(`events/${m.eventId}`);
  const boostRef = db.doc(`boosts/${sessionId}`);

  const promotion = await db.runTransaction(async tx => {
    if ((await tx.get(boostRef)).exists) return null; // already applied
    const event = (await tx.get(eventRef)).data();
    if (!event) throw new Error('Event no longer exists');
    // Stack onto an active boost of the same placement instead of overlapping it.
    const current = event.promotion;
    const stackFrom =
      current?.status === 'active' && current.placement === tier.placement && new Date(current.endsAt).getTime() > Date.now()
        ? new Date(current.endsAt).getTime()
        : Date.now();
    const next = {
      status: 'active',
      placement: tier.placement,
      tier: m.tierId,
      startsAt: new Date(Date.now()).toISOString(),
      endsAt: new Date(stackFrom + tier.days * DAY).toISOString(),
    };
    tx.update(eventRef, { promotion: next });
    tx.set(boostRef, { eventId: m.eventId, uid, tierId: m.tierId, amount: session.amount_total, createdAt: new Date().toISOString() });
    return next;
  });

  return { status: 200, body: { ok: true, applied: promotion !== null, promotion } };
}
