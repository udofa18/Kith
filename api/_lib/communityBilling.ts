/**
 * Paid community memberships: owner reporting, buyer billing/receipts, cancellation and lifecycle.
 *
 * `community_subscriptions` / `community_subscription_plans` are locked to the service role, so
 * every read below is a server endpoint that first proves the caller is allowed to see it. The
 * Firestore member document stays the client-visible source of truth for access; this module keeps
 * it in step with billing state and decides when a lapsed membership enters its grace period or is
 * removed entirely.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { supabaseAdmin } from './supabaseAdmin.js';
import { firestoreAdmin, uidFromAuthHeader } from './firebaseApp.js';
import * as paystack from './paystack.js';

export interface BillingResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): BillingResult => ({ status, body: { error } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;

/** Days a lapsed membership keeps community visibility before access is removed entirely. */
export const membershipGraceDays = () =>
  Math.max(0, Math.min(30, Number(process.env.MEMBERSHIP_GRACE_DAYS ?? 3)));

export function addDaysIso(value: string | number | Date, days: number): string {
  return new Date(new Date(value).getTime() + days * DAY).toISOString();
}

/** The end of grace: after this the member document is removed and all access stops. */
export function membershipAccessUntil(periodEnd: string | number | Date): string {
  return addDaysIso(periodEnd, membershipGraceDays());
}

/**
 * The member document carries readable ISO dates plus millisecond mirrors. Firestore rules cannot
 * parse an ISO string, so channel access compares the `*Ms` numbers against `request.time`.
 */
export function membershipExpiryFields(
  expiresAt: string | null,
  accessUntil: string | null,
): {
  membershipExpiresAt: string | null;
  membershipExpiresAtMs: number | null;
  accessUntil: string | null;
  accessUntilMs: number | null;
} {
  const expiryMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const accessMs = accessUntil ? Date.parse(accessUntil) : NaN;
  return {
    membershipExpiresAt: expiresAt,
    membershipExpiresAtMs: Number.isFinite(expiryMs) ? expiryMs : null,
    accessUntil,
    accessUntilMs: Number.isFinite(accessMs) ? accessMs : null,
  };
}

export function addMonthsIso(from: string | number | Date, months: number): string {
  const date = new Date(from);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isMissingTable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as { code?: string; message?: string };
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table|relation .* does not exist/i.test(message ?? '')
  );
}

const MISSING_SCHEMA =
  'Community billing is not available yet because the payment database is missing a required migration. ' +
  'Ask the platform operator to apply supabase/migrations/20261110000001_community_memberships.sql.';

function failure(e: unknown): BillingResult {
  console.error('Community billing error:', e);
  if (isMissingTable(e)) return fail(503, MISSING_SCHEMA);
  return fail(500, 'Could not load community billing. Please try again.');
}

/** True when the Firestore user is the community owner or an admin/moderator-level manager. */
async function isCommunityStaff(uid: string, communityId: string): Promise<boolean> {
  const fs = firestoreAdmin();
  const [communitySnap, memberSnap] = await Promise.all([
    fs.doc(`communities/${communityId}`).get(),
    fs.doc(`communities/${communityId}/members/${uid}`).get(),
  ]);
  if (!communitySnap.exists) return false;
  const community = communitySnap.data() ?? {};
  if (community.creatorId === uid) return true;
  const role = memberSnap.exists ? memberSnap.data()?.role : null;
  return role === 'owner' || role === 'admin';
}

async function communityName(communityId: string): Promise<string> {
  const snap = await firestoreAdmin().doc(`communities/${communityId}`).get().catch(() => null);
  const name = snap?.exists ? snap.data()?.name : null;
  return typeof name === 'string' && name.trim() ? name : 'Community';
}

interface UserRow {
  id: string;
  username?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
}

interface OrderRow {
  id: string;
  buyer_id?: string | null;
  seller_id?: string | null;
  status?: string | null;
  currency?: string | null;
  total_cents?: number | null;
  fee_cents?: number | null;
  seller_cents?: number | null;
  kind?: string | null;
  target_id?: string | null;
  provider?: string | null;
  provider_transaction_id?: string | null;
  metadata?: Record<string, any> | null;
  paid_at?: string | null;
  created_at?: string | null;
}

