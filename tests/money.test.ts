import { describe, expect, it } from 'vitest';
import { computeFee, normalizeCurrency, toMinorUnits } from '../api/_lib/money.js';

describe('money', () => {
  it('converts major units to integer minor units without floating point', () => {
    expect(toMinorUnits('19.99', 'USD')).toBe(1999);
    expect(toMinorUnits(5000, 'NGN')).toBe(500000);
    expect(toMinorUnits('0.5')).toBe(50);
    expect(toMinorUnits('12')).toBe(1200);
  });

  it('rejects malformed or over-precise amounts instead of rounding silently', () => {
    expect(() => toMinorUnits('1.999')).toThrow();
    expect(() => toMinorUnits('1,000')).toThrow();
    expect(() => toMinorUnits('-1')).toThrow();
    expect(() => toMinorUnits('1e3')).toThrow();
  });

  it('normalizes and validates currencies', () => {
    expect(normalizeCurrency('ngn')).toBe('NGN');
    expect(normalizeCurrency(' usd ')).toBe('USD');
    expect(() => normalizeCurrency('EUR')).toThrow();
  });

  it('computes fees with integer basis points', () => {
    expect(computeFee(1999, 1000)).toBe(200);
    expect(computeFee(500000, 1000)).toBe(50000);
    expect(computeFee(1, 1000)).toBe(0);
    expect(() => computeFee(100, 10001)).toThrow();
  });
});
