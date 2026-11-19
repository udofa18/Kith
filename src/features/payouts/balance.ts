import type { BalanceResponse } from '../../lib/payments';

export interface NairaBalance {
  availableCents: number;
  pendingCents: number;
  lifetimeCents: number;
}

function toAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * The payout page always reports naira.
 *
 * Paystack settles in naira and the platform prices in naira, so the primary cards must use the NGN
 * ledger even when the creator also has older USD earnings. Dollar rows stay visible under "Other
 * balances" and are never added to the naira totals.
 */
export function nairaBalance(balance: BalanceResponse | null): NairaBalance {
  const rows = balance?.balances ?? [];
  const ngn = rows.find(row => row.currency?.toUpperCase() === 'NGN');

  if (ngn) {
    return {
      availableCents: toAmount(ngn.availableCents),
      pendingCents: toAmount(ngn.pendingCents),
      lifetimeCents: toAmount(ngn.lifetimeCents),
    };
  }

  // Responses from before per-currency balances existed only carried the headline amounts.
  if (balance?.currency?.toUpperCase() === 'NGN') {
    return {
      availableCents: toAmount(balance.availableCents),
      pendingCents: toAmount(balance.pendingCents),
      lifetimeCents: toAmount(balance.lifetimeCents),
    };
  }

  return { availableCents: 0, pendingCents: 0, lifetimeCents: 0 };
}