interface SubscriptionRow {
  id: string;
  community_id: string;
  member_id: string;
  seller_id?: string | null;
  provider?: string | null;
  provider_plan_code?: string | null;
  provider_subscription_id?: string | null;
  currency: string;
  amount_cents: number;
  interval: string;
  status: string;
  current_period_end?: string | null;
  last_order_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

type MembershipState = 'active' | 'non-renewing' | 'grace' | 'expired';

function membershipState(
  status: string,
  periodEnd: string | null,
  accessUntil: string | null,
  now = Date.now(),
): MembershipState {
  const end = periodEnd ? Date.parse(periodEnd) : 0;
  const access = accessUntil ? Date.parse(accessUntil) : 0;
  if (Number.isFinite(end) && end > now) {
    return status === 'non-renewing' || status === 'cancelled' ? 'non-renewing' : 'active';
  }
  if (Number.isFinite(access) && access > now) return 'grace';
  return 'expired';
}

function periodFor(order: OrderRow | null | undefined, fallbackEnd: string | null): {
  periodStart: string | null;
  periodEnd: string | null;
} {
  if (!order) return { periodStart: null, periodEnd: fallbackEnd };
  const paidAt = isoOrNull(order.paid_at) ?? isoOrNull(order.created_at);
  const explicitEnd = isoOrNull(order.metadata?.periodEnd);
  const periodStart = isoOrNull(order.metadata?.periodStart) ?? paidAt;
  const periodEnd = explicitEnd ?? fallbackEnd ?? (periodStart ? addMonthsIso(periodStart, 1) : null);
  return { periodStart, periodEnd };
}

function displayName(user: UserRow | undefined, fallbackId: string): string {
  return user?.display_name?.trim() || user?.username?.trim() || `Member ${fallbackId.slice(0, 6)}`;
}

async function usersById(ids: string[]): Promise<Map<string, UserRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin()
    .from('users')
    .select('id, username, display_name, photo_url')
    .in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((row: UserRow) => [row.id, row]));
}

async function ordersById(ids: string[]): Promise<Map<string, OrderRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin()
    .from('orders')
    .select(
      'id, buyer_id, seller_id, status, currency, total_cents, fee_cents, seller_cents, kind, target_id, provider, provider_transaction_id, metadata, paid_at, created_at',
    )
    .in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((row: OrderRow) => [row.id, row]));
}

/**
 * Owner view: every paid subscriber with the amount, the period they paid for, the Kith reference
 * and the Paystack transaction id. Server-only because the subscription table is not client-readable.
 */
