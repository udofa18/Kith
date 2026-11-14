/**
 * Provider registry and adapters.
 *
 * The engine owns orders, pricing, commissions, the ledger and fulfilment. A provider adapter is
 * only responsible for starting a hosted payment and normalising the provider's answer. Adding a
 * future provider means adding an adapter here, not another order/fulfilment system.
 */
import { ProviderConfigError, ProviderUnavailableError } from './paymentErrors.js';
import { normalizeCurrency, type SupportedCurrency } from './money.js';
import * as paystack from './paystack.js';
import * as stripeApi from './stripe.js';

export type PaymentProviderId = 'stripe' | 'paystack';

export const PAYMENT_PROVIDERS: PaymentProviderId[] = ['stripe', 'paystack'];

/**
 * Providers that are implemented but deliberately hidden from new checkouts while the integration
 * is being finished. Stripe stays fully wired for in-flight payments and can be re-enabled by
 * removing it from this list; Paystack is the active provider for now.
 */
export const COMING_SOON_PROVIDERS: PaymentProviderId[] = ['stripe'];

export function providerIsComingSoon(id: PaymentProviderId): boolean {
  return COMING_SOON_PROVIDERS.includes(id);
}

export interface ProviderInfo {
  id: PaymentProviderId;
  label: string;
  currencies: SupportedCurrency[];
  enabled: boolean;
  /** Implemented, but shown as "coming soon" and not offered for new checkouts. */
  comingSoon: boolean;
}

export type NormalizedPaymentStatus = 'success' | 'pending' | 'failed' | 'cancelled';

export interface CreatePaymentSessionInput {
  orderId: string;
  kind: string;
  targetId: string;
  title: string;
  amountMinor: number;
  currency: SupportedCurrency;
  buyerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, unknown>;
  /** Paystack only: plan code that turns this payment into a subscription. */
  paystackPlanCode?: string;
}

export interface CreatedPaymentSession {
  authorizationUrl: string;
  /** Provider-side identifier used for later verification (Stripe session id, Paystack reference). */
  providerReference: string;
}

export interface NormalizedPaymentResult {
  status: NormalizedPaymentStatus;
  /** Internal order reference. Providers must echo the reference we created. */
  reference: string;
  providerTransactionId: string;
  amountMinor: number;
  currency: string;
  customerEmail?: string;
  metadata: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
  id: PaymentProviderId;
  label: string;
  info(env?: NodeJS.ProcessEnv): ProviderInfo;
  createSession(input: CreatePaymentSessionInput): Promise<CreatedPaymentSession>;
  verify(providerReference: string): Promise<NormalizedPaymentResult>;
}

const PROVIDER_LABELS: Record<PaymentProviderId, string> = {
  stripe: 'Stripe',
  paystack: 'Paystack',
};

export function isPaymentProviderId(value: unknown): value is PaymentProviderId {
  return typeof value === 'string' && PAYMENT_PROVIDERS.includes(value.trim().toLowerCase() as PaymentProviderId);
}

/**
 * The deployment default. An unknown value is an error, never a silent fallback. While the
 * configured provider is marked "coming soon" (Stripe today), new checkouts resolve to Paystack.
 */
export function defaultPaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProviderId {
  const raw = (env.PAYMENT_PROVIDER ?? 'paystack').trim().toLowerCase();
  if (!raw) return 'paystack';
  if (!isPaymentProviderId(raw)) {
    throw new ProviderConfigError(
      `PAYMENT_PROVIDER="${env.PAYMENT_PROVIDER}" is not supported. Use "stripe" or "paystack".`,
    );
  }
  return providerIsComingSoon(raw) ? 'paystack' : raw;
}

function stripeInfo(env: NodeJS.ProcessEnv): ProviderInfo {
  return {
    id: 'stripe',
    label: PROVIDER_LABELS.stripe,
    currencies: ['USD'],
    enabled: !!env.STRIPE_SECRET_KEY?.trim(),
    comingSoon: providerIsComingSoon('stripe'),
  };
}

function paystackInfo(env: NodeJS.ProcessEnv): ProviderInfo {
  return {
    id: 'paystack',
    label: PROVIDER_LABELS.paystack,
    currencies: paystack.paystackCurrencies(env),
    enabled: paystack.paystackEnabled(env),
    comingSoon: providerIsComingSoon('paystack'),
  };
}

export function providerInfo(env: NodeJS.ProcessEnv = process.env): ProviderInfo[] {
  return [stripeInfo(env), paystackInfo(env)];
}

export function getProviderInfo(id: PaymentProviderId, env: NodeJS.ProcessEnv = process.env): ProviderInfo {
  return providerInfo(env).find(p => p.id === id)!;
}

/** Active providers that can charge `currency`. Coming-soon providers are never offered. */
export function providersForCurrency(
  currency: string,
  env: NodeJS.ProcessEnv = process.env,
): ProviderInfo[] {
  const code = normalizeCurrency(currency);
  return providerInfo(env).filter(
    p => p.enabled && !p.comingSoon && p.currencies.includes(code),
  );
}

