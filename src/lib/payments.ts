import { auth } from '../firebase';

export interface Bank {
  name: string;
  code: string;
}

export type PaymentProviderId = 'stripe' | 'paystack';
export type CheckoutCurrency = 'NGN' | 'USD';

export interface CheckoutProvider {
  id: PaymentProviderId;
  label: string;
  currencies: CheckoutCurrency[];
  enabled: boolean;
}

export interface ComingSoonProvider {
  id: PaymentProviderId;
  label: string;
}

export interface CheckoutOptions {
  kind: CheckoutKind;
  targetId: string;
  title: string;
  /** Authoritative amount in minor units (kobo for NGN, cents for USD). */
  amountMinor: number;
  currency: CheckoutCurrency;
  free: boolean;
  /** The server's configured default. May not be able to charge this currency. */
  provider: PaymentProviderId;
  /** Providers that can charge this currency right now. */
  providers: CheckoutProvider[];
  /** Implemented providers that are intentionally paused and shown as "coming soon". */
  comingSoonProviders: ComingSoonProvider[];
  /** Kept for compatibility; sellers no longer need a payout account to sell. */
  sellerReady: boolean;
}

const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a URL value looks like an internal order id. Paystack also returns `reference`. */
export function isOrderId(value: string | null | undefined): value is string {
  return typeof value === 'string' && ORDER_ID_RE.test(value);
}

export interface CheckoutResult {
  free?: boolean;
  orderId: string;
  authorizationUrl?: string;
  provider?: PaymentProviderId;
  currency?: CheckoutCurrency;
  amountMinor?: number;
}

export interface OrderStatus {
  orderId: string;
  kind: CheckoutKind;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  paidAt: string | null;
  provider?: PaymentProviderId;
  currency?: CheckoutCurrency;
  amountMinor?: number;
}

export class PaymentError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const user = auth.currentUser;
  const headers: Record<string, string> = {};
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PaymentError(data.error || 'Something went wrong', res.status);
  return data as T;
}

export async function listBanks(): Promise<Bank[]> {
  const data = await request<{ banks: Bank[] }>('/api/payments/banks');
  return data.banks;
}

export interface PayoutAccount {
  bankCode: string | null;
  accountName: string | null;
  accountLast4: string | null;
}

export async function savePayoutAccount(bankCode: string, accountNumber: string): Promise<PayoutAccount> {
  const data = await request<{ payoutAccount: PayoutAccount }>('/api/payments/payout-account', {
    method: 'POST',
    body: { bankCode, accountNumber },
  });
  return data.payoutAccount;
}

export type CheckoutKind = 'product' | 'event_ticket' | 'event_boost' | 'product_boost' | 'community_membership';

/**
 * The server prices the target itself. The browser only sends what is being bought (and a boost
 * tier id), plus an optional provider chosen from `getCheckoutOptions`.
 */
export function startCheckout(
  kind: CheckoutKind,
  targetId: string,
  tierId?: string,
  provider?: PaymentProviderId,
): Promise<CheckoutResult> {
  return request<CheckoutResult>('/api/payments/checkout', {
    method: 'POST',
    body: { kind, targetId, tierId, provider },
  });
}

/**
 * Authoritative currency, amount and provider capabilities for a checkout target. Call this before
 * showing provider choices; never derive the amount or currency from product/event data in the browser.
 */
export function getCheckoutOptions(
  kind: CheckoutKind,
  targetId: string,
  tierId?: string,
): Promise<CheckoutOptions> {
  return request<CheckoutOptions>('/api/payments/checkout-options', {
    method: 'POST',
    body: { kind, targetId, tierId },
  });
}

/**
 * For flows with a single call-to-action (boost tiers, promotions): ask the server what can charge
 * this order and start checkout with the deployment default when it supports the currency, otherwise
 * the only available provider. The server still validates the chosen provider again.
 */
export async function beginCheckout(
  kind: CheckoutKind,
  targetId: string,
  tierId?: string,
): Promise<CheckoutResult> {
  const options = await getCheckoutOptions(kind, targetId, tierId);
  if (options.free) return startCheckout(kind, targetId, tierId);
  const preferred =
    options.providers.find(provider => provider.id === options.provider) ?? options.providers[0];
  if (!preferred) {
    throw new PaymentError(
      `Checkout isn't available in ${options.currency} on this deployment yet.`,
      400,
    );
  }
  return startCheckout(kind, targetId, tierId, preferred.id);
}

