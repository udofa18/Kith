import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  uidFromAuthHeader: vi.fn(),
  firestoreAdmin: vi.fn(),
  initializeTransaction: vi.fn(),
  createPlan: vi.fn(),
  disableSubscription: vi.fn(),
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
    createPlan: mocks.createPlan,
    disableSubscription: mocks.disableSubscription,
  };
});
vi.mock('../src/firebase', () => ({ db: {} }));

const BUYER = 'buyer-1';
const OWNER = 'owner-1';

function snapshot(value: any) {
  return { exists: value != null, data: () => value };
}

/** Minimal Firestore fake: only the community, member, ban and join-request documents are read during checkout. */
function firestoreFake(state: { community: any; member: any; joinRequest?: any; ban?: any; memberDeleted?: boolean }) {
  return {
    doc: (path: string) => ({
      path,
      get: async () => {
        if (/^communities\/[^/]+$/.test(path)) return snapshot(state.community);
        if (/^communities\/[^/]+\/members\/[^/]+$/.test(path)) return snapshot(state.member);
        if (/^communities\/[^/]+\/bans\/[^/]+$/.test(path)) return snapshot(state.ban ?? null);
        if (/^communities\/[^/]+\/joinRequests\/[^/]+$/.test(path)) return snapshot(state.joinRequest ?? null);
        return snapshot(null);
      },
    }),
    runTransaction: async (cb: any) =>
      cb({
        get: async (ref: any) => ref.get(),
        delete: () => {
          state.memberDeleted = true;
        },
        update: () => undefined,
        set: () => undefined,
      }),
  };
}

/** PostgREST-shaped fake that records writes so tests can assert on the order and subscription rows. */
function fakeDb(state: any) {
  return {
    from(table: string) {
      const query: any = { table, __update: null };
      query.select = () => query;
      query.eq = () => query;
      query.is = () => query;
      query.order = () => query;
      query.limit = () => query;
      query.maybeSingle = async () => {
        if (table === 'users') return { data: { email: 'buyer@example.com', display_name: 'Buyer' }, error: null };
        if (table === 'community_subscription_plans') return { data: state.plan, error: null };
        if (table === 'community_subscriptions') return { data: state.subscription, error: null };
        return { data: null, error: null };
      };
      query.single = async () => {
        if (table === 'orders') return { data: state.order, error: null };
        return { data: null, error: null };
      };
      query.insert = async (row: any) => {
        state.inserts.push({ table, row });
        if (table === 'orders') state.order = row;
        if (table === 'community_subscription_plans') state.plan = { provider_plan_code: row.provider_plan_code };
        return { error: null };
      };
      query.upsert = async (row: any) => {
        state.upserts.push({ table, row });
        if (table === 'community_subscriptions') state.subscription = row;
        return { error: null };
      };
      query.update = (row: any) => {
        query.__update = row;
        return query;
      };
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (query.__update) state.updates.push({ table, row: query.__update });
        return Promise.resolve({ error: null }).then(resolve, reject);
      };
      return query;
    },
  };
}