export async function getCommunityPaidMembers(
  communityId: string,
  authorization?: string,
): Promise<BillingResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (!/^[\w-]{1,128}$/.test(communityId)) return fail(400, 'Invalid community');

  try {
    if (!(await isCommunityStaff(uid, communityId))) {
      return fail(403, 'Only the community owner or an admin can see paid subscriptions');
    }

    const db = supabaseAdmin();
    const { data: subscriptions, error } = await db
      .from('community_subscriptions')
      .select(
        'id, community_id, member_id, seller_id, provider, provider_plan_code, provider_subscription_id, currency, amount_cents, interval, status, current_period_end, last_order_id, created_at, updated_at',
      )
      .eq('community_id', communityId)
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const rows = (subscriptions ?? []) as SubscriptionRow[];
    const [users, orders, name] = await Promise.all([
      usersById(rows.map(row => row.member_id)),
      ordersById(rows.map(row => row.last_order_id ?? '').filter(Boolean)),
      communityName(communityId),
    ]);

    const now = Date.now();
    const graceDays = membershipGraceDays();
    const members = rows.map(row => {
      const order = row.last_order_id ? orders.get(row.last_order_id) : undefined;
      const period = periodFor(order, isoOrNull(row.current_period_end));
      const periodEnd = period.periodEnd;
      const accessUntil = periodEnd ? addDaysIso(periodEnd, graceDays) : null;
      const state = row.status === 'pending' && !periodEnd
        ? 'pending'
        : membershipState(row.status, periodEnd, accessUntil, now);
      const user = users.get(row.member_id);
      return {
        memberId: row.member_id,
        name: displayName(user, row.member_id),
        username: user?.username ?? null,
        photoUrl: user?.photo_url ?? null,
        status: row.status,
        state,
        interval: row.interval,
        currency: row.currency,
        amountCents: row.amount_cents,
        periodStart: period.periodStart,
        periodEnd,
        accessUntil,
        lastPaidAt: isoOrNull(order?.paid_at) ?? null,
        orderId: order?.id ?? row.last_order_id ?? null,
        provider: row.provider ?? 'paystack',
        providerTransactionId: order?.provider_transaction_id ?? null,
        providerSubscriptionId: row.provider_subscription_id ?? null,
        feeCents: order?.fee_cents ?? null,
        netCents: order?.seller_cents ?? null,
      };
    });

    const active = members.filter(m => m.state === 'active' || m.state === 'non-renewing');
    const soon = now + 7 * DAY;
    const summary = {
      totalMembers: members.length,
      activeCount: members.filter(m => m.state === 'active').length,
      nonRenewingCount: members.filter(m => m.state === 'non-renewing').length,
      graceCount: members.filter(m => m.state === 'grace').length,
      expiredCount: members.filter(m => m.state === 'expired').length,
      attentionCount: members.filter(m => m.status === 'attention' || m.status === 'pending').length,
      expiringThisWeek: members.filter(m => {
        const end = m.periodEnd ? Date.parse(m.periodEnd) : 0;
        return end > now && end <= soon;
      }).length,
      // Recurring revenue from members whose subscription is still set to auto-renew.
      mrrCents: active
        .filter(m => m.state === 'active' && m.interval === 'month')
        .reduce((sum, m) => sum + Number(m.amountCents ?? 0), 0),
      currency: members[0]?.currency ?? 'NGN',
    };

    return { status: 200, body: { communityId, communityName: name, summary, members } };
  } catch (e) {
    return failure(e);
  }
}

/**
 * Buyer view: every membership and every paid order, so a member can see what they paid for, print
 * a receipt, and cancel the next renewal without losing the period they already paid for.
 */
