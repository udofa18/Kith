/**
 * Payments for everything the app sells, shared by api/payments/*.ts (Vercel) and server.ts (local dev).
 *
 * Every paid action is an order with a `kind`. The client sends only { kind, targetId, tierId? }; the
 * server prices it from the database or Firestore. Adding a paid feature means adding a pricing rule
 * in `priceTarget` and a fulfilment step in `grantOrder`.
 *
 * Kinds:
 *   product       marketplace product → purchase (entitlement) in Supabase, sold by a creator
 *   event_ticket  paid event → registration in Firestore, sold by the host
 *   event_boost   promote an event → promotion on the event in Firestore, sold by the platform
 *
 * Providers: Stripe and Paystack both run through the same order, pricing, commission, ledger and
 * fulfilment code. PAYMENT_PROVIDER selects the deployment default; a checkout request may also
 * name a provider explicitly. A provider is never selected implicitly when its configuration is
 * missing or when it cannot charge the order currency.
 *
 * Rules that always hold:
 * - Money is in minor units (cents for USD, kobo for NGN).
 * - Access is granted only after the provider confirms payment and the reference, amount, currency,
 *   order and buyer match the database order.
 * - Fulfilment is idempotent, so webhooks and the order-status poll can both run safely.
 */
import { createHash, randomUUID } from 'crypto';
import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { supabaseAdmin } from './supabaseAdmin.js';
import { firebaseApp, firestoreAdmin, uidFromAuthHeader } from './firebaseApp.js';
import * as paystack from './paystack.js';
import { PaystackError } from './paystack.js';
import * as stripeApi from './stripe.js';
import { ProviderConfigError, ProviderUnavailableError } from './paymentErrors.js';
import {
  assertProviderSupportsCurrency,
  defaultPaymentProvider,
  providerAdapter,
  providerInfo,
  providersForCurrency,
  resolvePaymentProvider,
  type NormalizedPaymentResult,
  type PaymentProviderId,
} from './paymentProviders.js';
import { isSuccess, isTerminalFailure, validatePaymentResult } from './paymentValidation.js';
import { computeFee, MoneyError, normalizeCurrency, payoutAvailableAt, toMinorUnits } from './money.js';
import { addDaysIso, membershipExpiryFields, membershipGraceDays } from './communityBilling.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['product', 'event_ticket', 'event_boost', 'product_boost', 'community_membership'] as const;
type OrderKind = (typeof KINDS)[number];

const DAY = 86_400_000;
/** How long sale proceeds stay on hold before a creator can withdraw them. */
const payoutHoldDays = () => Math.max(0, Number(process.env.PAYOUT_HOLD_DAYS ?? 7));
/** Smallest withdrawal, in USD cents. */
const MIN_WITHDRAWAL_CENTS = 1000;
/** Stripe card payments are USD only. Kept for the balance/withdrawal UI. */
export const STRIPE_CURRENCY = 'USD';
/**
 * Payouts are paused while Stripe is marked "coming soon". Checkout still collects money with
 * Paystack, and every seller share is credited to the existing creator ledger; withdrawals resume
 * once Stripe (the only payout adapter) is re-enabled.
 */
export const PAYOUTS_COMING_SOON = true;
export const PAYOUTS_COMING_SOON_MESSAGE =
  'Payouts are coming soon. Keep selling — your earnings stay in your Kith balance until withdrawals open.';
/** Event boost tiers. Prices are USD cents and live only on the server. */
export const BOOST_TIERS = {
  feed_3d: { label: 'Feed boost · 3 days', placement: 'feed', days: 3, cents: 900 },
  spotlight_3d: { label: 'Spotlight · 3 days', placement: 'spotlight', days: 3, cents: 2900 },
  spotlight_7d: { label: 'Spotlight · 7 days', placement: 'spotlight', days: 7, cents: 5900 },
} as const;
export type BoostTierId = keyof typeof BOOST_TIERS;

/** Product promotion tiers (USD cents). Shown in the sidebar of the marketplace while active. */
export const PRODUCT_PROMO_TIERS = {
  promo_7d: { label: 'Promoted · 7 days', days: 7, cents: 500 },
  promo_30d: { label: 'Promoted · 30 days', days: 30, cents: 1500 },
} as const;
export type ProductPromoTierId = keyof typeof PRODUCT_PROMO_TIERS;

export interface PaymentResult {
  status: number;
  body: Record<string, unknown>;
}
const fail = (status: number, error: string): PaymentResult => ({ status, body: { error } });

/** The deployment default provider. Throws if PAYMENT_PROVIDER has an unknown value. */
export const paymentProvider = (): PaymentProviderId => defaultPaymentProvider();
/** Platform commission in basis points. 1000 = 10%. */
const platformFeeBps = () => Number(process.env.PLATFORM_FEE_BPS ?? 1000);
const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

function absoluteUrl(path: string, base: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), normalizedBase).toString();
}

/** Paystack has a separate, optional public base URL from Stripe. Must be a site origin. */
function providerReturnBase(provider: PaymentProviderId): string {
  if (provider !== 'paystack') return appUrl();
  const configured = process.env.PAYSTACK_CALLBACK_URL?.trim();
  if (!configured) return appUrl();
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('invalid protocol');
    return configured;
  } catch {
    throw new ProviderConfigError('PAYSTACK_CALLBACK_URL must be an absolute http(s) URL.');
  }
}

function successUrlFor(orderId: string, provider: PaymentProviderId, returnPath: string): string {
  const url = new URL(absoluteUrl(returnPath, providerReturnBase(provider)));
  url.searchParams.set('order', orderId);
  url.searchParams.set('provider', provider);
  return url.toString();
}

function cancelUrlFor(returnPath: string): string {
  const url = new URL(absoluteUrl(returnPath, appUrl()));
  url.searchParams.set('cancelled', '1');
  return url.toString();
}

class CheckoutError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface PricedTarget {
  kind: OrderKind;
  targetId: string;
  /** Seller who receives most of the money. null for platform-only sales (boosts). */
  sellerId: string | null;
  currency: 'NGN' | 'USD';
  amountMinor: number;
  title: string;
  metadata: Record<string, unknown>;
  productLines: Array<{ product_id: string; creator_id: string; unit_price_cents: number }>;
  returnPath: string;
}

async function priceProduct(uid: string, productId: string): Promise<PricedTarget> {
  const db = supabaseAdmin();
  const { data: product, error } = await db
    .from('products')
    .select('id, title, creator_uid, status, price_cents, currency')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw error;
  if (!product || product.status !== 'published') throw new CheckoutError(404, 'Product not found');
  if (product.creator_uid === uid) throw new CheckoutError(400, "You can't buy your own product");

  const { data: owned, error: ownedError } = await db
    .from('purchases')
    .select('id')
    .eq('buyer_id', uid)
    .eq('product_id', productId)
    .eq('status', 'completed')
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (owned) throw new CheckoutError(409, 'You already own this product');

  return {
    kind: 'product',
    targetId: product.id,
    sellerId: product.creator_uid,
    currency: normalizeCurrency(product.currency),
    amountMinor: product.price_cents,
    title: String(product.title ?? 'Product').slice(0, 120),
    metadata: { productId: product.id },
    productLines: [{ product_id: product.id, creator_id: product.creator_uid, unit_price_cents: product.price_cents }],
    returnPath: '/library',
  };
}

async function priceEventTicket(uid: string, eventId: string): Promise<PricedTarget> {
  const fs = firestoreAdmin();
  const event = (await fs.doc(`events/${eventId}`).get()).data();
  if (!event) throw new CheckoutError(404, 'Event not found');
  if (!event.isPaid || !(Number(event.price) > 0)) throw new CheckoutError(400, 'This event is free');
  if (event.visibility !== 'public') throw new CheckoutError(400, 'Only public events can be bought right now');
  if (new Date(event.endDate).getTime() < Date.now()) throw new CheckoutError(400, 'This event has already ended');
  if (event.hostId === uid) throw new CheckoutError(400, "You can't buy a ticket to your own event");

  const registration = await fs.doc(`events/${eventId}/registrations/${uid}`).get();
  if (registration.exists) throw new CheckoutError(409, 'You are already registered for this event');

  const currency = normalizeCurrency(event.currency ?? 'USD');
  return {
    kind: 'event_ticket',
    targetId: eventId,
    sellerId: event.hostId,
    currency,
    amountMinor: toMinorUnits(event.price, currency),
    title: String(event.title ?? 'Event ticket').slice(0, 120),
    metadata: { eventId },
    productLines: [],
    returnPath: `/events/${eventId}`,
  };
}

async function priceEventBoost(uid: string, eventId: string, tierId: string): Promise<PricedTarget> {
  const tier = BOOST_TIERS[tierId as BoostTierId];
  if (!tier) throw new CheckoutError(400, 'Unknown boost tier');

  const fs = firestoreAdmin();
  const event = (await fs.doc(`events/${eventId}`).get()).data();
  if (!event) throw new CheckoutError(404, 'Event not found');
  const isHost = event.hostId === uid || (event.coHostIds ?? []).includes(uid);
  if (!isHost) throw new CheckoutError(403, 'Only the host can boost this event');
  if (event.visibility !== 'public') throw new CheckoutError(400, 'Only public events can be boosted');
  if (event.status === 'ended' || new Date(event.endDate).getTime() < Date.now()) {
    throw new CheckoutError(400, 'This event has already ended');
  }

  return {
    kind: 'event_boost',
    targetId: eventId,
    sellerId: null,
    currency: 'USD',
    amountMinor: tier.cents,
    title: `${tier.label}: ${String(event.title ?? 'Event').slice(0, 80)}`,
    metadata: { eventId, tierId, uid },
    productLines: [],
    returnPath: `/events/${eventId}`,
  };
}

async function priceProductBoost(uid: string, productId: string, tierId: string): Promise<PricedTarget> {  const tier = PRODUCT_PROMO_TIERS[tierId as ProductPromoTierId];
  if (!tier) throw new CheckoutError(400, 'Unknown promotion tier');

  const { data: product, error } = await supabaseAdmin()
    .from('products')
    .select('id, title, creator_uid, status')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw error;
  if (!product || product.status !== 'published') throw new CheckoutError(404, 'Product not found');
  if (product.creator_uid !== uid) throw new CheckoutError(403, 'Only the creator can promote this product');

  return {
    kind: 'product_boost',
    targetId: product.id,
    sellerId: null,
    currency: 'USD',
    amountMinor: tier.cents,
    title: `${tier.label}: ${String(product.title ?? 'Product').slice(0, 80)}`,
    metadata: { productId: product.id, tierId, uid },
    productLines: [],
    returnPath: '/dashboard',
  };
}

