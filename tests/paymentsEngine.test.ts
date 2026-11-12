import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  uidFromAuthHeader: vi.fn(),
  firestoreAdmin: vi.fn(),
  initializeTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
}));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({ supabaseAdmin: mocks.supabaseAdmin }));
vi.mock('../api/_lib/firebaseApp.js', () => ({
  uidFromAuthHeader: mocks.uidFromAuthHeader,
  firestoreAdmin: mocks.firestoreAdmin,
  firebaseApp: vi.fn(),
}));
vi.mock('../api/_lib/paystack.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/_lib/paystack.js')>();
  return {
    ...actual,
    initializeTransaction: mocks.initializeTransaction,
    verifyTransaction: mocks.verifyTransaction,
  };
});

const BUYER = 'buyer-1';
const SELLER = 'seller-1';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

interface Insert {
  table: string;
  row: any;
}

function fakeDb(state: { inserts: Insert[]; updates: Array<{ table: string; row: any }>; order: any; product: any }) {
  const client: any = {
    from(table: string) {
      const query: any = { table, __update: null };
      query.select = () => query;
      query.eq = () => query;
      query.maybeSingle = async () => {
        if (table === 'products') return { data: state.product, error: null };
        if (table === 'creator_accounts') return { data: { provider: 'stripe', payouts_enabled: true }, error: null };
        if (table === 'users') return { data: { email: 'buyer@example.com', display_name: 'Buyer' }, error: null };
        if (table === 'purchases') return { data: null, error: null };
        if (table === 'orders') return { data: state.order, error: null };
        return { data: null, error: null };
      };
      query.single = async () => {
        if (table === 'orders') return { data: state.order, error: null };
        return { data: null, error: null };
      };
      query.insert = async (row: any) => {
        state.inserts.push({ table, row });
        return { error: null };
      };
      query.update = (row: any) => {
        query.__update = row;
        return query;
      };
      query.upsert = async (row: any) => {
        state.inserts.push({ table, row });
        return { error: null };
      };
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (query.__update) {
          state.updates.push({ table, row: query.__update });
          if (table === 'orders' && query.__update.status === 'paid') state.order.status = 'paid';
          if (table === 'orders' && query.__update.status === 'failed') state.order.status = 'failed';
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      };
      return query;
    },
  };
  return client;
}

function firestoreFake() {
  return {
    doc: (path: string) => ({ path }),
    runTransaction: vi.fn(async (cb: any) =>
      cb({
        get: async () => ({ exists: false, data: () => ({ promotion: null, title: 'Event' }) }),
        update: () => undefined,
        set: () => undefined,
      }),
    ),
  };
}

