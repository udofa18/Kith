import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  uidFromAuthHeader: vi.fn(),
  firestoreAdmin: vi.fn(),
  fetchSubscription: vi.fn(),
}));

vi.mock('../api/_lib/supabaseAdmin.js', () => ({ supabaseAdmin: mocks.supabaseAdmin }));
vi.mock('../api/_lib/firebaseApp.js', () => ({
  uidFromAuthHeader: mocks.uidFromAuthHeader,
  firestoreAdmin: mocks.firestoreAdmin,
}));
vi.mock('../api/_lib/paystack.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../api/_lib/paystack.js')>();
  return { ...actual, fetchSubscription: mocks.fetchSubscription };
});

const OWNER = 'owner-1';
const BUYER = 'buyer-1';
const COMMUNITY = 'community-1';

function snapshot(value: any) {
  return { exists: value != null, data: () => value };
}

function fakeDb(tables: Record<string, any>) {
  return {
    from(table: string) {
      const result = tables[table] ?? [];
      const query: any = { table };
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete', 'insert']) {
        query[method] = () => query;
      }
      query.maybeSingle = async () => ({
        data: Array.isArray(result) ? result[0] ?? null : result,
        error: null,
      });
      query.single = query.maybeSingle;
      query.then = (resolve: any, reject: any) =>
        Promise.resolve({ data: Array.isArray(result) ? result : result, error: null }).then(resolve, reject);
      return query;
    },
  };
}

/** In-memory Firestore with the document shapes these endpoints touch. */
function fakeFirestore(initial: Record<string, any>) {
  const docs = new Map<string, any>(Object.entries(initial));
  const writes: Array<{ path: string; fields: any }> = [];
  const fs: any = {
    doc(path: string) {
      return {
        path,
        get: async () => snapshot(docs.get(path)),
        set: async (fields: any) => {
          writes.push({ path, fields });
          docs.set(path, { ...(docs.get(path) ?? {}), ...fields });
        },
      };
    },
    runTransaction: async (cb: any) =>
      cb({
        get: async (ref: any) => snapshot(docs.get(ref.path)),
        delete: (ref: any) => {
          docs.delete(ref.path);
        },
        update: () => undefined,
        set: (ref: any, fields: any) => docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...fields }),
      }),
  };
  return { fs, docs, writes };
}

const SUBSCRIPTION = {
  id: 'sub-1',
  community_id: COMMUNITY,
  member_id: BUYER,
  seller_id: OWNER,
  provider: 'paystack',
  provider_plan_code: 'PLN_1',
  provider_subscription_id: 'SUB_1',
  currency: 'NGN',
  amount_cents: 500000,
  interval: 'month',
  status: 'active',
  current_period_end: '2026-12-13T09:16:00.000Z',
  last_order_id: 'order-1',
  created_at: '2026-11-13T09:16:22.000Z',
  updated_at: '2026-11-13T09:16:22.000Z',
};

const ORDER = {
  id: 'order-1',
  buyer_id: BUYER,
  seller_id: OWNER,
  status: 'paid',
  currency: 'NGN',
  total_cents: 500000,
  fee_cents: 50000,
  seller_cents: 450000,
  kind: 'community_membership',
  target_id: COMMUNITY,
  provider: 'paystack',
  provider_transaction_id: '6759399311',
  metadata: {},
  paid_at: '2026-11-13T09:25:12.000Z',
  created_at: '2026-11-13T09:16:22.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uidFromAuthHeader.mockResolvedValue(OWNER);
  mocks.supabaseAdmin.mockReturnValue(
    fakeDb({
      community_subscriptions: [SUBSCRIPTION],
      orders: [ORDER],
      users: [{ id: BUYER, username: 'daniel', display_name: 'Daniel Udofa', photo_url: null }],
    }),
  );
  mocks.firestoreAdmin.mockReturnValue(
    fakeFirestore({
      [`communities/${COMMUNITY}`]: { name: 'AI Automation', creatorId: OWNER, memberCount: 2 },
      [`communities/${COMMUNITY}/members/${OWNER}`]: { role: 'owner' },
      [`communities/${COMMUNITY}/members/${BUYER}`]: {
        role: 'member',
        paid: true,
        subscriptionStatus: 'active',
        membershipExpiresAt: '2026-12-13T09:16:00.000Z',
      },
    }).fs,
  );
});