/**
 * The joining fee stored on a community. Real-money fees are charged in naira; XP fees stay on the
 * legacy client-side XP transfer path. Monthly billing is only valid for real money.
 */
export interface CommunityFee {
  amount: number;
  currency: 'xp' | 'ngn';
  interval: 'once' | 'month';
}

export function parseCommunityFee(community: any): CommunityFee | null {
  const raw = community?.fee;
  if (raw && Number(raw.amount) > 0) {
    // `usd` is the legacy real-money value. It is read as NGN so older communities keep using the
    // card path; owners should review the amount in community settings.
    const currency = raw.currency === 'ngn' || raw.currency === 'usd' ? 'ngn' : 'xp';
    return {
      amount: Number(raw.amount),
      currency,
      interval: currency === 'ngn' && raw.interval === 'month' ? 'month' : 'once',
    };
  }
  // Legacy communities only have isPaid + price, and those were always XP one-time fees.
  if (community?.isPaid && Number(community.price) > 0) {
    return { amount: Number(community.price), currency: 'xp', interval: 'once' };
  }
  return null;
}

/** True when an existing member's paid access is still valid. */
function membershipIsActive(member: any): boolean {
  if (!member) return false;
  if (member.subscriptionStatus === 'cancelled') return false;
  const expires = member.membershipExpiresAt ? new Date(member.membershipExpiresAt).getTime() : 0;
  return !expires || expires > Date.now();
}

async function priceCommunityMembership(uid: string, communityId: string): Promise<PricedTarget> {
  const fs = firestoreAdmin();
  const snapshot = await fs.doc(`communities/${communityId}`).get();
  if (!snapshot.exists) throw new CheckoutError(404, 'Community not found');
  const community = snapshot.data() ?? {};

  const fee = parseCommunityFee(community);
  if (!fee) throw new CheckoutError(400, 'This community is free to join');
  if (fee.currency !== 'ngn') {
    throw new CheckoutError(400, 'This community charges XP to join. Card checkout is only available for naira fees.');
  }
  if (community.creatorId === uid) throw new CheckoutError(400, "You can't pay to join your own community");
  if (typeof community.creatorId !== 'string' || !community.creatorId) {
    throw new CheckoutError(400, 'This community has no owner to pay');
  }

  const member = (await fs.doc(`communities/${communityId}/members/${uid}`).get()).data();
  if (membershipIsActive(member)) throw new CheckoutError(409, 'You are already a member of this community');

  // Paid access is still access: a ban (or a timed ban that hasn't lapsed) blocks checkout even
  // though the server writes the member document outside the Firestore rules.
  const ban = (await fs.doc(`communities/${communityId}/bans/${uid}`).get()).data();
  if (ban) {
    const raw = ban.expiresAt;
    const expires = raw?.toMillis?.() ?? (raw ? new Date(raw).getTime() : 0);
    if (!expires || !Number.isFinite(expires) || expires > Date.now()) {
      throw new CheckoutError(403, "You can't join this community right now");
    }
  }

  // Approval-gated communities collect payment only after an admin approved the request. Without
  // this check a member could skip review by calling checkout directly.
  const control = community.membershipControl ?? {};
  const requiresApproval =
    community.isPrivate === true ||
    control.approvalRequired === true ||
    (typeof control.accessType === 'string' && control.accessType !== 'public');
  if (requiresApproval) {
    const request = (await fs.doc(`communities/${communityId}/joinRequests/${uid}`).get()).data();
    if (request?.status !== 'approved') {
      throw new CheckoutError(403, 'Your join request must be approved before you can pay');
    }
  }

  const amountMinor = toMinorUnits(fee.amount, 'NGN');
  if (amountMinor <= 0) throw new CheckoutError(400, 'This community joining fee is invalid');

  return {
    kind: 'community_membership',
    targetId: communityId,
    sellerId: community.creatorId,
    currency: 'NGN',
    amountMinor,
    title: `Membership: ${String(community.name ?? 'Community').slice(0, 80)}`,
    metadata: {
      communityId,
      memberId: uid,
      interval: fee.interval,
      subscription: fee.interval === 'month',
    },
    productLines: [],
    returnPath: `/community/${communityId}`,
  };
}

async function priceTarget(kind: OrderKind, uid: string, targetId: string, tierId?: string): Promise<PricedTarget> {
  if (kind === 'product') return priceProduct(uid, targetId);
  if (kind === 'event_ticket') return priceEventTicket(uid, targetId);
  if (kind === 'product_boost') return priceProductBoost(uid, targetId, tierId ?? '');
  if (kind === 'community_membership') return priceCommunityMembership(uid, targetId);
  return priceEventBoost(uid, targetId, tierId ?? '');
}

/** Adds calendar months without rolling a 31st into the next month. */
function addMonthsIso(from: string | number | Date, months = 1): string {
  const date = new Date(from);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

/**
 * Returns a Paystack plan for this exact community fee, creating one if the owner changed the
 * amount/currency. Plans are keyed by community + currency + amount so unrelated communities never
 * share billing settings.
 */
async function ensureCommunityPlan(
  communityId: string,
  amountMinor: number,
  currency: 'NGN' | 'USD',
  communityName: string,
): Promise<string> {
  const db = supabaseAdmin();
  const lookup = () =>
    db
      .from('community_subscription_plans')
      .select('provider_plan_code')
      .eq('community_id', communityId)
      .eq('provider', 'paystack')
      .eq('currency', currency)
      .eq('amount_cents', amountMinor)
      .eq('interval', 'month')
      .maybeSingle();

  const { data: existing, error: lookupError } = await lookup();
  if (lookupError) throw lookupError;
  if (existing?.provider_plan_code) return String(existing.provider_plan_code);

  const plan = await paystack.createPlan({
    name: `${String(communityName || 'Community').slice(0, 80)} membership`,
    description: 'Monthly community membership',
    amountMinor,
    currency,
    interval: 'monthly',
  });
  if (!plan?.plan_code) throw new PaystackError('Paystack did not return a plan code', 502);
  if (plan.amount !== amountMinor || (plan.currency && plan.currency.toUpperCase() !== currency)) {
    throw new PaystackError('Paystack returned a plan with a different amount or currency', 502);
  }

  const { error: insertError } = await db.from('community_subscription_plans').insert({
    community_id: communityId,
    provider: 'paystack',
    provider_plan_code: plan.plan_code,
    currency,
    amount_cents: amountMinor,
    interval: 'month',
  });
  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced, error: racedError } = await lookup();
      if (racedError) throw racedError;
      if (raced?.provider_plan_code) return String(raced.provider_plan_code);
    }
    throw insertError;
  }
  return plan.plan_code;
}

/** Stops a previous Paystack subscription for this member before a replacement starts. */
async function disableStaleCommunitySubscription(
  communityId: string,
  memberId: string,
  keepSubscriptionId?: string | null,
): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('community_subscriptions')
    .select('provider_subscription_id, provider_email_token, status')
    .eq('community_id', communityId)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw error;
  const code = data?.provider_subscription_id ? String(data.provider_subscription_id) : null;
  if (!code || code === keepSubscriptionId) return;
  if (data?.status === 'cancelled' || data?.status === 'completed') return;

  try {
    await paystack.disableSubscription({ code, token: String(data?.provider_email_token ?? '') });
  } catch (e) {
    // The old subscription will still be reconciled by its own webhooks. Never block a payment
    // that already succeeded because cleanup failed.
    console.error('Could not disable stale Paystack subscription', code, e);
  }
}

/** Saves the plan/member pairing before checkout so subscription.create can be matched safely. */
async function upsertPendingCommunitySubscription(input: {
  communityId: string;
  memberId: string;
  sellerId: string;
  planCode: string;
  currency: 'NGN' | 'USD';
  amountMinor: number;
  orderId: string;
}): Promise<void> {
  await disableStaleCommunitySubscription(input.communityId, input.memberId);
  const { error } = await supabaseAdmin()
    .from('community_subscriptions')
    .upsert(
      {
        community_id: input.communityId,
        member_id: input.memberId,
        seller_id: input.sellerId,
        provider: 'paystack',
        provider_plan_code: input.planCode,
        provider_subscription_id: null,
        provider_customer_code: null,
        provider_email_token: null,
        currency: input.currency,
        amount_cents: input.amountMinor,
        interval: 'month',
        status: 'pending',
        current_period_end: null,
        last_order_id: input.orderId,
        last_invoice_code: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'community_id,member_id' },
    );
  if (error) throw error;
}

export async function listBanks(): Promise<PaymentResult> {  try {
    return { status: 200, body: { banks: await paystack.listNigerianBanks() } };
  } catch (e) {
    return failure(e);
  }
}

/** PostgREST's code for a missing RPC, e.g. when the balance migration hasn't been applied. */
function isMissingRpc(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: string }).code === 'PGRST202';
}

/** True when Postgres/PostgREST rejects a column that the pending audit migration adds. */
function isMissingColumn(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as { code?: string; message?: string };
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(message ?? '');
}

/** True when a table the payments code needs has not been created by its migration yet. */
function isMissingTable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as { code?: string; message?: string };
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table|relation .* does not exist/i.test(message ?? '')
  );
}

/** The community memberships migration widens the orders.kind check constraint. */
function isMissingOrderKindConstraint(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as { code?: string; message?: string };
  return code === '23514' && /orders_kind_check/i.test(message ?? '');
}

const MISSING_PAYMENTS_SCHEMA_MESSAGE =
  'Card payments are not available yet because the payment database is missing a required migration. ' +
  'Ask the platform operator to apply supabase/migrations/20261110000001_community_memberships.sql.';

