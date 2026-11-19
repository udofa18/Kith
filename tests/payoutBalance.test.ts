import { describe, expect, it } from 'vitest';
import { nairaBalance } from '../src/features/payouts/balance';
import type { BalanceResponse } from '../src/lib/payments';

function response(overrides: Partial<BalanceResponse>): BalanceResponse {
  return {
    currency: 'USD',
    availableCents: 0,
    pendingCents: 0,
    lifetimeCents: 0,
    balances: [],
    holdDays: 7,
    minWithdrawalCents: 1000,
    payouts: [],
    earnings: [],
    ...overrides,
  };
}

describe('payout naira balance', () => {
  it('uses the naira ledger even when the API headline is dollars', () => {
    const balance = response({
      currency: 'USD',
      availableCents: 5_000,
      pendingCents: 1_000,
      lifetimeCents: 10_000,
      balances: [
        { currency: 'USD', availableCents: 5_000, pendingCents: 1_000, lifetimeCents: 10_000, withdrawable: false },
        { currency: 'NGN', availableCents: 250_000, pendingCents: 50_000, lifetimeCents: 400_000, withdrawable: false },
      ],
    });

    expect(nairaBalance(balance)).toEqual({
      availableCents: 250_000,
      pendingCents: 50_000,
      lifetimeCents: 400_000,
    });
  });

  it('matches the naira currency code case-insensitively', () => {
    const balance = response({
      balances: [
        { currency: 'ngn', availableCents: 12_500, pendingCents: 0, lifetimeCents: 12_500, withdrawable: false },
      ],
    });

    expect(nairaBalance(balance).availableCents).toBe(12_500);
  });

  it('shows zero naira instead of borrowing a dollar balance', () => {
    const balance = response({
      currency: 'USD',
      availableCents: 9_900,
      pendingCents: 100,
      lifetimeCents: 20_000,
      balances: [
        { currency: 'USD', availableCents: 9_900, pendingCents: 100, lifetimeCents: 20_000, withdrawable: false },
      ],
    });

    expect(nairaBalance(balance)).toEqual({ availableCents: 0, pendingCents: 0, lifetimeCents: 0 });
  });

  it('falls back to the headline amounts for older responses without per-currency balances', () => {
    const balance = response({
      currency: 'NGN',
      availableCents: 75_000,
      pendingCents: 5_000,
      lifetimeCents: 120_000,
      balances: undefined,
    });

    expect(nairaBalance(balance)).toEqual({
      availableCents: 75_000,
      pendingCents: 5_000,
      lifetimeCents: 120_000,
    });
  });

  it('returns zeros when there is no balance yet', () => {
    expect(nairaBalance(null)).toEqual({ availableCents: 0, pendingCents: 0, lifetimeCents: 0 });
  });
});
