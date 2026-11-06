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
 * Provider: Stripe (default). Set PAYMENT_PROVIDER=paystack to use the dormant Paystack path.
 *
 * Rules that always hold:
 * - Money is in minor units (cents for USD, kobo for NGN).
 * - Access is granted only after the provider confirms payment and the amount and currency match.
 * - Fulfilment is idempotent, so webhooks and the order-status poll can both run safely.
 */
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { supabaseAdmin } from './supabaseAdmin.js';
import { firebaseApp, firestoreAdmin, uidFromAuthHeader } from './firebaseApp.js';
import * as paystack from './paystack.js';
import { PaystackError } from './paystack.js';
import * as stripeApi from './stripe.js';
import { ProviderConfigError } from './stripe.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['product', 'event_ticket', 'event_boost', 'product_boost'] as const;
type OrderKind = (typeof KINDS)[number];

const DAY = 86_400_000;
/** How long sale proceeds stay on hold before a creator can withdraw them. */
const payoutHoldDays = () => Math.max(0, Number(process.env.PAYOUT_HOLD_DAYS ?? 7));
/** Smallest withdrawal, in USD cents. */
const MIN_WITHDRAWAL_CENTS = 1000;
/** Card payments (Stripe) are USD only. Paystack's NGN path is dormant. */
export const STRIPE_CURRENCY = 'USD';
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

export const paymentProvider = (): 'stripe' | 'paystack' => (process.env.PAYMENT_PROVIDER === 'paystack' ? 'paystack' : 'stripe');
/** Platform commission in basis points. 1000 = 10%. */
const platformFeeBps = () => Number(process.env.PLATFORM_FEE_BPS ?? 1000);
const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

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
    currency: product.currency,
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

  return {
    kind: 'event_ticket',
    targetId: eventId,
    sellerId: event.hostId,
    currency: event.currency === 'NGN' ? 'NGN' : 'USD',
    amountMinor: Math.round(Number(event.price) * 100),
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

async function priceProductBoost(uid: string, productId: string, tierId: string): Promise<PricedTarget> {
  const tier = PRODUCT_PROMO_TIERS[tierId as ProductPromoTierId];
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

async function priceTarget(kind: OrderKind, uid: string, targetId: string, tierId?: string): Promise<PricedTarget> {
  if (kind === 'product') return priceProduct(uid, targetId);
  if (kind === 'event_ticket') return priceEventTicket(uid, targetId);
  if (kind === 'product_boost') return priceProductBoost(uid, targetId, tierId ?? '');
  return priceEventBoost(uid, targetId, tierId ?? '');
}

export async function listBanks(): Promise<PaymentResult> {
  try {
    return { status: 200, body: { banks: await paystack.listNigerianBanks() } };
  } catch (e) {
    return failure(e);
  }
}

/** PostgREST's code for a missing RPC, e.g. when the balance migration hasn't been applied. */
function isMissingRpc(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: string }).code === 'PGRST202';
}

