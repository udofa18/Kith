import { describe, expect, it } from 'vitest';
import {
  assertProviderSupportsCurrency,
  defaultPaymentProvider,
  providersForCurrency,
  resolvePaymentProvider,
} from '../api/_lib/paymentProviders.js';
import { ProviderConfigError, ProviderUnavailableError } from '../api/_lib/paymentErrors.js';

const env = {
  STRIPE_SECRET_KEY: 'sk_test_stripe',
  PAYSTACK_SECRET_KEY: 'sk_test_paystack',
  PAYSTACK_CURRENCIES: 'NGN',
  PAYMENT_PROVIDER: 'stripe',
} as NodeJS.ProcessEnv;

describe('payment provider resolution', () => {
  it('resolves the Stripe default to Paystack while Stripe is coming soon', () => {
    expect(defaultPaymentProvider(env)).toBe('paystack');
    expect(defaultPaymentProvider({ ...env, PAYMENT_PROVIDER: 'PAYSTACK' } as NodeJS.ProcessEnv)).toBe('paystack');
    expect(defaultPaymentProvider({ ...env, PAYMENT_PROVIDER: 'paystack' } as NodeJS.ProcessEnv)).toBe('paystack');
  });

  it('errors on an unknown default instead of silently falling back', () => {
    expect(() => defaultPaymentProvider({ ...env, PAYMENT_PROVIDER: 'flutterwave' } as NodeJS.ProcessEnv)).toThrow(
      ProviderConfigError,
    );
  });

  it('only offers active providers that are enabled and support the currency', () => {
    expect(providersForCurrency('NGN', env).map(p => p.id)).toEqual(['paystack']);
    // Stripe is coming soon, so USD is empty unless Paystack is approved for USD.
    expect(providersForCurrency('USD', env).map(p => p.id)).toEqual([]);
    expect(
      providersForCurrency('USD', { ...env, PAYSTACK_CURRENCIES: 'NGN,USD' } as NodeJS.ProcessEnv).map(p => p.id),
    ).toEqual(['paystack']);
  });

  it('rejects an unavailable provider override', () => {
    expect(() => resolvePaymentProvider('paystack', { ...env, PAYSTACK_SECRET_KEY: '' } as NodeJS.ProcessEnv)).toThrow(
      ProviderConfigError,
    );
    expect(() => resolvePaymentProvider('nope', env)).toThrow(ProviderUnavailableError);
  });

  it('rejects Stripe checkout while it is marked coming soon', () => {
    expect(() => resolvePaymentProvider('stripe', env)).toThrow(/coming soon/i);
    expect(() => assertProviderSupportsCurrency('stripe', 'USD', env)).toThrow(/coming soon/i);
  });

  it('rejects a provider that cannot charge the order currency', () => {
    expect(assertProviderSupportsCurrency('paystack', 'NGN', env)).toBe('NGN');
    expect(() => assertProviderSupportsCurrency('paystack', 'USD', env)).toThrow(ProviderUnavailableError);
    expect(
      assertProviderSupportsCurrency('paystack', 'USD', { ...env, PAYSTACK_CURRENCIES: 'NGN,USD' } as NodeJS.ProcessEnv),
    ).toBe('USD');
  });
});