function failure(e: unknown): PaymentResult {
  console.error('Payments error:', e);
  // Checked before the typed errors: Supabase rejects with a plain PostgREST/Postgres error object.
  if (isMissingTable(e) || isMissingOrderKindConstraint(e)) {
    console.error(
      'Payments database migration is missing. Apply supabase/migrations/20261110000001_community_memberships.sql.',
    );
    return fail(503, MISSING_PAYMENTS_SCHEMA_MESSAGE);
  }
  if (e instanceof CheckoutError) return fail(e.status, e.message);
  if (e instanceof ProviderConfigError) return fail(503, e.message);
  if (e instanceof ProviderUnavailableError) return fail(400, e.message);
  if (e instanceof MoneyError) return fail(400, e.message);
  if (e instanceof Stripe.errors.StripeError) return fail(502, e.message);
  if (e instanceof PaystackError && e.status !== 500) return fail(502, e.message);
  return fail(500, 'Payments failed. Please try again.');
}

/**
 * Makes sure the caller has a row in Supabase's users table. The app normally syncs this on sign-in,
 * but users who were already signed in before the marketplace tables existed don't have one yet.
 * Orders and creator_accounts both reference users, so this prevents foreign-key failures.
 */
async function ensureSupabaseUser(uid: string): Promise<{ email: string | null; displayName: string | null }> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('users').select('email, display_name').eq('id', uid).maybeSingle();
  if (error) throw error;

  const storedEmail = data?.email ?? null;
  // Only hit Firebase when the stored row is missing or still carries the placeholder address.
  const needsFirebase = !storedEmail || storedEmail.endsWith('@users.kith.local');
  const fbUser = needsFirebase ? await firebaseApp().auth().getUser(uid).catch(() => null) : null;
  const realEmail = fbUser?.email ?? (storedEmail && !storedEmail.endsWith('@users.kith.local') ? storedEmail : null);
  const displayName = fbUser?.displayName ?? data?.display_name ?? null;

  if (data) return { email: realEmail, displayName };

  const base =
    (realEmail?.split('@')[0] || fbUser?.displayName || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 24) || 'user';

  const { error: insertError } = await db.from('users').insert({
    id: uid,
    uid,
    username: `${base}${Math.floor(Math.random() * 100000)}`,
    email: realEmail || `${uid}@users.kith.local`,
    display_name: displayName,
    photo_url: fbUser?.photoURL ?? null,
  });
  if (insertError && insertError.code !== '23505') throw insertError;
  return { email: realEmail, displayName };
}

/**
 * Starts Stripe Connect onboarding for the signed-in seller. Sellers complete identity and bank
 * details on Stripe's hosted pages, then come back to /payouts.
 */
export async function startConnectOnboarding(body: any, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (PAYOUTS_COMING_SOON) return fail(503, PAYOUTS_COMING_SOON_MESSAGE);
  const country = typeof body?.country === 'string' ? body.country.toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(country)) return fail(400, 'Choose your country');

  const db = supabaseAdmin();
  try {
    const { data: existing, error: existingError } = await db
      .from('creator_accounts')
      .select('provider, provider_account_id')
      .eq('user_id', uid)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.provider !== 'stripe') {
      return fail(409, 'Your payout account uses a different provider. Contact support to change it.');
    }

    let accountId = existing?.provider_account_id as string | undefined;
    if (!accountId) {
      const user = await ensureSupabaseUser(uid);
      if (!user.email) {
        return fail(400, 'Add an email address to your Kith account before setting up payouts.');
      }
      const account = await stripeApi.createExpressAccount({
        country,
        email: user.email,
        userId: uid,
        businessName: user.displayName ?? undefined,
      });
      accountId = account.id;
      const { error } = await db.from('creator_accounts').insert({
        user_id: uid,
        provider: 'stripe',
        provider_account_id: accountId,
        country,
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
      });
      if (error) throw error;
    }

    const link = await stripeApi.createOnboardingLink(
      accountId,
      `${appUrl()}/payouts?connect=return`,
      `${appUrl()}/payouts?connect=refresh`,
    );
    return { status: 200, body: { url: link.url } };
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      const unsupported = /currently unavailable in ([A-Z]{2}) for your platform/i.exec(e.message);
      if (unsupported) {
        return fail(
          400,
          `Stripe payouts aren't available in ${unsupported[1]} yet. You can keep selling — earnings stay in your Kith balance until payouts open there.`,
        );
      }
      if (/no longer recommends Accounts v1|v2\/core\/accounts/i.test(e.message)) {
        return fail(500, 'Stripe Connect is misconfigured on this server. Contact support.');
      }
      if (/country|supported|not available/i.test(e.message)) {
        return fail(400, `Stripe can't create a payout account for ${country} yet: ${e.message}`);
      }
    }
    return failure(e);
  }
}