function failure(e: unknown): PaymentResult {
  console.error('Payments error:', e);
  if (e instanceof CheckoutError) return fail(e.status, e.message);
  if (e instanceof ProviderConfigError) return fail(503, e.message);
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

export async function createCheckout(body: any, authorization?: string): Promise<PaymentResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  const kind = body?.kind as OrderKind;
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  const tierId = typeof body?.tierId === 'string' ? body.tierId : undefined;
  if (!KINDS.includes(kind) || !/^[\w-]{1,128}$/.test(targetId)) return fail(400, 'Invalid checkout request');

  const db = supabaseAdmin();
  const provider = paymentProvider();
  try {
    const target = await priceTarget(kind, uid, targetId, tierId);
    const orderId = randomUUID();

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
        paid_at: new Date().toISOString(),
      });
      await insertOrderItems(orderId, target.productLines.map(l => ({ ...l, platform_fee_cents: 0, creator_amount_cents: 0, currency: target.currency })));
      await grantOrder(orderId);
      return { status: 200, body: { free: true, orderId } };
    }

    let seller: { provider_account_id: string; payouts_enabled: boolean } | null = null;
    if (target.sellerId) {
      const { data, error } = await db
        .from('creator_accounts')
        .select('provider_account_id, payouts_enabled')
        .eq('user_id', target.sellerId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.payouts_enabled) throw new CheckoutError(400, 'The seller has not finished payout setup yet');
      seller = data;
    }

    const buyer = await ensureSupabaseUser(uid);

    if (provider === 'stripe' && target.currency !== STRIPE_CURRENCY) {
      throw new CheckoutError(400, `This is priced in ${target.currency}. Card payments take ${STRIPE_CURRENCY} only, so the seller needs to set a USD price.`);
    }

    const fee = target.sellerId ? Math.round((target.amountMinor * platformFeeBps()) / 10000) : target.amountMinor;
    const sellerCents = target.amountMinor - fee;

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
      metadata: target.metadata,
      // Stripe sales stay on the platform account and are credited to the seller's balance.
      funds_held: provider === 'stripe' && !!target.sellerId,
    });
    await insertOrderItems(
      orderId,
      target.productLines.map(l => ({ ...l, platform_fee_cents: fee, creator_amount_cents: sellerCents, currency: target.currency })),
    );

    if (provider === 'stripe') {
      const session = await stripeApi.createCheckoutSession({
        orderId,
        kind,
        targetId: target.targetId,
        title: target.title,
        amountMinor: target.amountMinor,
        currency: target.currency,
        buyerEmail: buyer?.email ?? '',
        successUrl: `${appUrl()}${target.returnPath}?order=${orderId}`,
        cancelUrl: `${appUrl()}${target.returnPath}?cancelled=1`,
      });
      if (!session.url) throw new Error('Stripe did not return a checkout URL');
      return { status: 200, body: { authorizationUrl: session.url, orderId } };
    }

    // Paystack (dormant). Needs a seller subaccount, so platform-only sales aren't supported here.
    if (!seller) throw new CheckoutError(400, 'This purchase is not available with the current provider');
    if (!buyer?.email) throw new CheckoutError(400, 'Add an email address to your profile to check out');
    const tx = await paystack.initializeTransaction({
      email: buyer.email,
      amountMinor: target.amountMinor,
      currency: target.currency,
      reference: orderId,
      callbackUrl: `${appUrl()}${target.returnPath}?order=${orderId}`,
      subaccountCode: seller.provider_account_id,
      platformFeeMinor: fee,
      metadata: { orderId, kind, targetId: target.targetId, buyerId: uid },
    });
    return { status: 200, body: { authorizationUrl: tx.authorization_url, orderId } };
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
    const { data: order, error } = await db.from('orders').select('id, buyer_id, status, provider').eq('id', orderId).maybeSingle();
    if (error) throw error;
    if (!order || order.buyer_id !== uid) return fail(404, 'Order not found');

    if (order.status === 'pending') {
      await reconcileOrder(orderId, order.provider).catch(e => console.error('Order reconcile failed:', e));
    }

    const { data: current, error: currentError } = await db
      .from('orders')
      .select('status, paid_at, kind')
      .eq('id', orderId)
      .single();
    if (currentError) throw currentError;
    return { status: 200, body: { orderId, kind: current.kind, status: current.status, paidAt: current.paid_at } };
  } catch (e) {
    return failure(e);
  }
}

async function reconcileOrder(orderId: string, provider: string): Promise<void> {
  if (provider === 'stripe') {
    // Stripe checkout sessions aren't looked up by order id here, so rely on the webhook.
    return;
  }
  await fulfilPaystackOrder(orderId);
}

