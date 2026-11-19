import { describe, expect, it } from 'vitest';
import {
  pickRevenueCurrency,
  summarizeRevenue,
  type RevenueMonth,
  type RevenueSale,
} from '../src/features/dashboard/revenue';

const months: RevenueMonth[] = [
  { key: '2026-9', label: 'Oct' },
  { key: '2026-10', label: 'Nov' },
];

describe('dashboard revenue', () => {
  it('prefers naira and only totals naira when the creator has both currencies', () => {
    const sales: RevenueSale[] = [
      { currency: 'NGN', amountCents: 450_000, paidAt: '2026-10-05T12:00:00.000Z' },
      { currency: 'NGN', amountCents: 50_000, paidAt: '2026-11-02T12:00:00.000Z' },
      { currency: 'USD', amountCents: 1_000, paidAt: '2026-10-06T12:00:00.000Z' },
    ];

    const summary = summarizeRevenue(sales, months);

    expect(summary.currency).toBe('NGN');
    expect(summary.totalCents).toBe(500_000);
    expect(summary.monthly).toEqual([
      { month: 'Oct', amount: 4_500 },
      { month: 'Nov', amount: 500 },
    ]);
  });

  it('falls back to dollars when there are no naira sales', () => {
    const summary = summarizeRevenue(
      [{ currency: 'USD', amountCents: 2_500, paidAt: '2026-11-10T12:00:00.000Z' }],
      months,
    );

    expect(summary.currency).toBe('USD');
    expect(summary.totalCents).toBe(2_500);
    expect(summary.monthly).toEqual([
      { month: 'Oct', amount: 0 },
      { month: 'Nov', amount: 25 },
    ]);
  });

  it('defaults to naira on an empty dashboard', () => {
    const summary = summarizeRevenue([], months);

    expect(summary.currency).toBe('NGN');
    expect(summary.totalCents).toBe(0);
    expect(summary.monthly.every(month => month.amount === 0)).toBe(true);
  });

  it('matches currency codes case-insensitively and skips unpaid or invalid sales on the chart', () => {
    const sales: RevenueSale[] = [
      { currency: 'ngn', amountCents: 100_000, paidAt: '2026-10-20T12:00:00.000Z' },
      { currency: 'NGN', amountCents: 25_000, paidAt: null },
      { currency: 'NGN', amountCents: 10_000, paidAt: 'not-a-date' },
    ];

    const summary = summarizeRevenue(sales, months);

    expect(summary.currency).toBe('NGN');
    expect(summary.totalCents).toBe(135_000);
    expect(summary.monthly).toEqual([
      { month: 'Oct', amount: 1_000 },
      { month: 'Nov', amount: 0 },
    ]);
  });

  it('ignores currencies outside the supported pair when choosing the headline', () => {
    expect(pickRevenueCurrency(['EUR', 'USD'])).toBe('USD');
    expect(pickRevenueCurrency(['eur'])).toBe('NGN');
  });
});