describe('community membership payments', () => {
  let state: any;

  beforeEach(() => {
    vi.stubEnv('PAYMENT_PROVIDER', 'paystack');
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_paystack');
    vi.stubEnv('PAYSTACK_CURRENCIES', 'NGN,USD');

    state = {
      inserts: [] as Array<{ table: string; row: any }>,
      updates: [] as Array<{ table: string; row: any }>,
      upserts: [] as Array<{ table: string; row: any }>,
      order: null,
      plan: null,
      subscription: null,
      joinRequest: null,
      ban: null,
      community: {
        id: 'community-1',
        name: 'Design Guild',
        creatorId: OWNER,
        fee: { amount: 10, currency: 'usd', interval: 'once' },
      },
      member: null,
    };

    mocks.supabaseAdmin.mockReturnValue(fakeDb(state));
    mocks.uidFromAuthHeader.mockResolvedValue(BUYER);
    mocks.firestoreAdmin.mockReturnValue(firestoreFake(state));
    mocks.initializeTransaction.mockImplementation(async (input: any) => ({
      authorization_url: 'https://checkout.paystack.com/membership',
      access_code: 'abc',
      reference: input.reference,
    }));
    mocks.createPlan.mockImplementation(async (input: any) => ({
      plan_code: 'PLN_monthly123',
      name: input.name,
      amount: input.amountMinor,
      interval: 'monthly',
      currency: input.currency,
    }));
    mocks.disableSubscription.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('parseCommunityFee', () => {
    it('parses real-money, recurring and legacy XP fees', async () => {
      const { __testing } = await import('../api/_lib/payments.js');

      expect(__testing.parseCommunityFee({ fee: { amount: 5, currency: 'usd', interval: 'once' } })).toEqual({
        amount: 5,
        currency: 'usd',
        interval: 'once',
      });
      expect(__testing.parseCommunityFee({ fee: { amount: 12.5, currency: 'usd', interval: 'month' } })).toEqual({
        amount: 12.5,
        currency: 'usd',
        interval: 'month',
      });
      // XP can never recur, even if a client writes the field.
      expect(__testing.parseCommunityFee({ fee: { amount: 50, currency: 'xp', interval: 'month' } })).toEqual({
        amount: 50,
        currency: 'xp',
        interval: 'once',
      });
      expect(__testing.parseCommunityFee({ isPaid: true, price: 25 })).toEqual({
        amount: 25,
        currency: 'xp',
        interval: 'once',
      });
      expect(__testing.parseCommunityFee({ isPaid: false, price: 25 })).toBeNull();
      expect(__testing.parseCommunityFee({ fee: { amount: 0 } })).toBeNull();
    });
  });

  it('creates a one-time USD order without a Paystack plan', async () => {
    const { createCheckout } = await import('../api/_lib/payments.js');
    const result = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      provider: 'paystack',
      currency: 'USD',
      amountMinor: 1000,
      authorizationUrl: 'https://checkout.paystack.com/membership',
    });
    expect(mocks.createPlan).not.toHaveBeenCalled();
    expect(state.upserts.filter((u: any) => u.table === 'community_subscriptions')).toHaveLength(0);

    const order = state.inserts.find((i: any) => i.table === 'orders')?.row;
    expect(order).toMatchObject({
      buyer_id: BUYER,
      kind: 'community_membership',
      target_id: 'community-1',
      seller_id: OWNER,
      currency: 'USD',
      total_cents: 1000,
      status: 'pending',
      funds_held: true,
      metadata: expect.objectContaining({ communityId: 'community-1', memberId: BUYER, interval: 'once' }),
    });
    expect(mocks.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 1000, currency: 'USD', plan: undefined }),
    );
  });

  it('creates a Paystack plan and a pending subscription before monthly checkout', async () => {
    state.community.fee = { amount: 15, currency: 'usd', interval: 'month' };

    const { createCheckout } = await import('../api/_lib/payments.js');
    const result = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');

    expect(result.status).toBe(200);
    expect(mocks.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 1500, currency: 'USD', interval: 'monthly' }),
    );
    expect(mocks.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinor: 1500, currency: 'USD', plan: 'PLN_monthly123' }),
    );

    const order = state.inserts.find((i: any) => i.table === 'orders')?.row;
    expect(order.metadata).toMatchObject({ interval: 'month', paystackPlanCode: 'PLN_monthly123' });

    const pending = state.upserts.find((u: any) => u.table === 'community_subscriptions')?.row;
    expect(pending).toMatchObject({
      community_id: 'community-1',
      member_id: BUYER,
      seller_id: OWNER,
      provider_plan_code: 'PLN_monthly123',
      provider_subscription_id: null,
      amount_cents: 1500,
      currency: 'USD',
      interval: 'month',
      status: 'pending',
      last_order_id: order.id,
    });
  });

  it('rejects card checkout for XP fees, owners and active members', async () => {
    const { createCheckout } = await import('../api/_lib/payments.js');

    state.community.fee = { amount: 50, currency: 'xp', interval: 'once' };
    const xp = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');
    expect(xp.status).toBe(400);
    expect(String(xp.body.error)).toMatch(/XP/);

    state.community.fee = { amount: 10, currency: 'usd', interval: 'once' };
    mocks.uidFromAuthHeader.mockResolvedValue(OWNER);
    const owner = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');
    expect(owner.status).toBe(400);
    expect(String(owner.body.error)).toMatch(/own community/);

    mocks.uidFromAuthHeader.mockResolvedValue(BUYER);
    state.member = { userId: BUYER, subscriptionStatus: 'active' };
    const member = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');
    expect(member.status).toBe(409);

    expect(state.inserts.filter((i: any) => i.table === 'orders')).toHaveLength(0);
    expect(mocks.initializeTransaction).not.toHaveBeenCalled();
  });

  it('lets a lapsed monthly member check out again', async () => {
    state.community.fee = { amount: 10, currency: 'usd', interval: 'month' };
    state.member = {
      userId: BUYER,
      subscriptionStatus: 'active',
      membershipExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const { createCheckout } = await import('../api/_lib/payments.js');
    const result = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');

    expect(result.status).toBe(200);
    expect(state.inserts.find((i: any) => i.table === 'orders')).toBeTruthy();
  });

  it('requires an approved join request for approval-gated communities', async () => {
    state.community.isPrivate = true;
    const { createCheckout } = await import('../api/_lib/payments.js');

    const withoutRequest = await createCheckout(
      { kind: 'community_membership', targetId: 'community-1' },
      'Bearer token',
    );
    expect(withoutRequest.status).toBe(403);
    expect(String(withoutRequest.body.error)).toMatch(/approved/);

    state.joinRequest = { status: 'pending' };
    const pending = await createCheckout(
      { kind: 'community_membership', targetId: 'community-1' },
      'Bearer token',
    );
    expect(pending.status).toBe(403);

    state.joinRequest = { status: 'approved' };
    const approved = await createCheckout(
      { kind: 'community_membership', targetId: 'community-1' },
      'Bearer token',
    );
    expect(approved.status).toBe(200);
    expect(mocks.initializeTransaction).toHaveBeenCalledTimes(1);
  });

  it('blocks a banned member from paying their way in', async () => {
    state.ban = { expiresAt: { toMillis: () => Date.now() + 86_400_000 } };
    const { createCheckout } = await import('../api/_lib/payments.js');

    const banned = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');
    expect(banned.status).toBe(403);

    // An expired ban no longer blocks checkout.
    state.ban = { expiresAt: { toMillis: () => Date.now() - 1000 } };
    const lapsed = await createCheckout({ kind: 'community_membership', targetId: 'community-1' }, 'Bearer token');
    expect(lapsed.status).toBe(200);
  });

  it('disables the Paystack subscription when a monthly member cancels', async () => {
    state.member = { userId: BUYER, role: 'member', paymentInterval: 'month' };
    state.subscription = {
      id: 'subscription-row-1',
      community_id: 'community-1',
      member_id: BUYER,
      provider_subscription_id: 'SUB_abc123',
      provider_email_token: 'email-token',
      status: 'active',
      current_period_end: '2026-12-01T00:00:00.000Z',
    };

    const { cancelCommunityMembership } = await import('../api/_lib/payments.js');
    const result = await cancelCommunityMembership({ communityId: 'community-1' }, 'Bearer token');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ cancelled: true, accessUntil: '2026-12-01T00:00:00.000Z' });
    expect(mocks.disableSubscription).toHaveBeenCalledWith({ code: 'SUB_abc123', token: 'email-token' });
    expect(state.updates).toContainEqual({
      table: 'community_subscriptions',
      row: expect.objectContaining({ status: 'cancelled' }),
    });
    expect(state.memberDeleted).toBe(true);
  });

  it('does not pretend to cancel when the subscription cannot be stopped', async () => {
    state.subscription = {
      id: 'subscription-row-1',
      provider_subscription_id: 'SUB_abc123',
      provider_email_token: null,
      status: 'active',
    };

    const { cancelCommunityMembership } = await import('../api/_lib/payments.js');
    const result = await cancelCommunityMembership({ communityId: 'community-1' }, 'Bearer token');

    expect(result.status).toBe(502);
    expect(mocks.disableSubscription).not.toHaveBeenCalled();
    expect(state.updates).not.toContainEqual({
      table: 'community_subscriptions',
      row: expect.objectContaining({ status: 'cancelled' }),
    });
  });

  it('returns cancelled=false when there is no subscription', async () => {
    state.subscription = null;

    const { cancelCommunityMembership } = await import('../api/_lib/payments.js');
    const result = await cancelCommunityMembership({ communityId: 'community-1' }, 'Bearer token');

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ cancelled: false });
    expect(mocks.disableSubscription).not.toHaveBeenCalled();
  });
});