/** Current payout status for the signed-in seller. Reads Stripe, so the answer is never stale. */
export async function getConnectStatus(authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');

  try {
    const { data: row, error } = await supabaseAdmin()
      .from('creator_accounts')
      .select('provider, provider_account_id, country')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!row || row.provider !== 'stripe') return { status: 200, body: { connected: false } };

    const account = await stripeApi.retrieveAccountState(row.provider_account_id);
    await syncConnectRow(account);
    return {
      status: 200,
      body: {
        connected: true,
        country: row.country,
        chargesEnabled: account.chargesEnabled,
        payoutsEnabled: account.payoutsEnabled,
        transfersEnabled: account.transfersEnabled,
        detailsSubmitted: account.detailsSubmitted,
        requirementsStatus: account.requirementsStatus,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

async function syncConnectRow(account: stripeApi.ConnectAccountState): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('creator_accounts')
    .update({
      details_submitted: account.detailsSubmitted,
      charges_enabled: account.chargesEnabled,
      payouts_enabled: account.payoutsEnabled,
      transfers_enabled: account.transfersEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', 'stripe')
    .eq('provider_account_id', account.id);
  if (error) throw error;
}

/**
 * Returns the authoritative currency, amount and available providers for a checkout target.
 * The browser never supplies price/currency; this is also what the checkout UI uses to decide
 * whether to offer Paystack for a particular product/event/boost.
 */
export async function getCheckoutOptions(body: any, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const kind = body?.kind as OrderKind;
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  const tierId = typeof body?.tierId === 'string' ? body.tierId : undefined;
  if (!KINDS.includes(kind) || !/^[\w-]{1,128}$/.test(targetId)) return fail(400, 'Invalid checkout request');

  try {
    const target = await priceTarget(kind, uid, targetId, tierId);
    const providers = providersForCurrency(target.currency);
    // Payouts are paused while Stripe is "coming soon", so sellers do not need a connected payout
    // account to sell. Their share is still credited to the existing creator ledger.
    const sellerReady = true;
    const comingSoonProviders = providerInfo()
      .filter(p => p.comingSoon)
      .map(p => ({ id: p.id, label: p.label }));

    return {
      status: 200,
      body: {
        kind,
        targetId: target.targetId,
        title: target.title,
        currency: target.currency,
        amountMinor: target.amountMinor,
        free: target.amountMinor === 0,
        provider: defaultPaymentProvider(),
        providers,
        comingSoonProviders,
        sellerReady,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

export async function createCheckout(body: any, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const kind = body?.kind as OrderKind;
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  const tierId = typeof body?.tierId === 'string' ? body.tierId : undefined;
  if (!KINDS.includes(kind) || !/^[\w-]{1,128}$/.test(targetId)) return fail(400, 'Invalid checkout request');

  try {
    const target = await priceTarget(kind, uid, targetId, tierId);
    const orderId = randomUUID();
    // Orders and order_items reference users, and Paystack needs a real email. Do this before the
    // free path too, so a buyer who signed in before the marketplace tables existed can still check out.
    const buyer = await ensureSupabaseUser(uid);

    // Free orders never contact a payment provider. An explicit unknown provider is still rejected.
    const provider: PaymentProviderId =
      target.amountMinor === 0 && !body?.provider
        ? defaultPaymentProvider()
        : resolvePaymentProvider(body?.provider);

    if (target.amountMinor === 0) {
      // Free products are granted directly. Free events never reach checkout.
      await insertOrder({
        id: orderId,
        buyer_id: uid,
        status: 'paid',
        currency: target.currency,
        total_cents: 0,
        kind,
        target_id: target.targetId,
        seller_id: target.sellerId,
        fee_cents: 0,
        seller_cents: 0,
        provider,
        metadata: { ...target.metadata, provider, buyerId: uid },
        paid_at: new Date().toISOString(),
      });
      await insertOrderItems(orderId, target.productLines.map(l => ({ ...l, platform_fee_cents: 0, creator_amount_cents: 0, currency: target.currency })));
      await grantOrder(orderId);
      return { status: 200, body: { free: true, orderId, provider, currency: target.currency, amountMinor: 0 } };
    }

    // Sellers no longer need a Stripe payout account while payouts are paused. Earnings accrue in
    // the creator ledger and become withdrawable when Stripe payouts return.
    assertProviderSupportsCurrency(provider, target.currency);

    const fee = target.sellerId ? computeFee(target.amountMinor, platformFeeBps()) : target.amountMinor;
    const sellerCents = target.amountMinor - fee;

    // Monthly memberships are sold through a Paystack plan. Create/reuse it before the order so a
    // failure here never leaves a chargeable order without a matching plan.
    let paystackPlanCode: string | undefined;
    if (kind === 'community_membership' && target.metadata.interval === 'month') {
      if (provider !== 'paystack') {
        throw new CheckoutError(400, 'Recurring community memberships are only available with Paystack');
      }
      paystackPlanCode = await ensureCommunityPlan(
        target.targetId,
        target.amountMinor,
        target.currency,
        target.title,
      );
      target.metadata = { ...target.metadata, paystackPlanCode };
    }

    await insertOrder({
      id: orderId,
      buyer_id: uid,
      status: 'pending',
      currency: target.currency,
      total_cents: target.amountMinor,
      kind,
      target_id: target.targetId,
      seller_id: target.sellerId,
      fee_cents: fee,
      seller_cents: sellerCents,
      provider,
      metadata: { ...target.metadata, provider, buyerId: uid },
      // Both providers collect into the platform account. Creator sales are credited to the
      // existing ledger and withdrawn through Stripe Connect; boosts are platform revenue.
      funds_held: !!target.sellerId,
    });
    await insertOrderItems(
      orderId,
      target.productLines.map(l => ({ ...l, platform_fee_cents: fee, creator_amount_cents: sellerCents, currency: target.currency })),
    );

    // Persist the pending subscription before the hosted page can send `subscription.create`.
    if (paystackPlanCode && target.sellerId) {
      await upsertPendingCommunitySubscription({
        communityId: target.targetId,
        memberId: uid,
        sellerId: target.sellerId,
        planCode: paystackPlanCode,
        currency: target.currency,
        amountMinor: target.amountMinor,
        orderId,
      });
    }

    if (provider === 'paystack' && !buyer?.email) {
      throw new CheckoutError(400, 'Add an email address to your profile to check out with Paystack');
    }

    const session = await providerAdapter(provider).createSession({
      orderId,
      kind,
      targetId: target.targetId,
      title: target.title,
      amountMinor: target.amountMinor,
      currency: target.currency,
      buyerEmail: buyer?.email ?? '',
      successUrl: successUrlFor(orderId, provider, target.returnPath),
      cancelUrl: cancelUrlFor(target.returnPath),
      metadata: { orderId, kind, targetId: target.targetId, buyerId: uid, provider },
      paystackPlanCode,
    });
    await setOrderProviderReference(orderId, session.providerReference);

    return {
      status: 200,
      body: {
        authorizationUrl: session.authorizationUrl,
        orderId,
        provider,
        currency: target.currency,
        amountMinor: target.amountMinor,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

/**
 * Stops a member's monthly community renewal. Two intents:
 *
 *  - `period_end` (default): stop future charges but keep the access they already paid for until
 *    `current_period_end`. The member becomes "non-renewing" and can renew at any time.
 *  - `now`: stop future charges and give up the rest of the current period immediately.
 *
 * Safe to call when there is no subscription (one-time memberships and free communities).
 */
export async function cancelCommunityMembership(
  body: any,
  authorization?: string,
): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const communityId = typeof body?.communityId === 'string' ? body.communityId : '';
  if (!/^[\w-]{1,128}$/.test(communityId)) return fail(400, 'Invalid community');
  const mode: 'period_end' | 'now' = body?.mode === 'now' ? 'now' : 'period_end';

  try {
    const db = supabaseAdmin();
    const { data: subscription, error } = await db
      .from('community_subscriptions')
      .select('id, provider_subscription_id, provider_email_token, status, current_period_end')
      .eq('community_id', communityId)
      .eq('member_id', uid)
      .maybeSingle();
    if (error) throw error;
    if (!subscription) return { status: 200, body: { cancelled: false, mode } };

    const code = subscription.provider_subscription_id
      ? String(subscription.provider_subscription_id)
      : null;
    const active = subscription.status !== 'cancelled' && subscription.status !== 'completed';
    if (code && active) {
      // Paystack needs the email token from subscription.create. Without it we cannot stop future
      // charges, so fail loudly instead of leaving the member to be billed again.
      const token = String(subscription.provider_email_token ?? '');
      if (!token) {
        return fail(502, "We couldn't stop the recurring payment yet. Please try again in a moment.");
      }
      await paystack.disableSubscription({ code, token });
    }

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : null;
    const stillPaid = !!periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > Date.now();
    const accessUntil = periodEnd
      ? addDaysIso(periodEnd, membershipGraceDays())
      : null;

    if (active) {
      const { error: updateError } = await db
        .from('community_subscriptions')
        .update({
          status: stillPaid && mode === 'period_end' ? 'non-renewing' : 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);
      if (updateError) throw updateError;
    }

    const fs = firestoreAdmin();
    const memberRef = fs.doc(`communities/${communityId}/members/${uid}`);
    const communityRef = fs.doc(`communities/${communityId}`);

    if (mode === 'period_end' && stillPaid) {
      // Keep the paid period. Channels stay open until `membershipExpiresAt`; after that the member
      // is in grace until `accessUntil` and the nightly job removes them.
      const memberSnap = await memberRef.get();
      if (memberSnap.exists) {
        await memberRef.set(
          {
            subscriptionStatus: 'non-renewing',
            renewalCancelledAt: new Date().toISOString(),
            ...membershipExpiryFields(periodEnd!.toISOString(), accessUntil),
          },
          { merge: true },
        );
      }
      return {
        status: 200,
        body: {
          cancelled: true,
          mode,
          accessUntil: periodEnd!.toISOString(),
          graceUntil: accessUntil,
        },
      };
    }

    // Leaving now (or cancelling something already past its paid period) removes paid access.
    await fs.runTransaction(async tx => {
      const [memberSnap, communitySnap] = await Promise.all([tx.get(memberRef), tx.get(communityRef)]);
      if (!memberSnap.exists) return;
      tx.delete(memberRef);
      if (communitySnap.exists) tx.update(communityRef, { memberCount: FieldValue.increment(-1) });
    });

    return {
      status: 200,
      body: { cancelled: true, mode, accessUntil: null, graceUntil: accessUntil },
    };
  } catch (e) {
    return failure(e);
  }
}

/** Looks up the order for the signed-in buyer. Reconciles with the provider if the webhook hasn't arrived yet. */
export async function getOrderStatus(orderId: string, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (!UUID_RE.test(orderId)) return fail(400, 'Invalid order');

  try {
    const db = supabaseAdmin();
    const { data: order, error } = await db
      .from('orders')
      .select('id, buyer_id, status, provider, metadata')
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order || order.buyer_id !== uid) return fail(404, 'Order not found');

    if (order.status === 'pending') {
      await reconcileOrder(orderId, order.provider, order.metadata).catch(e => console.error('Order reconcile failed:', e));
    }

    const { data: current, error: currentError } = await db
      .from('orders')
      .select('status, paid_at, kind, provider, currency, total_cents')
      .eq('id', orderId)
      .single();
    if (currentError) throw currentError;
    return {
      status: 200,
      body: {
        orderId,
        kind: current.kind,
        status: current.status,
        paidAt: current.paid_at,
        provider: current.provider,
        currency: current.currency,
        amountMinor: current.total_cents,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

async function reconcileOrder(
  orderId: string,
  provider: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  if (provider !== 'stripe' && provider !== 'paystack') return;

  // Paystack uses the internal order id as the reference. Stripe's checkout session id is stored in
  // the order metadata when the session is created; older rows fall back to the webhook.
  const providerReference =
    provider === 'paystack'
      ? orderId
      : typeof metadata?.providerReference === 'string'
        ? metadata.providerReference
        : null;
  if (!providerReference) return;

  const result = await providerAdapter(provider).verify(providerReference);
  await fulfilOrder(orderId, provider, result);
}

/** Verifies the Paystack webhook signature, then fulfils the referenced order. Paystack retries on non-200. */
export async function handlePaystackWebhook(
  rawBody: Buffer,
  headers: paystack.PaystackWebhookHeaders | string | undefined,
): Promise<PaymentResult> {
  const normalizedHeaders: paystack.PaystackWebhookHeaders =
    typeof headers === 'string' ? { legacySignature: headers } : (headers ?? {});

  let matched: string | null;
  try {
    matched = paystack.verifyWebhookSignature(rawBody, normalizedHeaders);
  } catch (e) {
    return failure(e);
  }
  if (!matched) return fail(401, 'Invalid signature');

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return fail(400, 'Invalid JSON');
  }
  if (!event || typeof event !== 'object' || typeof event.event !== 'string') {
    return fail(400, 'Invalid event');
  }

  const reference = typeof event?.data?.reference === 'string' ? event.data.reference : null;
  const orderId = reference && UUID_RE.test(reference) ? reference : null;
  const data = event?.data ?? {};
  // Subscription events do not always carry a transaction reference or numeric id. Build a stable
  // key from the most specific identifier so retries dedupe instead of overwriting each other.
  const eventKey =
    data?.id != null
      ? String(data.id)
      : data?.invoice_code
        ? String(data.invoice_code)
        : data?.subscription_code
          ? String(data.subscription_code)
          : data?.subscription?.subscription_code
            ? String(data.subscription.subscription_code)
            : data?.plan?.plan_code
              ? String(data.plan.plan_code)
              : reference ?? createHash('sha256').update(rawBody).digest('hex').slice(0, 32);
  const eventRecordId = `paystack:${event.event}:${eventKey}`;

  try {
    // Persist before doing any slow work. A duplicate delivery still runs through idempotent
    // fulfilment, which is what makes retries and out-of-order events safe.
    await recordEvent(eventRecordId, 'paystack', event.event, {
      payload: event,
      providerReference: reference,
      orderId,
    });

    if (event.event === 'charge.success' && orderId) {
      await fulfilPaystackOrder(orderId);
    } else if (event.event === 'subscription.create') {
      await handlePaystackSubscriptionCreated(data);
    } else if (event.event === 'invoice.update') {
      await handlePaystackSubscriptionInvoice(data);
    } else if (event.event === 'invoice.payment_failed') {
      await handlePaystackSubscriptionFailed(data);
    } else if (event.event === 'subscription.not_renew') {
      await setPaystackSubscriptionStatus(data, 'non-renewing');
    } else if (event.event === 'subscription.disable') {
      await handlePaystackSubscriptionDisabled(data);
    }

    await markEventProcessed(eventRecordId);
    return { status: 200, body: { received: true } };
  } catch (e) {
    console.error('Paystack webhook processing failed:', e);
    await markEventError(eventRecordId, e).catch(markError => console.error('Could not flag webhook event:', markError));
    return fail(500, 'Could not process event');
  }
}

function paystackSubscriptionCode(data: any): string | null {
  const code = data?.subscription?.subscription_code ?? data?.subscription_code ?? data?.code;
  return typeof code === 'string' && /^SUB_[A-Za-z0-9]+$/.test(code) ? code : null;
}

function paystackPlanCode(data: any): string | null {
  const code = data?.plan?.plan_code ?? data?.plan_code;
  return typeof code === 'string' && /^PLN_[A-Za-z0-9]+$/.test(code) ? code : null;
}

function paystackCustomerEmail(data: any): string | null {
  const email = data?.customer?.email ?? data?.email;
  return typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Merges subscription state onto an existing Firestore member. Never creates a membership. */
async function updateCommunityMemberSubscription(
  communityId: string,
  memberId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const fs = firestoreAdmin();
  const ref = fs.doc(`communities/${communityId}/members/${memberId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  await ref.set(fields, { merge: true });
}

/** Removes paid access when a subscription ends. A newer subscription is left alone. */
async function revokeCommunityMembership(
  communityId: string,
  memberId: string,
  subscriptionCode: string,
): Promise<void> {
  const fs = firestoreAdmin();
  const communityRef = fs.doc(`communities/${communityId}`);
  const memberRef = fs.doc(`communities/${communityId}/members/${memberId}`);

  await fs.runTransaction(async tx => {
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists) return;
    const member = memberSnap.data() ?? {};
    // If the member has already started a different subscription, leave the new one in place.
    if (member.providerSubscriptionId && member.providerSubscriptionId !== subscriptionCode) return;
    tx.delete(memberRef);
    tx.update(communityRef, { memberCount: FieldValue.increment(-1) });
  });
}

/**
 * Links a Paystack subscription to the pending community subscription created before checkout.
 * Paystack identifies the payer by plan + customer email, which is the email we sent to checkout.
 */
async function handlePaystackSubscriptionCreated(data: any): Promise<void> {
  const planCode = paystackPlanCode(data);
  const subscriptionCode = paystackSubscriptionCode(data);
  if (!planCode || !subscriptionCode) {
    console.error('Paystack subscription.create is missing a plan or subscription code');
    return;
  }

  const db = supabaseAdmin();
  const { data: plans, error: planError } = await db
    .from('community_subscription_plans')
    .select('community_id')
    .eq('provider_plan_code', planCode)
    .limit(1);
  if (planError) throw planError;
  if (!plans?.length) {
    // Not a Kith community plan (for example an operator-created plan). Acknowledge and ignore.
    return;
  }

  const { data: pending, error: pendingError } = await db
    .from('community_subscriptions')
    .select('id, community_id, member_id, seller_id, status')
    .eq('provider_plan_code', planCode)
    .is('provider_subscription_id', null)
    .order('created_at', { ascending: false })
    .limit(25);
  if (pendingError) throw pendingError;

  let target = (pending ?? [])[0];
  const email = paystackCustomerEmail(data);
  if (!target) {
    // Repeated subscription.create after the link was stored.
    const { data: linked, error: linkedError } = await db
      .from('community_subscriptions')
      .select('id, community_id, member_id, seller_id, status')
      .eq('provider_subscription_id', subscriptionCode)
      .maybeSingle();
    if (linkedError) throw linkedError;
    if (!linked) return;
    target = linked;
  } else if ((pending ?? []).length > 1 && email) {
    // Several members may share a plan. Disambiguate by the customer email Paystack charged.
    const memberIds = (pending ?? []).map(row => row.member_id);
    const { data: users, error: usersError } = await db.from('users').select('id, email').in('id', memberIds);
    if (usersError) throw usersError;
    const matched = (pending ?? []).find(row =>
      (users ?? []).some(user => user.id === row.member_id && String(user.email ?? '').toLowerCase() === email),
    );
    if (matched) target = matched;
  }

  // The member left before Paystack finished creating the subscription. Stop it immediately so a
  // cancelled checkout can never start billing later.
  if (target.status === 'cancelled' || target.status === 'completed') {
    const token = typeof data?.email_token === 'string' ? data.email_token : '';
    if (token) {
      await paystack
        .disableSubscription({ code: subscriptionCode, token })
        .catch(e => console.error('Could not disable a cancelled subscription', subscriptionCode, e));
    }
    const { error: cancelError } = await db
      .from('community_subscriptions')
      .update({
        provider_subscription_id: subscriptionCode,
        provider_email_token: token || null,
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id);
    if (cancelError) throw cancelError;
    return;
  }

  const periodEnd = isoOrNull(data?.next_payment_date);
  const { error: updateError } = await db
    .from('community_subscriptions')
    .update({
      provider_subscription_id: subscriptionCode,
      provider_customer_code: typeof data?.customer?.customer_code === 'string' ? data.customer.customer_code : null,
      provider_email_token: typeof data?.email_token === 'string' ? data.email_token : null,
      status: 'active',
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);
  if (updateError) throw updateError;

  await updateCommunityMemberSubscription(target.community_id, target.member_id, {
    providerSubscriptionId: subscriptionCode,
    subscriptionStatus: 'active',
    ...(periodEnd
      ? membershipExpiryFields(periodEnd, addDaysIso(periodEnd, membershipGraceDays()))
      : {}),
  });
}

/**
 * Credits a successful subscription renewal. The webhook body is never trusted for the amount:
 * every transaction is re-verified with Paystack before an order or ledger row is written.
 */
async function handlePaystackSubscriptionInvoice(data: any): Promise<void> {
  const subscriptionCode = paystackSubscriptionCode(data);
  if (!subscriptionCode) return;

  const paid = data?.paid === true || data?.paid === 1;
  if (!paid || data?.status !== 'success') return;

  const db = supabaseAdmin();
  const { data: subscription, error: subscriptionError } = await db
    .from('community_subscriptions')
    .select('id, community_id, member_id, seller_id, currency, amount_cents, last_invoice_code, last_order_id')
    .eq('provider_subscription_id', subscriptionCode)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (!subscription) {
    console.error('Paystack invoice for an unknown subscription', subscriptionCode);
    return;
  }

  const reference = typeof data?.transaction?.reference === 'string' ? data.transaction.reference : null;
  if (!reference) throw new Error('Successful subscription invoice has no transaction reference');
  const invoiceCode = String(data?.invoice_code ?? data?.id ?? reference);

  // Initial payments are fulfilled via charge.success with the internal order id. Never credit twice.
  if (UUID_RE.test(reference)) {
    const { data: initialOrder, error: initialError } = await db
      .from('orders')
      .select('id, status')
      .eq('id', reference)
      .maybeSingle();
    if (initialError) throw initialError;
    if (initialOrder) {
      const periodEnd = isoOrNull(data?.period_end) ?? isoOrNull(data?.subscription?.next_payment_date);
      await updateCommunitySubscriptionPeriod(subscription.id, invoiceCode, initialOrder.id, periodEnd);
      return;
    }
  }

  if (subscription.last_invoice_code === invoiceCode) return;

  const { data: existingOrder, error: existingError } = await db
    .from('orders')
    .select('id')
    .eq('kind', 'community_membership')
    .contains('metadata', { invoiceCode })
    .maybeSingle();
  if (existingError) throw existingError;
  if (existingOrder) {
    await grantOrder(existingOrder.id);
    return;
  }

  const verified = await paystack.verifyTransaction(reference);
  if (verified.status !== 'success') {
    throw new Error(`Paystack renewal ${reference} is ${verified.status}`);
  }
  const amount = Number(verified.amount);
  const currency = normalizeCurrency(verified.currency);
  if (amount !== subscription.amount_cents || currency !== subscription.currency) {
    throw new Error(
      `Renewal amount mismatch: expected ${subscription.amount_cents} ${subscription.currency}, got ${amount} ${currency}`,
    );
  }

  const buyerEmail = await buyerEmailFor(subscription.member_id);
  const paidEmail = verified.customer?.email?.toLowerCase();
  if (buyerEmail && paidEmail && paidEmail !== buyerEmail.toLowerCase()) {
    throw new Error('Renewal customer email does not match the member');
  }

  const periodEnd = isoOrNull(data?.period_end) ?? isoOrNull(data?.subscription?.next_payment_date);
  const orderId = randomUUID();
  const fee = computeFee(amount, platformFeeBps());
  const sellerCents = amount - fee;

  const { error: insertError } = await db.from('orders').insert({
    id: orderId,
    buyer_id: subscription.member_id,
    status: 'paid',
    currency,
    total_cents: amount,
    kind: 'community_membership',
    target_id: subscription.community_id,
    seller_id: subscription.seller_id,
    fee_cents: fee,
    seller_cents: sellerCents,
    provider: 'paystack',
    provider_transaction_id: reference,
    metadata: {
      communityId: subscription.community_id,
      memberId: subscription.member_id,
      interval: 'month',
      renewal: true,
      subscriptionId: subscriptionCode,
      invoiceCode,
      periodEnd,
      provider: 'paystack',
    },
    funds_held: !!subscription.seller_id,
    paid_at: new Date().toISOString(),
  });

  if (insertError) {
    if (insertError.code === '23505') {
      // The provider transaction was already recorded. Grant again (idempotent) instead of failing.
      const { data: paidOrder, error: paidError } = await db
        .from('orders')
        .select('id')
        .eq('provider_transaction_id', reference)
        .maybeSingle();
      if (paidError) throw paidError;
      if (paidOrder) {
        await grantOrder(paidOrder.id);
        await updateCommunitySubscriptionPeriod(subscription.id, invoiceCode, paidOrder.id, periodEnd);
        return;
      }
    }
    throw insertError;
  }

  await grantOrder(orderId);
  await updateCommunitySubscriptionPeriod(subscription.id, invoiceCode, orderId, periodEnd);
}

async function updateCommunitySubscriptionPeriod(
  id: string,
  invoiceCode: string,
  orderId: string,
  periodEnd: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('community_subscriptions')
    .update({
      status: 'active',
      last_invoice_code: invoiceCode,
      last_order_id: orderId,
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

/** A failed renewal starts the grace period; channels lock at the paid period end. */
async function handlePaystackSubscriptionFailed(data: any): Promise<void> {
  const subscriptionCode = paystackSubscriptionCode(data);
  if (!subscriptionCode) return;

  const db = supabaseAdmin();
  const { data: subscription, error } = await db
    .from('community_subscriptions')
    .select('id, community_id, member_id, last_order_id, current_period_end')
    .eq('provider_subscription_id', subscriptionCode)
    .maybeSingle();
  if (error) throw error;
  if (!subscription) return;

  const { error: updateError } = await db
    .from('community_subscriptions')
    .update({ status: 'attention', updated_at: new Date().toISOString() })
    .eq('id', subscription.id);
  if (updateError) throw updateError;

  // Do not remove access before the first successful payment. After that, a failed renewal means
  // the paid period is over: the member enters grace and the nightly job removes them if unpaid.
  if (subscription.last_order_id) {
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : new Date();
    const endIso = Number.isNaN(periodEnd.getTime()) ? new Date().toISOString() : periodEnd.toISOString();
    await updateCommunityMemberSubscription(subscription.community_id, subscription.member_id, {
      subscriptionStatus: 'attention',
      ...membershipExpiryFields(endIso, addDaysIso(endIso, membershipGraceDays())),
    });
  } else {
    await updateCommunityMemberSubscription(subscription.community_id, subscription.member_id, {
      subscriptionStatus: 'attention',
    });
  }
}

async function setPaystackSubscriptionStatus(data: any, status: string): Promise<void> {
  const subscriptionCode = paystackSubscriptionCode(data);
  if (!subscriptionCode) return;

  const db = supabaseAdmin();
  const { data: subscription, error } = await db
    .from('community_subscriptions')
    .select('id, community_id, member_id')
    .eq('provider_subscription_id', subscriptionCode)
    .maybeSingle();
  if (error) throw error;
  if (!subscription) return;

  const { error: updateError } = await db
    .from('community_subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', subscription.id);
  if (updateError) throw updateError;

  // Access is not removed here: a member who turned off auto-renew keeps the period they paid for.
  await updateCommunityMemberSubscription(subscription.community_id, subscription.member_id, {
    subscriptionStatus: status,
  });
}

async function handlePaystackSubscriptionDisabled(data: any): Promise<void> {
  const subscriptionCode = paystackSubscriptionCode(data);
  if (!subscriptionCode) return;

  const db = supabaseAdmin();
  const { data: subscription, error } = await db
    .from('community_subscriptions')
    .select('id, community_id, member_id, current_period_end')
    .eq('provider_subscription_id', subscriptionCode)
    .maybeSingle();
  if (error) throw error;
  if (!subscription) return;

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const stillPaid = !!periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() > Date.now();
  const complete = data?.status === 'complete';
  const status = complete ? 'completed' : stillPaid ? 'non-renewing' : 'cancelled';

  const { error: updateError } = await db
    .from('community_subscriptions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', subscription.id);
  if (updateError) throw updateError;

  if (stillPaid) {
    const endIso = periodEnd!.toISOString();
    await updateCommunityMemberSubscription(subscription.community_id, subscription.member_id, {
      subscriptionStatus: complete ? 'completed' : 'non-renewing',
      ...membershipExpiryFields(endIso, addDaysIso(endIso, membershipGraceDays())),
    });
  } else {
    // Channels are already locked by the expiry rule; keep the doc for grace + renewal.
    await updateCommunityMemberSubscription(subscription.community_id, subscription.member_id, {
      subscriptionStatus: complete ? 'completed' : 'cancelled',
    });
  }
}

async function communitySubscriptionTarget(
  subscriptionCode: string,
): Promise<{ communityId: string; memberId: string } | null> {
  const { data, error } = await supabaseAdmin()
    .from('community_subscriptions')
    .select('community_id, member_id')
    .eq('provider_subscription_id', subscriptionCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { communityId: String(data.community_id), memberId: String(data.member_id) };
}

/**
 * Verifies the Stripe webhook signature and handles payment and account events.
 * Stripe retries on non-2xx, so processing errors return 500.
 */
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<PaymentResult> {
  let event: Stripe.Event;
  try {
    if (!signature) return fail(400, 'Missing signature');
    event = stripeApi.constructWebhookEvent(rawBody, signature);
  } catch {
    return fail(400, 'Invalid signature');
  }

  const recordId = `stripe:${event.id}`;
  const session =
    event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded'
      ? (event.data.object as Stripe.Checkout.Session)
      : null;
  try {
    await recordEvent(recordId, 'stripe', event.type, {
      payload: event,
      providerReference: session?.id ?? null,
      orderId: session?.client_reference_id && UUID_RE.test(session.client_reference_id) ? session.client_reference_id : null,
    });

    if (session) {
      await fulfilStripeSession(session.id);
    } else if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      await syncConnectRow(await stripeApi.retrieveAccountState(account.id));
    } else if (event.type.startsWith('transfer.')) {
      await handleTransferEvent(event);
    }

    await markEventProcessed(recordId);
    return { status: 200, body: { received: true } };
  } catch (e) {
    console.error('Stripe webhook processing failed:', e);
    await markEventError(recordId, e).catch(markError => console.error('Could not flag webhook event:', markError));
    return fail(500, 'Could not process event');
  }
}

/** Settles a withdrawal when Stripe reports the transfer outcome. Safe to call more than once. */
async function handleTransferEvent(event: Stripe.Event): Promise<void> {
  const transfer = event.data.object as Stripe.Transfer;
  const payoutId = typeof transfer.metadata?.payoutId === 'string' ? transfer.metadata.payoutId : '';
  if (!UUID_RE.test(payoutId)) return;

  if (event.type === 'transfer.reversed') {
    await supabaseAdmin().rpc('settle_creator_payout', {
      p_payout_id: payoutId,
      p_status: 'failed',
      p_failure_reason: 'Stripe could not complete the transfer',
    });
    return;
  }
  if (event.type === 'transfer.created' || event.type === 'transfer.updated') {
    await supabaseAdmin().rpc('settle_creator_payout', {
      p_payout_id: payoutId,
      p_status: 'paid',
      p_transfer_id: transfer.id,
    });
  }
}

interface RecordEventExtra {
  payload?: unknown;
  providerReference?: string | null;
  orderId?: string | null;
}

async function recordEvent(
  id: string,
  provider: string,
  type: string,
  extra: RecordEventExtra = {},
): Promise<void> {
  const full = {
    id,
    provider,
    type,
    payload: extra.payload ?? null,
    provider_reference: extra.providerReference ?? null,
    order_id: extra.orderId ?? null,
  };
  const { error } = await supabaseAdmin()
    .from('payment_events')
    .upsert(full, { onConflict: 'id', ignoreDuplicates: true });
  if (!error) return;

  // Deploying the code before the audit migration must not break Stripe fulfilment. Keep the basic
  // audit row and let the handler carry on; the new columns activate as soon as the migration lands.
  if (isMissingColumn(error)) {
    const { error: fallbackError } = await supabaseAdmin()
      .from('payment_events')
      .upsert({ id, provider, type }, { onConflict: 'id', ignoreDuplicates: true });
    if (!fallbackError) return;
    throw fallbackError;
  }
  throw error;
}

async function markEventProcessed(id: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('payment_events')
    .update({ processed_at: new Date().toISOString(), processing_error: null })
    .eq('id', id);
  if (error && !isMissingColumn(error)) throw error;
}

async function markEventError(id: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const { error: updateError } = await supabaseAdmin()
    .from('payment_events')
    .update({ processing_error: message.slice(0, 1000) })
    .eq('id', id);
  if (updateError && !isMissingColumn(updateError)) throw updateError;
}

/** Stores the provider session id so the order-status poll can verify without waiting for a webhook. */
async function setOrderProviderReference(orderId: string, providerReference: string): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db.from('orders').select('metadata').eq('id', orderId).single();
  if (error) throw error;
  const metadata =
    data?.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const { error: updateError } = await db
    .from('orders')
    .update({ metadata: { ...metadata, providerReference } })
    .eq('id', orderId);
  if (updateError) throw updateError;
}

/** Fetches the session from Stripe, never trusting the webhook body alone, then fulfils the order. */
async function fulfilStripeSession(sessionId: string): Promise<void> {
  const result = await providerAdapter('stripe').verify(sessionId);
  if (result.status !== 'success' || !UUID_RE.test(result.reference)) return;
  await fulfilOrder(result.reference, 'stripe', result);
}

async function fulfilPaystackOrder(orderId: string): Promise<void> {
  if (!UUID_RE.test(orderId)) return;
  const result = await providerAdapter('paystack').verify(orderId);
  await fulfilOrder(orderId, 'paystack', result);
}

async function buyerEmailFor(buyerId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().from('users').select('email').eq('id', buyerId).maybeSingle();
  if (error) throw error;
  const email = typeof data?.email === 'string' ? data.email : null;
  // Placeholder addresses are not real contact addresses and cannot match a provider customer.
  return email && !email.endsWith('@users.kith.local') ? email : null;
}

/**
 * Applies an already-verified provider result to an order.
 *
 * The provider result is checked against the database (reference, order metadata, buyer, amount and
 * currency) before the order becomes paid. A mismatch marks the order failed and grants nothing.
 * Safe to call repeatedly: the status update only matches pending orders and grants are idempotent.
 */
async function fulfilOrder(
  orderId: string,
  provider: PaymentProviderId,
  result: NormalizedPaymentResult,
): Promise<void> {
  if (!UUID_RE.test(orderId)) return;
  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from('orders')
    .select('id, buyer_id, status, provider, total_cents, currency, metadata')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order || order.provider !== provider) return;

  if (order.status === 'paid') {
    // Webhook retry / status poll after fulfilment: grants are idempotent by order id.
    await grantOrder(orderId);
    return;
  }
  if (order.status !== 'pending') return;

  if (!isSuccess(result.status)) {
    if (isTerminalFailure(result.status)) {
      await db.from('orders').update({ status: 'failed' }).eq('id', orderId).eq('status', 'pending');
    }
    return;
  }

  const buyerEmail = await buyerEmailFor(order.buyer_id);
  const validation = validatePaymentResult(order, result, buyerEmail);
  if (!validation.ok) {
    console.error('Payment verification rejected for order', orderId, validation.reason, validation.message);
    await db.from('orders').update({ status: 'failed' }).eq('id', orderId).eq('status', 'pending');
    return;
  }

  const { error: claimError } = await db
    .from('orders')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      provider_transaction_id: result.providerTransactionId,
    })
    .eq('id', orderId)
    .eq('status', 'pending');
  if (claimError) throw claimError;

  await grantOrder(orderId);
}

/** Grants what a paid order is for. Each kind is idempotent, so a retry never double-grants. */
async function grantOrder(orderId: string): Promise<void> {
  const { data: order, error } = await supabaseAdmin()
    .from('orders')
    .select('id, kind, buyer_id, target_id, total_cents, currency, metadata, seller_id, seller_cents, funds_held')
    .eq('id', orderId)
    .single();
  if (error) throw error;

  // Platform-held sales credit the seller's withdrawable balance. Idempotent per order.
  if (order.funds_held && order.seller_id && order.seller_cents > 0) {
    await creditCreatorEarnings(order);
  }

  if (order.kind === 'product') {
    await grantPurchases(orderId);
  } else if (order.kind === 'event_ticket') {
    await grantEventRegistration(order);
  } else if (order.kind === 'event_boost') {
    await grantBoost(order);
  } else if (order.kind === 'product_boost') {
    await grantProductPromotion(order);
  } else if (order.kind === 'community_membership') {
    await grantCommunityMembership(order);
  }
}

/** Credits the seller's platform balance for a paid, platform-held order. */
async function creditCreatorEarnings(order: OrderRow): Promise<void> {
  if (!order.seller_id || !order.seller_cents || order.seller_cents <= 0) return;
  await ensureSupabaseUser(order.seller_id);
  const { error } = await supabaseAdmin().from('creator_ledger').insert({
    creator_id: order.seller_id,
    currency: order.currency,
    amount_cents: order.seller_cents,
    kind: 'sale',
    order_id: order.id,
    available_at: payoutAvailableAt(payoutHoldDays()),
  });
  if (error && error.code !== '23505') throw error; // 23505 = already credited
}

/**
 * Extends a product's promotion from now, or from the current end date if it's still running.
 * Keyed by order id, so a retried webhook never extends it twice.
 */
async function grantProductPromotion(order: OrderRow): Promise<void> {
  const tier = PRODUCT_PROMO_TIERS[order.metadata?.tierId as ProductPromoTierId];
  if (!tier || !order.target_id) throw new Error(`Unknown promotion tier on order ${order.id}`);

  const db = supabaseAdmin();
  const { data: product, error } = await db
    .from('products')
    .select('promoted_until, promoted_order_id')
    .eq('id', order.target_id)
    .single();
  if (error) throw error;
  if (product.promoted_order_id === order.id) return;

  const now = Date.now();
  const current = product.promoted_until ? new Date(product.promoted_until).getTime() : 0;
  const start = current > now ? current : now;
  const { error: updateError } = await db
    .from('products')
    .update({ promoted_until: new Date(start + tier.days * DAY).toISOString(), promoted_order_id: order.id })
    .eq('id', order.target_id);
  if (updateError) throw updateError;
}

async function grantPurchases(orderId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: order, error: orderError } = await db.from('orders').select('buyer_id').eq('id', orderId).single();
  if (orderError) throw orderError;
  const { data: items, error: itemsError } = await db
    .from('order_items')
    .select('product_id, unit_price_cents')
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;

  for (const item of items ?? []) {
    const { error } = await db.from('purchases').insert({
      id: randomUUID(),
      buyer_id: order.buyer_id,
      product_id: item.product_id,
      order_id: orderId,
      price_cents: item.unit_price_cents,
      status: 'completed',
    });
    if (error && error.code !== '23505') throw error; // 23505 = already granted
  }
}

type OrderRow = {
  id: string;
  buyer_id: string;
  target_id: string | null;
  total_cents: number;
  currency: string;
  metadata?: any;
  seller_id?: string | null;
  seller_cents?: number;
  funds_held?: boolean;
};

async function grantEventRegistration(order: OrderRow): Promise<void> {
  const fs = firestoreAdmin();
  const eventRef = fs.doc(`events/${order.target_id}`);
  const regRef = fs.doc(`events/${order.target_id}/registrations/${order.buyer_id}`);

  await fs.runTransaction(async tx => {
    const existing = await tx.get(regRef);
    if (existing.exists) return;
    tx.set(regRef, {
      userId: order.buyer_id,
      eventId: order.target_id,
      registeredAt: new Date().toISOString(),
      paid: true,
      amount: order.total_cents / 100,
      currency: order.currency,
      orderId: order.id,
    });
    tx.update(eventRef, { attendeeCount: FieldValue.increment(1) });
  });
}

function nextMembershipExpiry(order: OrderRow, existing: any): string {
  const explicit = typeof order.metadata?.periodEnd === 'string' ? new Date(order.metadata.periodEnd) : null;
  if (explicit && !Number.isNaN(explicit.getTime()) && explicit.getTime() > Date.now() - DAY) {
    return explicit.toISOString();
  }
  const current = existing?.membershipExpiresAt ? new Date(existing.membershipExpiresAt).getTime() : 0;
  const start = Math.max(Date.now(), Number.isFinite(current) ? current : 0);
  return addMonthsIso(start, 1);
}

/**
 * Grants or extends a paid community membership. Idempotent per order id; monthly renewals extend
 * from the later of "now" and the current expiry, so a late webhook never shortens access.
 */
async function grantCommunityMembership(order: OrderRow): Promise<void> {
  if (!order.target_id) throw new Error(`Community membership order ${order.id} has no community`);
  const interval = order.metadata?.interval === 'month' ? 'month' : 'once';
  const renewal = order.metadata?.renewal === true;

  // A one-time membership replaces any lapsed monthly subscription so it stops charging.
  if (interval === 'once' && !renewal) {
    await disableStaleCommunitySubscription(order.target_id, order.buyer_id);
  }

  const { data: subscription, error: subscriptionError } = await supabaseAdmin()
    .from('community_subscriptions')
    .select('provider_subscription_id, status, current_period_end')
    .eq('community_id', order.target_id)
    .eq('member_id', order.buyer_id)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  const fs = firestoreAdmin();
  const communityRef = fs.doc(`communities/${order.target_id}`);
  const memberRef = fs.doc(`communities/${order.target_id}/members/${order.buyer_id}`);
  const now = new Date().toISOString();

  await fs.runTransaction(async tx => {
    const [memberSnap, communitySnap] = await Promise.all([tx.get(memberRef), tx.get(communityRef)]);
    if (!communitySnap.exists) throw new Error('Community no longer exists');

    const existing = memberSnap.exists ? memberSnap.data() : null;
    if (existing && (existing.lastOrderId === order.id || existing.orderId === order.id)) return;
    if (existing && interval === 'once' && membershipIsActive(existing)) return;

    const base: Record<string, unknown> = {
      userId: order.buyer_id,
      role: existing?.role ?? 'member',
      joinedAt: existing?.joinedAt ?? now,
      paid: true,
      paymentInterval: interval,
      feeCurrency: order.currency.toLowerCase(),
      feeAmount: order.total_cents / 100,
      membershipStartedAt: existing?.membershipStartedAt ?? now,
      subscriptionStatus: interval === 'month' ? 'active' : 'paid',
      lastOrderId: order.id,
      orderId: order.id,
    };

    if (interval === 'month') {
      const expiry = nextMembershipExpiry(order, existing);
      Object.assign(
        base,
        membershipExpiryFields(expiry, addDaysIso(expiry, membershipGraceDays())),
      );
      base.providerSubscriptionId =
        subscription?.provider_subscription_id ?? existing?.providerSubscriptionId ?? null;
    } else {
      Object.assign(base, membershipExpiryFields(null, null));
      base.providerSubscriptionId = null;
    }
    // A new paid period starts a fresh reminder cycle.
    base.renewalReminder = null;
    base.renewalCancelledAt = null;

    if (!memberSnap.exists) {
      tx.set(memberRef, base);
      tx.update(communityRef, { memberCount: FieldValue.increment(1) });
    } else {
      tx.set(memberRef, { ...existing, ...base }, { merge: true });
    }
  });
}

/** Applies a boost to the event. Stacks on an active boost of the same placement. Keyed by order id. */
async function grantBoost(order: OrderRow): Promise<void> {
  const tier = BOOST_TIERS[order.metadata?.tierId as BoostTierId];
  if (!tier || !order.target_id) throw new Error(`Unknown boost tier on order ${order.id}`);

  const fs = firestoreAdmin();
  const eventRef = fs.doc(`events/${order.target_id}`);
  const boostRef = fs.doc(`boosts/${order.id}`);

  await fs.runTransaction(async tx => {
    if ((await tx.get(boostRef)).exists) return;
    const event = (await tx.get(eventRef)).data();
    if (!event) throw new Error('Event no longer exists');

    const current = event.promotion;
    const stackFrom =
      current?.status === 'active' && current.placement === tier.placement && new Date(current.endsAt).getTime() > Date.now()
        ? new Date(current.endsAt).getTime()
        : Date.now();
    const next = {
      status: 'active',
      placement: tier.placement,
      tier: order.metadata?.tierId,
      startsAt: new Date().toISOString(),
      endsAt: new Date(stackFrom + tier.days * DAY).toISOString(),
    };
    tx.update(eventRef, { promotion: next });
    tx.set(boostRef, { eventId: order.target_id, uid: order.buyer_id, tierId: order.metadata?.tierId, amount: order.total_cents, createdAt: new Date().toISOString() });
  });
}

async function insertOrder(row: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin().from('orders').insert(row);
  if (error) throw error;
}

async function insertOrderItems(orderId: string, lines: Array<Record<string, unknown>>): Promise<void> {
  if (lines.length === 0) return;
  const { error } = await supabaseAdmin()
    .from('order_items')
    .insert(lines.map(l => ({ order_id: orderId, ...l })));
  if (error) throw error;
}

/**
 * The signed-in creator's platform balance: what they can withdraw now, what is still on hold, and
 * their recent sales and withdrawals. Amounts are in minor units.
 */
export async function getCreatorBalance(authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');

  try {
    const db = supabaseAdmin();
    const [balanceRes, payoutRes, earningRes] = await Promise.all([
      db.rpc('creator_balance_for', { p_creator: uid }),
      db
        .from('creator_payouts')
        .select('id, amount_cents, currency, status, failure_reason, created_at, paid_at')
        .eq('creator_id', uid)
        .order('created_at', { ascending: false })
        .limit(20),
      db
        .from('creator_ledger')
        .select('id, amount_cents, currency, created_at, available_at, order_id')
        .eq('creator_id', uid)
        .eq('kind', 'sale')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (balanceRes.error) throw balanceRes.error;
    if (payoutRes.error) throw payoutRes.error;
    if (earningRes.error) throw earningRes.error;

    // Every currency the creator has been paid in. Withdrawals are paused while Stripe payouts are
    // "coming soon", so balances are reported but marked non-withdrawable for now.
    const balances = (balanceRes.data ?? []).map((r: any) => ({
      currency: String(r.currency),
      availableCents: Number(r.available_cents ?? 0),
      pendingCents: Number(r.pending_cents ?? 0),
      lifetimeCents: Number(r.lifetime_cents ?? 0),
      withdrawable: false,
    }));
    const row = balances.find((b: { currency: string }) => b.currency === STRIPE_CURRENCY);

    // "Recent sales" used to be an amount and the word "Sale". Join the ledger rows with the order,
    // the buyer and what was bought so a creator can tell a product sale from a membership renewal.
    const ledgerRows = (earningRes.data ?? []) as Array<Record<string, any>>;
    const orderIds = [...new Set(ledgerRows.map((r: any) => r.order_id).filter(Boolean))];
    const orderMap = new Map<string, any>();
    const buyerMap = new Map<string, any>();
    const productMap = new Map<string, any>();

    if (orderIds.length > 0) {
      const { data: orders, error: ordersError } = await db
        .from('orders')
        .select(
          'id, buyer_id, seller_id, status, currency, total_cents, fee_cents, seller_cents, kind, target_id, provider, provider_transaction_id, metadata, paid_at, created_at',
        )
        .in('id', orderIds);
      if (ordersError) throw ordersError;
      for (const order of orders ?? []) orderMap.set(order.id, order);

      const buyerIds = [...new Set((orders ?? []).map((o: any) => o.buyer_id).filter(Boolean))];
      if (buyerIds.length > 0) {
        const { data: buyers, error: buyersError } = await db
          .from('users')
          .select('id, username, display_name, photo_url')
          .in('id', buyerIds);
        if (buyersError) throw buyersError;
        for (const buyer of buyers ?? []) buyerMap.set(buyer.id, buyer);
      }

      const productIds = [
        ...new Set(
          (orders ?? [])
            .filter((o: any) => o.kind === 'product' && o.target_id)
            .map((o: any) => o.target_id),
        ),
      ];
      if (productIds.length > 0) {
        const { data: products, error: productsError } = await db
          .from('products')
          .select('id, title')
          .in('id', productIds);
        if (productsError) throw productsError;
        for (const product of products ?? []) productMap.set(product.id, product);
      }
    }

    const titleCache = new Map<string, string>();
    const targetTitle = async (order: any): Promise<string> => {
      if (!order) return 'Sale';
      if (order.kind === 'product') {
        return productMap.get(order.target_id)?.title ?? 'Product';
      }
      if (order.kind === 'community_membership') {
        const key = `c:${order.target_id}`;
        if (!titleCache.has(key)) {
          const snap = await firestoreAdmin().doc(`communities/${order.target_id}`).get().catch(() => null);
          titleCache.set(key, String(snap?.exists ? snap.data()?.name ?? 'Community' : 'Community'));
        }
        return `${titleCache.get(key)} membership`;
      }
      if (order.kind === 'event_ticket' || order.kind === 'event_boost') {
        const key = `e:${order.target_id}`;
        if (!titleCache.has(key)) {
          const snap = await firestoreAdmin().doc(`events/${order.target_id}`).get().catch(() => null);
          titleCache.set(key, String(snap?.exists ? snap.data()?.title ?? 'Event' : 'Event'));
        }
        return titleCache.get(key)!;
      }
      if (order.kind === 'product_boost') return 'Product promotion';
      return 'Sale';
    };

    const earnings = await Promise.all(
      ledgerRows.map(async earning => {
        const order = earning.order_id ? orderMap.get(earning.order_id) : null;
        const buyer = order?.buyer_id ? buyerMap.get(order.buyer_id) : null;
        return {
          ...earning,
          orderId: order?.id ?? earning.order_id ?? null,
          orderKind: order?.kind ?? null,
          description: await targetTitle(order),
          buyerName: buyer?.display_name ?? buyer?.username ?? null,
          buyerUsername: buyer?.username ?? null,
          buyerPhotoUrl: buyer?.photo_url ?? null,
          grossCents: order?.total_cents ?? null,
          feeCents: order?.fee_cents ?? null,
          netCents: order?.seller_cents ?? Number(earning.amount_cents ?? 0),
          paymentStatus: order?.status ?? null,
          provider: order?.provider ?? null,
          providerTransactionId: order?.provider_transaction_id ?? null,
          paidAt: order?.paid_at ?? null,
        };
      }),
    );

    return {
      status: 200,
      body: {
        // USD remains the headline balance so existing dashboards keep working.
        currency: STRIPE_CURRENCY,
        availableCents: row?.availableCents ?? 0,
        pendingCents: row?.pendingCents ?? 0,
        lifetimeCents: row?.lifetimeCents ?? 0,
        balances,
        withdrawableCurrencies: PAYOUTS_COMING_SOON ? [] : [STRIPE_CURRENCY],
        payoutsComingSoon: PAYOUTS_COMING_SOON,
        holdDays: payoutHoldDays(),
        minWithdrawalCents: MIN_WITHDRAWAL_CENTS,
        payouts: payoutRes.data ?? [],
        earnings,
      },
    };
  } catch (e) {
    if (isMissingRpc(e)) return fail(503, 'Creator balances are not set up yet. Apply the latest database migration.');
    return failure(e);
  }
}

/**
 * Withdraws from the creator's platform balance to their connected Stripe account. The balance is
 * reserved in Postgres before the transfer, so two requests can't spend the same funds.
 */
export async function requestWithdrawal(body: any, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (PAYOUTS_COMING_SOON) return fail(503, PAYOUTS_COMING_SOON_MESSAGE);

  const amountCents = Number(body?.amountCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail(400, 'Enter a valid amount');
  if (amountCents < MIN_WITHDRAWAL_CENTS) {
    return fail(400, `The minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}`);
  }

  const db = supabaseAdmin();
  try {
    const { data: account, error: accountError } = await db
      .from('creator_accounts')
      .select('provider, provider_account_id, payouts_enabled')
      .eq('user_id', uid)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account || account.provider !== 'stripe' || !account.payouts_enabled) {
      throw new CheckoutError(400, 'Finish payout setup before withdrawing');
    }

    const { data: balances, error: balanceError } = await db.rpc('creator_balance_for', { p_creator: uid });
    if (balanceError) throw balanceError;
    const available = Number((balances ?? []).find((r: any) => r.currency === STRIPE_CURRENCY)?.available_cents ?? 0);
    if (available < amountCents) {
      throw new CheckoutError(400, `You can withdraw up to $${(available / 100).toFixed(2)} right now`);
    }

    const { data: payoutId, error: reserveError } = await db.rpc('request_creator_payout', {
      p_creator: uid,
      p_amount_cents: amountCents,
      p_currency: STRIPE_CURRENCY,
    });
    if (reserveError) {
      if (/insufficient balance/i.test(reserveError.message)) {
        throw new CheckoutError(400, 'That amount is more than your available balance');
      }
      throw reserveError;
    }

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripeApi.createTransfer({
        accountId: account.provider_account_id,
        amountMinor: amountCents,
        currency: STRIPE_CURRENCY,
        payoutId: String(payoutId),
        creatorId: uid,
      });
    } catch (e) {
      // The transfer never happened, so release the reserved balance.
      const reason = e instanceof Error ? e.message : 'Transfer failed';
      const { error: settleError } = await db.rpc('settle_creator_payout', {
        p_payout_id: payoutId,
        p_status: 'failed',
        p_failure_reason: reason,
      });
      if (settleError) console.error('Could not release failed payout', payoutId, settleError);
      if (e instanceof Stripe.errors.StripeError && /insufficient available funds/i.test(e.message)) {
        throw new CheckoutError(409, 'Your earnings are still clearing with Stripe. Try again in a day or two.');
      }
      throw e;
    }

    // The money moved. If this write fails, the transfer.created webhook settles it later; never
    // reverse the balance here, or the seller would be credited twice.
    const { error: settleError } = await db.rpc('settle_creator_payout', {
      p_payout_id: payoutId,
      p_status: 'paid',
      p_transfer_id: transfer.id,
    });
    if (settleError) console.error('Could not settle payout', payoutId, settleError);

    return {
      status: 200,
      body: { payoutId, status: 'paid', amountCents, currency: STRIPE_CURRENCY },
    };
  } catch (e) {
    if (isMissingRpc(e)) return fail(503, 'Creator balances are not set up yet. Apply the latest database migration.');
    return failure(e);
  }
}

// Paystack payout onboarding (dormant). Stripe Connect is the active path. See startConnectOnboarding.
export async function createPayoutAccount(body: any, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const bankCode = typeof body?.bankCode === 'string' ? body.bankCode.trim() : '';
  const accountNumber = typeof body?.accountNumber === 'string' ? body.accountNumber.trim() : '';
  if (!/^\d{3,10}$/.test(bankCode) || !/^\d{10}$/.test(accountNumber)) {
    return fail(400, 'Enter a valid bank and 10-digit account number');
  }

  const db = supabaseAdmin();
  try {
    const { data: existing, error: existingError } = await db
      .from('creator_accounts')
      .select('bank_code, account_name, account_last4')
      .eq('user_id', uid)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { status: 200, body: { payoutAccount: toPayoutSummary(existing) } };

    const { data: user, error: userError } = await db.from('users').select('display_name, username').eq('id', uid).maybeSingle();
    if (userError) throw userError;

    const resolved = await paystack.resolveBankAccount(accountNumber, bankCode);
    const subaccount = await paystack.createSubaccount({
      businessName: user?.display_name || user?.username || resolved.account_name,
      bankCode,
      accountNumber,
      percentageCharge: platformFeeBps() / 100,
    });

    const row = {
      user_id: uid,
      provider: 'paystack',
      provider_account_id: subaccount.subaccount_code,
      country: 'NG',
      bank_code: bankCode,
      account_name: resolved.account_name,
      account_last4: accountNumber.slice(-4),
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    };
    const { data, error } = await db.from('creator_accounts').insert(row).select('bank_code, account_name, account_last4').single();
    if (error) throw error;
    return { status: 200, body: { payoutAccount: toPayoutSummary(data) } };
  } catch (e) {
    return failure(e);
  }
}

function toPayoutSummary(row: { bank_code: string | null; account_name: string | null; account_last4: string | null }) {
  return { bankCode: row.bank_code, accountName: row.account_name, accountLast4: row.account_last4 };
}

/**
 * Internal hooks for unit tests. Server-only: importing this module gives access to order
 * fulfilment, so it must never be bundled into the browser app.
 */
export const __testing = {
  fulfilOrder,
  grantOrder,
  priceTarget,
  parseCommunityFee,
  payoutHoldDays,
};
