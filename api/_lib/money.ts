/**
 * Integer money helpers.
 *
 * All amounts that cross the payment boundary are integer minor units (kobo for NGN, cents for
 * USD). Never multiply or divide a float for money: `toMinorUnits` parses the decimal text and
 * `computeFee` uses integer arithmetic.
 */

export const SUPPORTED_CURRENCIES = ['NGN', 'USD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export class MoneyError extends Error {}

/** Uppercases and validates a currency against the database's fixed set. */
export function normalizeCurrency(value: unknown): SupportedCurrency {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!SUPPORTED_CURRENCIES.includes(code as SupportedCurrency)) {
    throw new MoneyError(`Unsupported currency: ${String(value ?? 'missing')}`);
  }
  return code as SupportedCurrency;
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === 'string' && SUPPORTED_CURRENCIES.includes(value.trim().toUpperCase() as SupportedCurrency);
}

/**
 * Converts a major-unit amount (naira/dollars) to integer minor units.
 *
 * Accepts a decimal string or a number that stringifies to a plain decimal. Rejects exponents,
 * separators, more than two decimal places and negative values rather than rounding silently.
 */
export function toMinorUnits(amount: string | number, currency?: string): number {
  if (currency !== undefined) normalizeCurrency(currency);

  const text = typeof amount === 'number' ? String(amount) : amount.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new MoneyError(`Invalid amount: ${String(amount)}`);
  }

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const minor = whole * 100 + fraction;

  assertMinorUnits(minor);
  return minor;
}

/** Amounts must be non-negative safe integers. */
export function assertMinorUnits(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new MoneyError('Amount must be a non-negative integer in minor units');
  }
}

/** Platform fee in minor units. 1000 bps = 10%. Rounds to the nearest minor unit. */
export function computeFee(amountMinor: number, basisPoints: number): number {
  assertMinorUnits(amountMinor);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new MoneyError('Platform fee must be between 0 and 10000 basis points');
  }
  // BigInt keeps the multiplication exact; Number alone can lose precision for large amounts.
  const fee = (BigInt(amountMinor) * BigInt(basisPoints) + 5_000n) / 10_000n;
  const result = Number(fee);
  assertMinorUnits(result);
  return result;
}

/** When a sale becomes withdrawable. Kept pure so the hold rule is testable. */
export function payoutAvailableAt(holdDays: number, now: number = Date.now()): string {
  const days = Number.isFinite(holdDays) ? Math.max(0, holdDays) : 0;
  return new Date(now + days * 86_400_000).toISOString();
}