export interface ConnectStatus {
  connected: boolean;
  country?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  transfersEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirementsStatus?: 'currently_due' | 'eventually_due' | 'past_due' | null;
}

/** Starts (or resumes) Stripe Connect onboarding and returns the hosted Stripe URL to visit. */
export async function startConnectOnboarding(country: string): Promise<string> {
  const data = await request<{ url: string }>('/api/payments/connect-onboard', { method: 'POST', body: { country } });
  return data.url;
}

export function getConnectStatus(): Promise<ConnectStatus> {
  return request<ConnectStatus>('/api/payments/connect-status');
}

export interface CreatorPayout {
  id: string;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface CreatorEarning {
  id: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  available_at: string;
  order_id: string | null;
  /** Descriptive fields joined from the order and buyer. */
  orderId?: string | null;
  orderKind?: string | null;
  description?: string | null;
  buyerName?: string | null;
  buyerUsername?: string | null;
  buyerPhotoUrl?: string | null;
  grossCents?: number | null;
  feeCents?: number | null;
  netCents?: number | null;
  paymentStatus?: string | null;
  provider?: string | null;
  providerTransactionId?: string | null;
  paidAt?: string | null;
}

export interface CurrencyBalance {
  currency: string;
  /** Withdrawable now. */
  availableCents: number;
  /** Still inside the refund hold window. */
  pendingCents: number;
  /** Total credited from sales. */
  lifetimeCents: number;
  /** Only USD can be withdrawn through Stripe Connect today. */
  withdrawable: boolean;
}

export interface BalanceResponse {
  /** Headline currency (USD). */
  currency: string;
  /** Withdrawable now. */
  availableCents: number;
  /** Still inside the refund hold window. */
  pendingCents: number;
  /** Total credited from sales. */
  lifetimeCents: number;
  balances?: CurrencyBalance[];
  withdrawableCurrencies?: string[];
  /** True while Stripe payouts are paused. Earnings are still credited. */
  payoutsComingSoon?: boolean;
  holdDays: number;
  minWithdrawalCents: number;
  payouts: CreatorPayout[];
  earnings: CreatorEarning[];
}

/** The signed-in creator's platform balance and recent activity. */
export async function getCreatorBalance(): Promise<BalanceResponse> {
  const data = await request<BalanceResponse>('/api/payments/balance');
  if (!data || typeof data.currency !== 'string' || typeof data.availableCents !== 'number') {
    throw new PaymentError('Your balance is not available right now', 502);
  }
  return data;
}

/** Moves money from the platform balance to the creator's connected Stripe account. */
export function requestWithdrawal(amountCents: number): Promise<{
  payoutId: string;
  status: string;
  amountCents: number;
  currency: string;
}> {
  return request<{ payoutId: string; status: string; amountCents: number; currency: string }>(
    '/api/payments/withdraw',
    { method: 'POST', body: { amountCents } },
  );
}

export function getOrderStatus(orderId: string): Promise<OrderStatus> {
  return request<OrderStatus>(`/api/payments/order?id=${encodeURIComponent(orderId)}`);
}

/**
 * Stops a community's monthly renewal for the signed-in member.
 * `period_end` (default) keeps the access they already paid for; `now` removes it immediately.
 * One-time memberships and free communities return `{ cancelled: false }`.
 */
export function cancelCommunityMembership(
  communityId: string,
  mode: 'period_end' | 'now' = 'period_end',
): Promise<{ cancelled: boolean; mode?: string; accessUntil?: string | null; graceUntil?: string | null }> {
  return request<{ cancelled: boolean; mode?: string; accessUntil?: string | null; graceUntil?: string | null }>(
    '/api/payments/cancel-membership',
    {
      method: 'POST',
      body: { communityId, mode },
    },
  );
}

// ---------------------------------------------------------------------------
// Community memberships: owner reporting and buyer billing
// ---------------------------------------------------------------------------

export type MembershipState = 'active' | 'non-renewing' | 'grace' | 'expired' | 'pending';

export interface PaidMemberRow {
  memberId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  status: string;
  state: MembershipState;
  interval: string;
  currency: string;
  amountCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  accessUntil: string | null;
  lastPaidAt: string | null;
  orderId: string | null;
  provider: string;
  providerTransactionId: string | null;
  providerSubscriptionId: string | null;
  feeCents: number | null;
  netCents: number | null;
}

export interface CommunityPaidMembersResponse {
  communityId: string;
  communityName: string;
  summary: {
    totalMembers: number;
    activeCount: number;
    nonRenewingCount: number;
    graceCount: number;
    expiredCount: number;
    attentionCount: number;
    expiringThisWeek: number;
    mrrCents: number;
    currency: string;
  };
  members: PaidMemberRow[];
}

/** Owner/admin only. Server-side because subscription tables are not client-readable. */
export function getCommunityPaidMembers(communityId: string): Promise<CommunityPaidMembersResponse> {
  return request<CommunityPaidMembersResponse>(
    `/api/payments/community/subscriptions?communityId=${encodeURIComponent(communityId)}`,
  );
}

export interface MembershipSummary {
  communityId: string;
  communityName: string;
  status: string;
  state: MembershipState;
  interval: string;
  currency: string;
  amountCents: number;
  currentPeriodEnd: string | null;
  accessUntil: string | null;
  canCancelRenewal: boolean;
  providerSubscriptionId: string | null;
  lastPaidAt: string | null;
  lastOrderId: string | null;
}

export interface MembershipReceipt {
  orderId: string;
  communityId: string;
  communityName: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  provider: string;
  providerTransactionId: string | null;
  status: string;
}

export interface MyMembershipsResponse {
  memberships: MembershipSummary[];
  receipts: MembershipReceipt[];
}

/** The signed-in member's memberships and every membership payment they have made. */
export function getMyMemberships(): Promise<MyMembershipsResponse> {
  return request<MyMembershipsResponse>('/api/payments/community/billing');
}

export interface Receipt {
  orderId: string;
  kind: string;
  title: string;
  status: string;
  currency: string;
  amountCents: number;
  feeCents: number;
  sellerCents: number;
  paidAt: string | null;
  createdAt: string | null;
  provider: string;
  providerTransactionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  buyer: { id: string; name: string; username: string | null };
  seller: { id: string; name: string; username: string | null } | null;
}

/** Buyer or seller only. */
export async function getReceipt(orderId: string): Promise<Receipt> {
  const data = await request<{ receipt: Receipt }>(
    `/api/payments/receipt?orderId=${encodeURIComponent(orderId)}`,
  );
  return data.receipt;
}

/** Opens a short-lived signed download link. Only works for owners and completed purchases. */
export async function downloadProduct(productId: string): Promise<void> {
  const data = await request<{ url: string; fileName: string }>(
    `/api/payments/download?productId=${encodeURIComponent(productId)}`,
  );
  const link = document.createElement('a');
  link.href = data.url;
  link.download = data.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Default currency for new listings. Sellers can choose NGN or USD explicitly. */
export const PAYMENT_CURRENCY: CheckoutCurrency = 'USD';
export const DEFAULT_CURRENCY = PAYMENT_CURRENCY;

/**
 * Converts a major-unit price typed by a seller (dollars/naira) to integer minor units.
 * Parses the decimal text so 19.99 never becomes 1998.9999999999998.
 */
export function toMinorUnits(amount: string | number, currency?: CheckoutCurrency): number {
  const text = typeof amount === 'number' ? String(amount) : amount.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new PaymentError('Enter a price with up to two decimal places', 400);
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new PaymentError('Enter a valid price', 400);
  }
  if (currency !== undefined && currency !== 'NGN' && currency !== 'USD') {
    throw new PaymentError('Unsupported currency', 400);
  }
  return minor;
}

export function formatPrice(minor: number, currency?: string | null): string {
  // Never let missing or malformed data crash a page with "Currency code is required".
  const code =
    typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
      ? currency.trim().toUpperCase()
      : PAYMENT_CURRENCY;
  const amount = (Number.isFinite(minor) ? minor : 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** Events store their price in major units (e.g. 10 = 10 naira). Returns 'Free' for free events. */
export function formatEventPrice(event: { isPaid?: boolean; price?: number; currency?: string }): string {
  if (!event.isPaid || !(Number(event.price) > 0)) return 'Free';
  return formatPrice(Math.round(Number(event.price) * 100), event.currency === 'NGN' ? 'NGN' : 'USD');
}
