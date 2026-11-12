import { describe, expect, it } from 'vitest';
import { validatePaymentResult } from '../api/_lib/paymentValidation.js';
import type { NormalizedPaymentResult } from '../api/_lib/paymentProviders.js';

const order = {
  id: '11111111-1111-4111-8111-111111111111',
  buyer_id: 'buyer-1',
  total_cents: 500000,
  currency: 'NGN',
  metadata: { orderId: '11111111-1111-4111-8111-111111111111', buyerId: 'buyer-1' },
};

function result(patch: Partial<NormalizedPaymentResult> = {}): NormalizedPaymentResult {
  return {
    status: 'success',
    reference: order.id,
    providerTransactionId: 'tx-1',
    amountMinor: 500000,
    currency: 'NGN',
    customerEmail: 'buyer@example.com',
    metadata: { orderId: order.id, buyerId: order.buyer_id },
    ...patch,
  };
}

describe('validatePaymentResult', () => {
  it('accepts a matching transaction', () => {
    expect(validatePaymentResult(order, result(), 'buyer@example.com')).toEqual({ ok: true });
  });

  it('rejects non-success statuses', () => {
    expect(validatePaymentResult(order, result({ status: 'pending' }))).toMatchObject({ ok: false, reason: 'status' });
    expect(validatePaymentResult(order, result({ status: 'failed' }))).toMatchObject({ ok: false, reason: 'status' });
  });

  it('rejects a reference for another order', () => {
    expect(validatePaymentResult(order, result({ reference: 'another-order' }))).toMatchObject({
      ok: false,
      reason: 'reference',
    });
  });

  it('rejects metadata for another order or buyer', () => {
    expect(validatePaymentResult(order, result({ metadata: { orderId: 'other' } }))).toMatchObject({
      ok: false,
      reason: 'order',
    });
    expect(validatePaymentResult(order, result({ metadata: { buyerId: 'other' } }))).toMatchObject({
      ok: false,
      reason: 'buyer',
    });
  });

  it('rejects a different customer email when both are known', () => {
    expect(validatePaymentResult(order, result(), 'someone@example.com')).toMatchObject({
      ok: false,
      reason: 'buyer',
    });
  });

  it('rejects amount and currency mismatches', () => {
    expect(validatePaymentResult(order, result({ amountMinor: 499999 }))).toMatchObject({ ok: false, reason: 'amount' });
    expect(validatePaymentResult(order, result({ amountMinor: -1 }))).toMatchObject({ ok: false, reason: 'amount' });
    expect(validatePaymentResult(order, result({ currency: 'USD' }))).toMatchObject({ ok: false, reason: 'currency' });
  });
});
