/**
 * Shared payment error types.
 *
 * These live outside the provider modules so the engine, Stripe, Paystack and the tests can all
 * agree on what a configuration problem is without importing provider SDKs.
 */

/** Server configuration is missing or invalid. Surfaces as 503 (not the user's fault). */
export class ProviderConfigError extends Error {}

/** The requested provider cannot handle this request/currency. Surfaces as 400. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    public readonly provider?: string,
  ) {
    super(message);
  }
}