describe('community fee helpers', () => {
  it('formats and validates real-money and XP fees', async () => {
    const { feeOf, formatFee, validateFee, feeIsRealMoney, feeIsRecurring } = await import(
      '../src/lib/communityPricing'
    );

    expect(formatFee({ amount: 10, currency: 'usd', interval: 'once' })).toBe('$10');
    expect(formatFee({ amount: 12.5, currency: 'usd', interval: 'month' })).toBe('$12.50/month');
    expect(formatFee({ amount: 250, currency: 'xp', interval: 'once' })).toBe('250 XP');

    expect(validateFee({ amount: 10, currency: 'usd', interval: 'month' })).toBeNull();
    expect(validateFee({ amount: 10, currency: 'xp', interval: 'month' })).toMatch(/once/);
    expect(validateFee({ amount: 0.5, currency: 'usd', interval: 'once' })).toMatch(/at least/);
    expect(validateFee({ amount: 12.345, currency: 'usd', interval: 'once' })).toMatch(/two decimal/);
    expect(validateFee({ amount: 10.5, currency: 'xp', interval: 'once' })).toMatch(/whole number/);

    const fee = feeOf({ fee: { amount: 9, currency: 'usd', interval: 'month' } });
    expect(fee).not.toBeNull();
    expect(feeIsRealMoney(fee)).toBe(true);
    expect(feeIsRecurring(fee)).toBe(true);
    expect(feeOf({ isPaid: true, price: 25 })).toEqual({ amount: 25, currency: 'xp', interval: 'once' });
  });
});