/** Verifies the Paystack webhook signature, then fulfils the referenced order. Paystack retries on non-200. */
export async function handlePaystackWebhook(rawBody: Buffer, signature: string | undefined): Promise<PaymentResult> {
  if (!paystack.isValidWebhookSignature(rawBody, signature)) return fail(401, 'Invalid signature');

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return fail(400, 'Invalid JSON');
  }

  try {
    if (event?.data?.id) await recordEvent(`paystack:${event.event}:${event.data.id}`, 'paystack', String(event.event));
    const reference = event?.data?.reference;
    if (event?.event === 'charge.success' && typeof reference === 'string' && UUID_RE.test(reference)) {
      await fulfilPaystackOrder(reference);
    }
    return { status: 200, body: { received: true } };
  } catch (e) {
    console.error('Webhook processing failed:', e);
    return fail(500, 'Could not process event');
  }
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

  try {
    await recordEvent(`stripe:${event.id}`, 'stripe', event.type);

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await fulfilStripeSession((event.data.object as Stripe.Checkout.Session).id);
    } else if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account;
      await syncConnectRow(await stripeApi.retrieveAccountState(account.id));
    } else if (event.type.startsWith('transfer.')) {
      await handleTransferEvent(event);
    }
    return { status: 200, body: { received: true } };
  } catch (e) {
    console.error('Stripe webhook processing failed:', e);
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

async function recordEvent(id: string, provider: string, type: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('payment_events')
    .upsert({ id, provider, type }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Fetches the session from Stripe, never trusting the webhook body alone, then fulfils the order. */
async function fulfilStripeSession(sessionId: string): Promise<void> {
  const session = await stripeApi.retrieveCheckoutSession(sessionId);
  if (session.payment_status !== 'paid' || !session.client_reference_id) return;
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  await markPaidAndGrant(session.client_reference_id, 'stripe', {
    providerRef: paymentIntent ?? session.id,
    amount: session.amount_total ?? -1,
    currency: (session.currency ?? '').toUpperCase(),
  });
}

async function fulfilPaystackOrder(orderId: string): Promise<void> {
  const tx = await paystack.verifyTransaction(orderId);
  if (tx.status !== 'success') return;
  await markPaidAndGrant(orderId, 'paystack', { providerRef: String(tx.id), amount: tx.amount, currency: tx.currency });
}

/**
 * Marks a pending order as paid after the provider confirms it, then grants access.
 * Amount and currency must match the order. A mismatch marks the order failed and grants nothing.
 * Safe to call repeatedly: the status update only matches pending orders, and each grant is idempotent.
 */
async function markPaidAndGrant(
  orderId: string,
  provider: 'stripe' | 'paystack',
  confirmed: { providerRef: string; amount: number; currency: string },
): Promise<void> {
  if (!UUID_RE.test(orderId)) return;
  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from('orders')
    .select('id, status, provider, total_cents, currency')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order || order.provider !== provider) return;

  if (order.status === 'pending') {
    if (confirmed.amount !== order.total_cents || confirmed.currency !== order.currency) {
      console.error('Payment mismatch for order', orderId, { expected: order.total_cents, got: confirmed.amount });
      await db.from('orders').update({ status: 'failed' }).eq('id', orderId).eq('status', 'pending');
      return;
    }
    const { error: claimError } = await db
      .from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString(), provider_transaction_id: confirmed.providerRef })
      .eq('id', orderId)
      .eq('status', 'pending');
    if (claimError) throw claimError;
  }

  if (order.status === 'pending' || order.status === 'paid') {
    await grantOrder(orderId);
  }
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
    available_at: new Date(Date.now() + payoutHoldDays() * DAY).toISOString(),
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

    const row = (balanceRes.data ?? []).find((r: any) => r.currency === STRIPE_CURRENCY);
    return {
      status: 200,
      body: {
        currency: STRIPE_CURRENCY,
        availableCents: Number(row?.available_cents ?? 0),
        pendingCents: Number(row?.pending_cents ?? 0),
        lifetimeCents: Number(row?.lifetime_cents ?? 0),
        holdDays: payoutHoldDays(),
        minWithdrawalCents: MIN_WITHDRAWAL_CENTS,
        payouts: payoutRes.data ?? [],
        earnings: earningRes.data ?? [],
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
