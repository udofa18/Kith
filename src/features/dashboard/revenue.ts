/**
 * Revenue aggregation for the creator dashboard.
 *
 * Paystack is the active provider and settles in naira, so the dashboard totals NGN whenever the
 * creator has NGN sales and only falls back to USD for older Stripe sales. Naira and dollars are
 * never added together: a mixed total would silently misstate what the creator earned.
 */

/** Currencies the dashboard can headline, most relevant first. */
export const REVENUE_CURRENCY_ORDER = ['NGN', 'USD'] as const;

export interface RevenueSale {
  /** ISO 4217 code as stored on the order item. */
  currency: string;
  /** The creator's share in minor units (kobo/cents). */
  amountCents: number;
  /** ISO timestamp of the payment; null when the order has not been paid. */
  paidAt: string | null;
}

export interface RevenueMonth {
  /** Bucket key, e.g. `2026-10`. */
  key: string;
  /** Short axis label, e.g. `Oct`. */
  label: string;
}

export interface RevenueSummary {
  /** Currency every total below is expressed in. */
  currency: string;
  /** Creator share for the selected currency across all sales, minor units. */
  totalCents: number;
  /** Creator share per month for the chart, major units. */
  monthly: Array<{ month: string; amount: number }>;
}

/** The currency to headline: naira when present, then USD, then naira for an empty dashboard. */
export function pickRevenueCurrency(currencies: Iterable<string>): string {
  const present = new Set<string>();
  for (const code of currencies) {
    if (typeof code === 'string' && code.trim()) present.add(code.trim().toUpperCase());
  }
  return REVENUE_CURRENCY_ORDER.find(code => present.has(code)) ?? REVENUE_CURRENCY_ORDER[0];
}

function amountOf(sale: RevenueSale): number {
  const amount = Number(sale.amountCents);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Totals one currency and buckets it into the supplied months.
 *
 * Sales without a valid `paidAt` still count toward the headline total (the query only returns paid
 * orders) but cannot be placed on the chart.
 */
export function summarizeRevenue(sales: RevenueSale[], months: RevenueMonth[]): RevenueSummary {
  const currency = pickRevenueCurrency(sales.map(sale => sale.currency));
  const matching = sales.filter(sale => sale.currency?.toUpperCase() === currency);

  const totalCents = matching.reduce((sum, sale) => sum + amountOf(sale), 0);

  const totals = new Map(months.map(month => [month.key, 0]));
  for (const sale of matching) {
    if (!sale.paidAt) continue;
    const paid = new Date(sale.paidAt);
    if (Number.isNaN(paid.getTime())) continue;
    const key = `${paid.getFullYear()}-${paid.getMonth()}`;
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + amountOf(sale) / 100);
  }

  return {
    currency,
    totalCents,
    monthly: months.map(month => ({
      month: month.label,
      amount: Number((totals.get(month.key) ?? 0).toFixed(2)),
    })),
  };
}
