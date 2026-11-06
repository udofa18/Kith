import { auth } from '../firebase';

export interface Bank {
  name: string;
  code: string;
}

export interface CheckoutResult {
  free?: boolean;
  orderId: string;
  authorizationUrl?: string;
}

export interface OrderStatus {
  orderId: string;
  kind: CheckoutKind;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  paidAt: string | null;
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

export type CheckoutKind = 'product' | 'event_ticket' | 'event_boost' | 'product_boost';

/** The server prices the target itself. The client only sends what is being bought (and a boost tier id). */
export function startCheckout(kind: CheckoutKind, targetId: string, tierId?: string): Promise<CheckoutResult> {
  return request<CheckoutResult>('/api/payments/checkout', { method: 'POST', body: { kind, targetId, tierId } });
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
}

export interface BalanceResponse {
  currency: string;
  /** Withdrawable now. */
  availableCents: number;
  /** Still inside the refund hold window. */
  pendingCents: number;
  /** Total credited from sales. */
  lifetimeCents: number;
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

/** Card payments (Stripe) are USD only. New listings default to this. */
export const PAYMENT_CURRENCY = 'USD';

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