describe('paid community memberships', () => {
  it('gives the owner the member, period, amount and reference', async () => {
    const { getCommunityPaidMembers } = await import('../api/_lib/communityBilling.js');
    const result = await getCommunityPaidMembers(COMMUNITY, 'Bearer token');

    expect(result.status).toBe(200);
    const body = result.body as any;
    expect(body.summary).toMatchObject({
      activeCount: 1,
      mrrCents: 500000,
      currency: 'NGN',
    });
    expect(body.members[0]).toMatchObject({
      memberId: BUYER,
      name: 'Daniel Udofa',
      state: 'active',
      amountCents: 500000,
      orderId: 'order-1',
      providerTransactionId: '6759399311',
      lastPaidAt: '2026-11-13T09:25:12.000Z',
      periodEnd: '2026-12-13T09:16:00.000Z',
      netCents: 450000,
    });
  });

  it('refuses the paid-member list to an ordinary member', async () => {
    mocks.uidFromAuthHeader.mockResolvedValue(BUYER);
    mocks.firestoreAdmin.mockReturnValue(
      fakeFirestore({
        [`communities/${COMMUNITY}`]: { name: 'AI Automation', creatorId: OWNER },
        [`communities/${COMMUNITY}/members/${BUYER}`]: { role: 'member' },
      }).fs,
    );

    const { getCommunityPaidMembers } = await import('../api/_lib/communityBilling.js');
    const result = await getCommunityPaidMembers(COMMUNITY, 'Bearer token');
    expect(result.status).toBe(403);
  });

  it('returns a receipt with the paid period from the subscription row', async () => {
    mocks.uidFromAuthHeader.mockResolvedValue(BUYER);
    const { getReceipt } = await import('../api/_lib/communityBilling.js');
    const result = await getReceipt('43264100-8746-41bc-a395-5609f3404110', 'Bearer token');

    expect(result.status).toBe(200);
    const receipt = (result.body as any).receipt;
    expect(receipt).toMatchObject({
      title: 'AI Automation membership',
      amountCents: 500000,
      providerTransactionId: '6759399311',
      periodEnd: '2026-12-13T09:16:00.000Z',
    });
  });

  it('mirrors the ISO expiry into the numeric fields rules compare', async () => {
    const store = fakeFirestore({
      [`communities/${COMMUNITY}`]: { name: 'AI Automation', creatorId: OWNER, memberCount: 2 },
      [`communities/${COMMUNITY}/members/${BUYER}`]: {
        role: 'member',
        paid: true,
        providerSubscriptionId: 'SUB_1',
        subscriptionStatus: 'active',
        // Legacy document: only the readable ISO string, no numeric mirror yet.
        membershipExpiresAt: '2026-12-13T09:16:00.000Z',
      },
    });
    mocks.firestoreAdmin.mockReturnValue(store.fs);

    const { reconcileCommunityMemberships } = await import('../api/_lib/communityBilling.js');
    const result = await reconcileCommunityMemberships();

    expect(result.status).toBe(200);
    const member = store.docs.get(`communities/${COMMUNITY}/members/${BUYER}`);
    expect(member.membershipExpiresAtMs).toBe(Date.parse('2026-12-13T09:16:00.000Z'));
    expect(member.accessUntilMs).toBe(Date.parse('2026-12-16T09:16:00.000Z'));
  });

  it('lists a buyer membership and its receipt', async () => {
    mocks.uidFromAuthHeader.mockResolvedValue(BUYER);
    const { getMyMemberships } = await import('../api/_lib/communityBilling.js');
    const result = await getMyMemberships('Bearer token');

    expect(result.status).toBe(200);
    const body = result.body as any;
    expect(body.memberships[0]).toMatchObject({
      communityId: COMMUNITY,
      communityName: 'AI Automation',
      state: 'active',
      canCancelRenewal: true,
    });
    expect(body.receipts[0]).toMatchObject({
      orderId: 'order-1',
      amountCents: 500000,
      periodEnd: '2026-12-13T09:16:00.000Z',
      providerTransactionId: '6759399311',
    });
  });

  it('moves a lapsed membership into grace and writes one reminder', async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const member = {
      role: 'member',
      paid: true,
      providerSubscriptionId: 'SUB_1',
      subscriptionStatus: 'active',
      membershipExpiresAt: past,
    };
    const store = fakeFirestore({
      [`communities/${COMMUNITY}`]: { name: 'AI Automation', creatorId: OWNER, memberCount: 2 },
      [`communities/${COMMUNITY}/members/${BUYER}`]: member,
    });
    mocks.firestoreAdmin.mockReturnValue(store.fs);
    mocks.supabaseAdmin.mockReturnValue(
      fakeDb({
        community_subscriptions: [
          { ...SUBSCRIPTION, status: 'attention', current_period_end: past },
        ],
      }),
    );
    mocks.fetchSubscription.mockResolvedValue({ status: 'failed', next_payment_date: null });

    const { reconcileCommunityMemberships } = await import('../api/_lib/communityBilling.js');
    const result = await reconcileCommunityMemberships();

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, movedToGrace: 1, remindersSent: 1, removed: 0 });
    expect(store.docs.get(`communities/${COMMUNITY}/members/${BUYER}`).subscriptionStatus).toBe('attention');
    expect(store.docs.get(`communities/${COMMUNITY}/members/${BUYER}`).accessUntil).toBeTruthy();
  });

  it('removes the member once grace has ended', async () => {
    const longAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const store = fakeFirestore({
      [`communities/${COMMUNITY}`]: { name: 'AI Automation', creatorId: OWNER, memberCount: 2 },
      [`communities/${COMMUNITY}/members/${BUYER}`]: {
        role: 'member',
        paid: true,
        providerSubscriptionId: 'SUB_1',
        membershipExpiresAt: longAgo,
      },
    });
    mocks.firestoreAdmin.mockReturnValue(store.fs);
    mocks.supabaseAdmin.mockReturnValue(
      fakeDb({
        community_subscriptions: [{ ...SUBSCRIPTION, status: 'attention', current_period_end: longAgo }],
      }),
    );
    mocks.fetchSubscription.mockResolvedValue({ status: 'failed', next_payment_date: null });

    const { reconcileCommunityMemberships } = await import('../api/_lib/communityBilling.js');
    const result = await reconcileCommunityMemberships();

    expect(result.body).toMatchObject({ removed: 1 });
    expect(store.docs.has(`communities/${COMMUNITY}/members/${BUYER}`)).toBe(false);
  });
});