describe('payment engine', () => {
  let state: any;

  beforeEach(() => {
    vi.stubEnv('PAYMENT_PROVIDER', 'stripe');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_stripe');
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_paystack');
    vi.stubEnv('PAYSTACK_CURRENCIES', 'NGN,USD');
    vi.stubEnv('PAYSTACK_WEBHOOK_SECRET', 'whsec_test');

    state = {
      inserts: [],
      updates: [],
      product: {
        id: 'product-1',
        title: 'Naira guide',
        creator_uid: SELLER,
        status: 'published',
        price_cents: 500000,
        currency: 'NGN',
      },
      order: null,
    };

    mocks.supabaseAdmin.mockReturnValue(fakeDb(state));
    mocks.uidFromAuthHeader.mockResolvedValue(BUYER);
    mocks.firestoreAdmin.mockReturnValue(firestoreFake());
    mocks.initializeTransaction.mockImplementation(async input => ({
      authorization_url: 'https://checkout.paystack.com/abc',
      access_code: 'abc',
      reference: input.reference,
    }));
    mocks.verifyTransaction.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates one NGN order and initializes Paystack with integer minor units', async () => {
    const { createCheckout } = await import('../api/_lib/payments.js');
    const result = await createCheckout(
      { kind: 'product', targetId: 'product-1', provider: 'paystack' },
      'Bearer token',
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      provider: 'paystack',
      currency: 'NGN',
      amountMinor: 500000,
      authorizationUrl: 'https://checkout.paystack.com/abc',
    });

    const order = state.inserts.find((i: Insert) => i.table === 'orders')?.row;
    expect(order).toMatchObject({
      buyer_id: BUYER,
      status: 'pending',
      currency: 'NGN',
      total_cents: 500000,
      provider: 'paystack',
      fee_cents: 50000,
      seller_cents: 450000,
      funds_held: true,
    });

    expect(mocks.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'buyer@example.com',
        amountMinor: 500000,
        currency: 'NGN',
        reference: order.id,
        metadata: expect.objectContaining({ orderId: order.id, buyerId: BUYER, provider: 'paystack' }),
      }),
    );
  });

  it('offers only active providers that can charge the order currency', async () => {
    const { getCheckoutOptions } = await import('../api/_lib/payments.js');

    const ngn = await getCheckoutOptions({ kind: 'product', targetId: 'product-1' }, 'Bearer token');
    expect(ngn.status).toBe(200);
    expect(ngn.body).toMatchObject({ currency: 'NGN', amountMinor: 500000, free: false, sellerReady: true });
    expect(ngn.body.providers).toEqual([expect.objectContaining({ id: 'paystack', enabled: true })]);
    expect(ngn.body.comingSoonProviders).toEqual([{ id: 'stripe', label: 'Stripe' }]);

    state.product = { ...state.product, price_cents: 1200, currency: 'USD' };
    const usd = await getCheckoutOptions({ kind: 'product', targetId: 'product-1' }, 'Bearer token');
    expect(usd.body.providers).toEqual([expect.objectContaining({ id: 'paystack', enabled: true })]);
  });

  it('rejects Stripe checkout while Stripe is coming soon', async () => {
    const { createCheckout } = await import('../api/_lib/payments.js');
    const result = await createCheckout(
      { kind: 'product', targetId: 'product-1', provider: 'stripe' },
      'Bearer token',
    );

    expect(result.status).toBe(400);
    expect(String(result.body.error)).toMatch(/coming soon/i);
    expect(state.inserts.some((i: Insert) => i.table === 'orders')).toBe(false);
    expect(mocks.initializeTransaction).not.toHaveBeenCalled();
  });

  it('marks the order paid only after a matching verification', async () => {
    const { __testing } = await import('../api/_lib/payments.js');
    state.order = {
      id: ORDER_ID,
      buyer_id: BUYER,
      status: 'pending',
      provider: 'paystack',
      total_cents: 900,
      currency: 'NGN',
      metadata: { orderId: ORDER_ID, buyerId: BUYER, tierId: 'feed_3d' },
      kind: 'event_boost',
      target_id: 'event-1',
      seller_id: null,
      seller_cents: 0,
      funds_held: false,
    };

    await __testing.fulfilOrder(ORDER_ID, 'paystack', {
      status: 'success',
      reference: ORDER_ID,
      providerTransactionId: 'tx-1',
      amountMinor: 900,
      currency: 'NGN',
      customerEmail: 'buyer@example.com',
      metadata: { orderId: ORDER_ID, buyerId: BUYER },
    });

    expect(state.updates).toContainEqual({
      table: 'orders',
      row: expect.objectContaining({ status: 'paid', provider_transaction_id: 'tx-1' }),
    });
    const firestore = mocks.firestoreAdmin.mock.results[0]?.value;
    expect(firestore.runTransaction).toHaveBeenCalledTimes(1);

    // A webhook replay after fulfilment must not claim the order again.
    await __testing.fulfilOrder(ORDER_ID, 'paystack', {
      status: 'success',
      reference: ORDER_ID,
      providerTransactionId: 'tx-1',
      amountMinor: 900,
      currency: 'NGN',
      metadata: { orderId: ORDER_ID, buyerId: BUYER },
    });
    expect(state.updates.filter((u: { row: any }) => u.row.status === 'paid')).toHaveLength(1);
  });

  it('rejects an amount mismatch and grants nothing', async () => {
    const { __testing } = await import('../api/_lib/payments.js');
    state.order = {
      id: ORDER_ID,
      buyer_id: BUYER,
      status: 'pending',
      provider: 'paystack',
      total_cents: 900,
      currency: 'NGN',
      metadata: { orderId: ORDER_ID, buyerId: BUYER, tierId: 'feed_3d' },
      kind: 'event_boost',
      target_id: 'event-1',
      seller_id: null,
      seller_cents: 0,
      funds_held: false,
    };

    await __testing.fulfilOrder(ORDER_ID, 'paystack', {
      status: 'success',
      reference: ORDER_ID,
      providerTransactionId: 'tx-2',
      amountMinor: 899,
      currency: 'NGN',
      metadata: { orderId: ORDER_ID, buyerId: BUYER },
    });

    expect(state.updates).toContainEqual({ table: 'orders', row: { status: 'failed' } });
    expect(state.order.status).toBe('failed');
    expect(mocks.firestoreAdmin).not.toHaveBeenCalled();
  });

  it('verifies a signed charge.success webhook before fulfilling', async () => {
    const { handlePaystackWebhook } = await import('../api/_lib/payments.js');
    state.order = {
      id: ORDER_ID,
      buyer_id: BUYER,
      status: 'pending',
      provider: 'paystack',
      total_cents: 900,
      currency: 'NGN',
      metadata: { orderId: ORDER_ID, buyerId: BUYER, tierId: 'feed_3d' },
      kind: 'event_boost',
      target_id: 'event-1',
      seller_id: null,
      seller_cents: 0,
      funds_held: false,
    };
    mocks.verifyTransaction.mockResolvedValue({
      id: 123,
      status: 'success',
      reference: ORDER_ID,
      amount: 900,
      currency: 'NGN',
      customer: { email: 'buyer@example.com' },
      metadata: { orderId: ORDER_ID, buyerId: BUYER },
    });

    const rawBody = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { id: 123, reference: ORDER_ID } }),
    );
    const legacySignature = crypto.createHmac('sha512', 'sk_test_paystack').update(rawBody).digest('hex');

    const result = await handlePaystackWebhook(rawBody, { legacySignature });
    expect(result.status).toBe(200);
    expect(mocks.verifyTransaction).toHaveBeenCalledWith(ORDER_ID);
    expect(state.updates).toContainEqual({
      table: 'orders',
      row: expect.objectContaining({ status: 'paid', provider_transaction_id: '123' }),
    });
    expect(state.inserts).toContainEqual({
      table: 'payment_events',
      row: expect.objectContaining({ provider: 'paystack', type: 'charge.success', order_id: ORDER_ID }),
    });
  });

  it('accepts the current Paystack-Signature header end to end', async () => {
    const { handlePaystackWebhook } = await import('../api/_lib/payments.js');
    state.order = {
      id: ORDER_ID,
      buyer_id: BUYER,
      status: 'pending',
      provider: 'paystack',
      total_cents: 900,
      currency: 'NGN',
      metadata: { orderId: ORDER_ID, buyerId: BUYER, tierId: 'feed_3d' },
      kind: 'event_boost',
      target_id: 'event-1',
      seller_id: null,
      seller_cents: 0,
      funds_held: false,
    };
    mocks.verifyTransaction.mockResolvedValue({
      id: 456,
      status: 'success',
      reference: ORDER_ID,
      amount: 900,
      currency: 'NGN',
      customer: { email: 'buyer@example.com' },
      metadata: { orderId: ORDER_ID, buyerId: BUYER },
    });

    const rawBody = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { id: 456, reference: ORDER_ID } }),
    );
    const t = Math.floor(Date.now() / 1000);
    const hex = crypto
      .createHmac('sha512', 'whsec_test')
      .update(`${t}.`)
      .update(rawBody)
      .digest('hex');

    const result = await handlePaystackWebhook(rawBody, {
      paystackSignature: `t=${t},v1=whk_test:${hex}`,
      // A valid legacy header must not be used when the current header is present.
      legacySignature: crypto.createHmac('sha512', 'wrong').update(rawBody).digest('hex'),
    });
    expect(result.status).toBe(200);
    expect(state.updates).toContainEqual({
      table: 'orders',
      row: expect.objectContaining({ status: 'paid', provider_transaction_id: '456' }),
    });
  });

  it('rejects a webhook with a bad signature before touching the database', async () => {
    const { handlePaystackWebhook } = await import('../api/_lib/payments.js');
    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 1 } }));
    const result = await handlePaystackWebhook(rawBody, { legacySignature: 'not-a-signature' });

    expect(result.status).toBe(401);
    expect(state.inserts).toHaveLength(0);
    expect(mocks.verifyTransaction).not.toHaveBeenCalled();
  });
});
