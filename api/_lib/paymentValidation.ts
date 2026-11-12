/**
 * Pure checks applied to every provider confirmation before an order can be fulfilled.
 *
 * Keeping these rules independent of Supabase/Stripe/Paystack makes them easy to test and means
 * both webhooks and the status poll use exactly the same definition of "paid".
 */
import type { NormalizedPaymentResult, NormalizedPaymentStatus } from './paymentProviders.js';

export interface OrderForValidation {
  id: string;
  buyer_id: string;
  total_cents: number;
  currency: string;
  metadata?: Record<string, unknown> | null;
}

export type PaymentValidationFailure =
  | 'status'
  | 'reference'
  | 'order'
  | 'buyer'
  | 'amount'
  | 'currency';

export interface PaymentValidationResult {
  ok: boolean;
  reason?: PaymentValidationFailure;
  message?: string;
}

const TERMINAL_FAILURES: NormalizedPaymentStatus[] = ['failed', 'cancelled'];

export function isTerminalFailure(status: NormalizedPaymentStatus): boolean {
  return TERMINAL_FAILURES.includes(status);
}

export function isSuccess(status: NormalizedPaymentStatus): boolean {
  return status === 'success';
}

/**
 * Validates a provider result against the order it claims to pay.
 *
 * Amount and currency are compared against the database order, never against anything supplied
 * by the browser. Reference must be the internal order id. Metadata and email are checked when
 * present, so a valid transaction for another order/customer cannot be replayed here.
 */
export function validatePaymentResult(
  order: OrderForValidation,
  result: NormalizedPaymentResult,
  buyerEmail?: string | null,
): PaymentValidationResult {
  if (!isSuccess(result.status)) {
    return { ok: false, reason: 'status', message: `Provider status is ${result.status}` };
  }

  if (!result.reference || result.reference !== order.id) {
    return { ok: false, reason: 'reference', message: 'Transaction reference does not match the order' };
  }

  const metadata = result.metadata ?? {};
  if (metadata.orderId !== undefined && String(metadata.orderId) !== order.id) {
    return { ok: false, reason: 'order', message: 'Transaction metadata belongs to a different order' };
  }
  if (metadata.buyerId !== undefined && String(metadata.buyerId) !== order.buyer_id) {
    return { ok: false, reason: 'buyer', message: 'Transaction metadata belongs to a different buyer' };
  }

  const confirmedEmail = result.customerEmail?.trim().toLowerCase();
  const expectedEmail = buyerEmail?.trim().toLowerCase();
  if (confirmedEmail && expectedEmail && confirmedEmail !== expectedEmail) {
    return { ok: false, reason: 'buyer', message: 'Transaction customer does not match the order buyer' };
  }

  if (!Number.isSafeInteger(result.amountMinor) || result.amountMinor !== order.total_cents) {
    return {
      ok: false,
      reason: 'amount',
      message: `Amount mismatch: expected ${order.total_cents}, got ${String(result.amountMinor)}`,
    };
  }

  if (!result.currency || result.currency.toUpperCase() !== order.currency.toUpperCase()) {
    return {
      ok: false,
      reason: 'currency',
      message: `Currency mismatch: expected ${order.currency}, got ${String(result.currency)}`,
    };
  }

  return { ok: true };
}