export async function getMyMemberships(authorization?: string): Promise<BillingResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');

  try {
    const db = supabaseAdmin();
    const [subsRes, receiptsRes] = await Promise.all([
      db
        .from('community_subscriptions')
        .select(
          'id, community_id, member_id, seller_id, provider, provider_plan_code, provider_subscription_id, currency, amount_cents, interval, status, current_period_end, last_order_id, created_at, updated_at',
        )
        .eq('member_id', uid)
        .order('updated_at', { ascending: false })
        .limit(100),
      db
        .from('orders')
        .select(
          'id, buyer_id, seller_id, status, currency, total_cents, fee_cents, seller_cents, kind, target_id, provider, provider_transaction_id, metadata, paid_at, created_at',
        )
        .eq('buyer_id', uid)
        .eq('kind', 'community_membership')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(100),
    ]);
    if (subsRes.error) throw subsRes.error;
    if (receiptsRes.error) throw receiptsRes.error;

    const subs = (subsRes.data ?? []) as SubscriptionRow[];
    const receipts = (receiptsRes.data ?? []) as OrderRow[];
    const communityIds = [
      ...new Set([
        ...subs.map(row => row.community_id),
        ...receipts.map(row => row.target_id ?? ''),
      ].filter(Boolean)),
    ];
    const names = new Map<string, string>();
    await Promise.all(
      communityIds.map(async id => names.set(id, await communityName(id))),
    );

    const now = Date.now();
    const graceDays = membershipGraceDays();
    const memberships = subs.map(row => {
      const communityId = String(row.community_id);
      const periodEnd = isoOrNull(row.current_period_end);
      const accessUntil = periodEnd ? addDaysIso(periodEnd, graceDays) : null;
      const state = row.status === 'pending' && !periodEnd
        ? 'pending'
        : membershipState(row.status, periodEnd, accessUntil, now);
      const receipt = receipts.find(order => order.target_id === communityId);
      return {
        communityId,
        communityName: names.get(communityId) ?? 'Community',
        status: row.status,
        state,
        interval: row.interval,
        currency: row.currency,
        amountCents: row.amount_cents,
        currentPeriodEnd: periodEnd,
        accessUntil,
        canCancelRenewal: state === 'active' && !!row.provider_subscription_id,
        providerSubscriptionId: row.provider_subscription_id ?? null,
        lastPaidAt: isoOrNull(receipt?.paid_at) ?? null,
        lastOrderId: row.last_order_id ?? null,
      };
    });

    const history = receipts.map(order => {
      const communityId = order.target_id ?? '';
      const period = periodFor(order, null);
      const paidAt = isoOrNull(order.paid_at) ?? isoOrNull(order.created_at);
      // The initial order is created before Paystack returns the plan's period end, so fall back to
      // the subscription row for a receipt that shows the exact period the member paid for.
      let periodEnd = period.periodEnd;
      const sub = subs.find(row => row.community_id === communityId);
      if (!isoOrNull(order.metadata?.periodEnd) && sub?.current_period_end && paidAt) {
        const end = Date.parse(sub.current_period_end);
        const start = Date.parse(paidAt);
        if (Number.isFinite(end) && end > start && end - start <= 40 * DAY) {
          periodEnd = isoOrNull(sub.current_period_end);
        }
      }
      return {
        orderId: order.id,
        communityId,
        communityName: names.get(communityId) ?? 'Community',
        amountCents: Number(order.total_cents ?? 0),
        feeCents: Number(order.fee_cents ?? 0),
        netCents: Number(order.seller_cents ?? 0),
        currency: order.currency ?? 'NGN',
        paidAt,
        periodStart: period.periodStart,
        periodEnd,
        provider: order.provider ?? 'paystack',
        providerTransactionId: order.provider_transaction_id ?? null,
        status: order.status ?? 'paid',
      };
    });

    return { status: 200, body: { memberships, receipts: history } };
  } catch (e) {
    return failure(e);
  }
}

/**
 * A printable receipt for one order. Visible to the buyer and to the seller who was paid, never to
 * anyone else. Amounts are the authoritative order amounts, not anything the browser sends.
 */