/** Validates an explicit request override, or falls back to the deployment default. */
export function resolvePaymentProvider(
  requested: unknown,
  env: NodeJS.ProcessEnv = process.env,
): PaymentProviderId {
  const fallback = defaultPaymentProvider(env);
  let id = fallback;
  if (requested !== undefined && requested !== null && requested !== '') {
    if (!isPaymentProviderId(requested)) {
      throw new ProviderUnavailableError('Unknown payment provider', typeof requested === 'string' ? requested : undefined);
    }
    id = requested.trim().toLowerCase() as PaymentProviderId;
  }

  if (providerIsComingSoon(id)) {
    throw new ProviderUnavailableError(
      `${PROVIDER_LABELS[id]} checkout is coming soon. Pay with ${PROVIDER_LABELS.paystack} for now.`,
      id,
    );
  }

  const info = getProviderInfo(id, env);
  if (!info.enabled) {
    throw new ProviderConfigError(
      id === 'stripe'
        ? 'Stripe is not configured: STRIPE_SECRET_KEY is missing on the server.'
        : 'Paystack is not configured: PAYSTACK_SECRET_KEY is missing on the server.',
    );
  }
  return id;
}

/** Validates that the provider can charge this currency in this deployment. */
export function assertProviderSupportsCurrency(
  id: PaymentProviderId,
  currency: string,
  env: NodeJS.ProcessEnv = process.env,
): SupportedCurrency {
  const code = normalizeCurrency(currency);
  if (providerIsComingSoon(id)) {
    throw new ProviderUnavailableError(
      `${PROVIDER_LABELS[id]} checkout is coming soon. Pay with ${PROVIDER_LABELS.paystack} for now.`,
      id,
    );
  }
  const info = getProviderInfo(id, env);
  if (!info.enabled) {
    throw new ProviderConfigError(
      id === 'stripe'
        ? 'Stripe is not configured: STRIPE_SECRET_KEY is missing on the server.'
        : 'Paystack is not configured: PAYSTACK_SECRET_KEY is missing on the server.',
    );
  }
  if (!info.currencies.includes(code)) {
    if (id === 'stripe') {
      throw new ProviderUnavailableError(
        `This is priced in ${code}. Stripe card payments on Kith take USD only, so the seller needs to set a USD price.`,
        id,
      );
    }
    throw new ProviderUnavailableError(
      id === 'paystack'
        ? `Paystack is not enabled for ${code}. Ask the platform operator to confirm the merchant account can charge ${code} and add it to PAYSTACK_CURRENCIES.`
        : `The selected provider cannot charge ${code}.`,
      id,
    );
  }
  return code;
}

function objectMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

const stripeAdapter: PaymentProviderAdapter = {
  id: 'stripe',
  label: PROVIDER_LABELS.stripe,
  info: stripeInfo,
  async createSession(input) {
    const session = await stripeApi.createCheckoutSession({
      orderId: input.orderId,
      kind: input.kind,
      targetId: input.targetId,
      title: input.title,
      amountMinor: input.amountMinor,
      currency: input.currency,
      buyerEmail: input.buyerEmail,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { authorizationUrl: session.url, providerReference: session.id };
  },
  async verify(providerReference) {
    const session = await stripeApi.retrieveCheckoutSession(providerReference);
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    const status: NormalizedPaymentStatus =
      session.payment_status === 'paid'
        ? 'success'
        : session.status === 'expired'
          ? 'cancelled'
          : 'pending';
    return {
      status,
      reference: session.client_reference_id ?? '',
      providerTransactionId: paymentIntent ?? session.id,
      amountMinor: session.amount_total ?? -1,
      currency: (session.currency ?? '').toUpperCase(),
      customerEmail: session.customer_details?.email ?? session.customer_email ?? undefined,
      metadata: objectMetadata(session.metadata),
    };
  },
};

const paystackAdapter: PaymentProviderAdapter = {
  id: 'paystack',
  label: PROVIDER_LABELS.paystack,
  info: paystackInfo,
  async createSession(input) {
    const tx = await paystack.initializeTransaction({
      email: input.buyerEmail,
      amountMinor: input.amountMinor,
      currency: input.currency,
      reference: input.orderId,
      callbackUrl: input.successUrl,
      metadata: input.metadata,
      plan: input.paystackPlanCode,
    });
    return { authorizationUrl: tx.authorization_url, providerReference: tx.reference || input.orderId };
  },
  async verify(providerReference) {
    const tx = await paystack.verifyTransaction(providerReference);
    const status: NormalizedPaymentStatus =
      tx.status === 'success'
        ? 'success'
        : tx.status === 'failed' || tx.status === 'reversed'
          ? 'failed'
          : tx.status === 'abandoned'
            ? 'cancelled'
            : 'pending';
    return {
      status,
      reference: tx.reference,
      providerTransactionId: String(tx.id),
      // When Paystack charges its fee on top, `amount` is higher than the order total. Validate
      // against `requested_amount` so a successful payment is not rejected as an amount mismatch.
      amountMinor: paystack.requestedAmount(tx),
      currency: (tx.currency ?? '').toUpperCase(),
      customerEmail: tx.customer?.email ?? undefined,
      metadata: objectMetadata(tx.metadata),
    };
  },
};

export const providerAdapters: Record<PaymentProviderId, PaymentProviderAdapter> = {
  stripe: stripeAdapter,
  paystack: paystackAdapter,
};

export function providerAdapter(id: PaymentProviderId): PaymentProviderAdapter {
  return providerAdapters[id];
}