export async function getReceipt(orderId: string, authorization?: string): Promise<BillingResult> {
  const uid = await uidFromAuthHeader(authorization);
  if (!uid) return fail(401, 'Sign in required');
  if (!UUID_RE.test(orderId)) return fail(400, 'Invalid order');

  try {
    const db = supabaseAdmin();
    const { data: order, error } = await db
      .from('orders')
      .select(
        'id, buyer_id, seller_id, status, currency, total_cents, fee_cents, seller_cents, kind, target_id, provider, provider_transaction_id, metadata, paid_at, created_at',
      )
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order || (order.buyer_id !== uid && order.seller_id !== uid)) {
      return fail(404, 'Receipt not found');
    }

    const [buyers, sellers] = await Promise.all([
      usersById([order.buyer_id]),
      usersById(order.seller_id ? [order.seller_id] : []),
    ]);
    const buyer = buyers.get(order.buyer_id);
    const seller = order.seller_id ? sellers.get(order.seller_id) : undefined;
    const period = periodFor(order as OrderRow, isoOrNull((order.metadata as any)?.periodEnd));

    // The first membership order is written before Paystack reports the plan period end, so read it
    // from the subscription row. Only when it plausibly belongs to this payment (within ~a month).
    if (order.kind === 'community_membership' && order.target_id && !isoOrNull(order.metadata?.periodEnd)) {
      const { data: sub } = await db
        .from('community_subscriptions')
        .select('current_period_end')
        .eq('community_id', order.target_id)
        .eq('member_id', order.buyer_id)
        .maybeSingle();
      const end = isoOrNull(sub?.current_period_end);
      const start = period.periodStart ? Date.parse(period.periodStart) : NaN;
      if (end && Number.isFinite(start) && Date.parse(end) > start && Date.parse(end) - start <= 40 * DAY) {
        period.periodEnd = end;
      }
    }

    let title = 'Purchase';
    if (order.kind === 'community_membership' && order.target_id) {
      title = `${await communityName(order.target_id)} membership`;
    } else if (order.kind === 'product' && order.target_id) {
      const { data: product } = await db
        .from('products')
        .select('title')
        .eq('id', order.target_id)
        .maybeSingle();
      title = product?.title ? String(product.title) : 'Product';
    } else if (order.kind === 'event_ticket' && order.target_id) {
      const snap = await firestoreAdmin().doc(`events/${order.target_id}`).get().catch(() => null);
      const eventTitle = snap?.exists ? snap.data()?.title : null;
      title = typeof eventTitle === 'string' && eventTitle ? eventTitle : 'Event ticket';
    }

    return {
      status: 200,
      body: {
        receipt: {
          orderId: order.id,
          kind: order.kind,
          title,
          status: order.status,
          currency: order.currency,
          amountCents: Number(order.total_cents ?? 0),
          feeCents: Number(order.fee_cents ?? 0),
          sellerCents: Number(order.seller_cents ?? 0),
          paidAt: isoOrNull(order.paid_at),
          createdAt: isoOrNull(order.created_at),
          provider: order.provider,
          providerTransactionId: order.provider_transaction_id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          buyer: {
            id: order.buyer_id,
            name: displayName(buyer, order.buyer_id),
            username: buyer?.username ?? null,
          },
          seller: order.seller_id
            ? {
                id: order.seller_id,
                name: displayName(seller, order.seller_id),
                username: seller?.username ?? null,
              }
            : null,
        },
      },
    };
  } catch (e) {
    return failure(e);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle & reminders
// ---------------------------------------------------------------------------

function money(cents: number, currency: string): string {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: (currency || 'NGN').toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function reminderDocId(communityId: string, memberId: string, stage: string, periodEnd: string): string {
  const key = periodEnd.slice(0, 10).replace(/[^0-9-]/g, '');
  return `membership-${communityId}-${memberId}-${stage}-${key}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 1400);
}

interface ReminderContext {
  communityId: string;
  memberId: string;
  sellerId: string | null;
  communityName: string;
  amountCents: number;
  currency: string;
  periodEnd: string;
  accessUntil: string;
  nonRenewing: boolean;
}

async function sendMembershipReminder(
  ctx: ReminderContext,
  stage: '7d' | '3d' | '1d' | 'expired' | 'grace_end',
): Promise<boolean> {
  const fs = firestoreAdmin();
  const docId = reminderDocId(ctx.communityId, ctx.memberId, stage, ctx.periodEnd);
  const ref = fs.doc(`notifications/${docId}`);
  const existing = await ref.get();
  if (existing.exists) return false;

  const endLabel = new Date(ctx.periodEnd).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const graceLabel = new Date(ctx.accessUntil).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  });
  const price = money(ctx.amountCents, ctx.currency);

  let content: string;
  let priority: 'low' | 'normal' | 'high' = 'normal';
  if (stage === '7d' || stage === '3d' || stage === '1d') {
    content = ctx.nonRenewing
      ? `Your access to ${ctx.communityName} ends on ${endLabel}. Renew your ${price} membership to keep your channels.`
      : `Your ${price} monthly membership for ${ctx.communityName} renews on ${endLabel}.`;
    priority = stage === '1d' ? 'high' : 'normal';
  } else if (stage === 'expired') {
    content = `Your payment for ${ctx.communityName} did not go through. Renew before ${graceLabel} to keep access.`;
    priority = 'high';
  } else {
    content = `Your membership to ${ctx.communityName} has ended. Renew to rejoin the community.`;
    priority = 'high';
  }

  const nowIso = new Date().toISOString();
  try {
    await ref.set({
      recipientId: ctx.memberId,
      senderId: ctx.sellerId ?? 'system',
      senderName: ctx.communityName,
      type: 'community',
      category: 'community',
      priority,
      content,
      relatedId: ctx.communityId,
      communityId: ctx.communityId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    const memberRef = fs.doc(`communities/${ctx.communityId}/members/${ctx.memberId}`);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
      await memberRef.set(
        {
          renewalReminder: {
            stage,
            periodEnd: ctx.periodEnd,
            accessUntil: ctx.accessUntil,
            sentAt: nowIso,
          },
        },
        { merge: true },
      );
    }
    return true;
  } catch (e) {
    console.error('Could not write membership reminder', docId, e);
    return false;
  }
}

async function updateMemberBillingFields(
  communityId: string,
  memberId: string,
  fields: Record<string, unknown>,
  expectedSubscriptionId?: string | null,
): Promise<boolean> {
  const fs = firestoreAdmin();
  const ref = fs.doc(`communities/${communityId}/members/${memberId}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const member = snap.data() ?? {};
  // A newer renewal or a replacement subscription must never be overwritten by an old row.
  if (
    expectedSubscriptionId &&
    member.providerSubscriptionId &&
    member.providerSubscriptionId !== expectedSubscriptionId
  ) {
    return false;
  }
  await ref.set(fields, { merge: true });
  return true;
}

/** Removes a lapsed member after grace and keeps the community counter accurate. */
async function removeLapsedMember(
  communityId: string,
  memberId: string,
  subscriptionId: string | null,
): Promise<boolean> {
  const fs = firestoreAdmin();
  const communityRef = fs.doc(`communities/${communityId}`);
  const memberRef = fs.doc(`communities/${communityId}/members/${memberId}`);
  let removed = false;
  await fs.runTransaction(async tx => {
    const [memberSnap, communitySnap] = await Promise.all([tx.get(memberRef), tx.get(communityRef)]);
    if (!memberSnap.exists) return;
    const member = memberSnap.data() ?? {};
    if (subscriptionId && member.providerSubscriptionId && member.providerSubscriptionId !== subscriptionId) {
      return; // Newer membership already in place.
    }
    const expires = member.membershipExpiresAt ? Date.parse(member.membershipExpiresAt) : 0;
    if (Number.isFinite(expires) && expires > Date.now()) return; // Still paid up.
    tx.delete(memberRef);
    if (communitySnap.exists) tx.update(communityRef, { memberCount: FieldValue.increment(-1) });
    removed = true;
  });
  return removed;
}

/**
 * Nightly reconciliation used by the cron endpoint:
 *  - repairs a lapsed period when Paystack shows the subscription actually renewed;
 *  - sends 7/3/1-day reminders once per stage per billing period;
 *  - moves lapsed memberships into grace (community visible, channels locked);
 *  - removes members once grace ends.
 */
export async function reconcileCommunityMemberships(): Promise<BillingResult> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('community_subscriptions')
      .select(
        'id, community_id, member_id, seller_id, provider_subscription_id, currency, amount_cents, interval, status, current_period_end, last_order_id, created_at, updated_at',
      )
      .in('status', ['active', 'attention', 'non-renewing', 'cancelled'])
      .order('current_period_end', { ascending: true })
      .limit(1000);
    if (error) throw error;

    const subs = (data ?? []) as SubscriptionRow[];
    const now = Date.now();
    const graceDays = membershipGraceDays();
    const nameCache = new Map<string, string>();
    const result = {
      scanned: subs.length,
      remindersSent: 0,
      movedToGrace: 0,
      removed: 0,
      repaired: 0,
      errors: 0,
    };

    for (const sub of subs) {
      try {
        let periodEnd = isoOrNull(sub.current_period_end);
        let status = sub.status;

        // A missed webhook must not cut off a member Paystack says is still paid up.
        if (
          periodEnd &&
          Date.parse(periodEnd) <= now &&
          status !== 'non-renewing' &&
          status !== 'cancelled' &&
          sub.provider_subscription_id
        ) {
          const remote = await paystack
            .fetchSubscription(String(sub.provider_subscription_id))
            .catch(() => null);
          const remoteEnd = isoOrNull(remote?.next_payment_date);
          if (remote?.status === 'active' && remoteEnd && Date.parse(remoteEnd) > Date.parse(periodEnd)) {
            periodEnd = remoteEnd;
            status = 'active';
            const { error: repairError } = await db
              .from('community_subscriptions')
              .update({ status: 'active', current_period_end: remoteEnd, updated_at: new Date().toISOString() })
              .eq('id', sub.id);
            if (repairError) throw repairError;
            result.repaired += 1;
          }
        }

        if (!periodEnd) continue;
        const endMs = Date.parse(periodEnd);
        if (!Number.isFinite(endMs)) continue;
        if (!nameCache.has(sub.community_id)) {
          nameCache.set(sub.community_id, await communityName(sub.community_id));
        }
        const ctx: ReminderContext = {
          communityId: sub.community_id,
          memberId: sub.member_id,
          sellerId: sub.seller_id ?? null,
          communityName: nameCache.get(sub.community_id) ?? 'Community',
          amountCents: sub.amount_cents,
          currency: sub.currency,
          periodEnd,
          accessUntil: addDaysIso(periodEnd, graceDays),
          nonRenewing: status === 'non-renewing' || status === 'cancelled',
        };
        // A member who chose to leave immediately should not keep receiving renewal nudges.
        const quiet = status === 'cancelled';

        if (endMs > now) {
          // Backfill and refresh the numeric expiry mirrors the security rules compare. Legacy
          // member documents only had an ISO string, which rules cannot compare to request.time.
          await updateMemberBillingFields(
            sub.community_id,
            sub.member_id,
            {
              subscriptionStatus: status,
              ...membershipExpiryFields(periodEnd, ctx.accessUntil),
            },
            sub.provider_subscription_id,
          );
          const daysLeft = Math.ceil((endMs - now) / DAY);
          const stage = daysLeft <= 1 ? '1d' : daysLeft <= 3 ? '3d' : daysLeft <= 7 ? '7d' : null;
          if (!quiet && stage && (await sendMembershipReminder(ctx, stage))) result.remindersSent += 1;
          continue;
        }

        const accessUntilMs = Date.parse(ctx.accessUntil);
        if (accessUntilMs > now) {
          // Lapsed but still inside grace: keep the community visible, lock the channels.
          if (status === 'active') {
            const { error: updateError } = await db
              .from('community_subscriptions')
              .update({ status: 'attention', updated_at: new Date().toISOString() })
              .eq('id', sub.id);
            if (updateError) throw updateError;
          }
          const graceStatus = status === 'active' ? 'attention' : status;
          const updated = await updateMemberBillingFields(
            sub.community_id,
            sub.member_id,
            {
              subscriptionStatus: graceStatus,
              ...membershipExpiryFields(periodEnd, ctx.accessUntil),
            },
            sub.provider_subscription_id,
          );
          if (updated) {
            result.movedToGrace += 1;
            if (!quiet && (await sendMembershipReminder(ctx, 'expired'))) result.remindersSent += 1;
          }
          continue;
        }

        // Grace is over: remove the member so public channels are no longer reachable.
        const removed = await removeLapsedMember(
          sub.community_id,
          sub.member_id,
          sub.provider_subscription_id ?? null,
        );
        const { error: completeError } = await db
          .from('community_subscriptions')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', sub.id);
        if (completeError) throw completeError;
        if (removed) {
          result.removed += 1;
          if (!quiet && (await sendMembershipReminder(ctx, 'grace_end'))) result.remindersSent += 1;
        }
      } catch (e) {
        result.errors += 1;
        console.error('Could not reconcile community subscription', sub.id, e);
      }
    }

    return { status: 200, body: { ok: true, graceDays, ...result } };
  } catch (e) {
    return failure(e);
  }
}
