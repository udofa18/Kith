/**
 * Paystack provider module.
 *
 * Everything that knows about Paystack's HTTP API, amounts, currencies and webhook signatures
 * lives here. The payment engine only calls `initializeTransaction` / `verifyTransaction` through
 * the provider adapter and never talks to api.paystack.co directly.
 *
 * Docs:
 * - https://paystack.com/docs/api/transaction/
 * - https://paystack.com/docs/payments/verify-payments/
 * - https://paystack.com/docs/payments/webhooks/
 * - https://paystack.com/docs/api/transfer/ (payouts are intentionally not implemented yet)
 */
import crypto from 'crypto';
import { ProviderConfigError, ProviderUnavailableError } from './paymentErrors.js';
import {
  assertMinorUnits,
  normalizeCurrency,
  type SupportedCurrency,
} from './money.js';

const BASE_URL = 'https://api.paystack.co';
const REQUEST_TIMEOUT_MS = 20_000;
const REFERENCE_RE = /^[A-Za-z0-9._=-]{1,128}$/;
const SIGNATURE_TOLERANCE_SECONDS = 300;
const HEX_SHA512_RE = /^[0-9a-f]{128}$/i;

export class PaystackError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface PaystackConfig {
  secretKey: string;
  publicKey: string | null;
  mode: 'test' | 'live';
  /** Currencies this integration is allowed to charge. Configured explicitly, never inferred. */
  currencies: SupportedCurrency[];
  /** `whsec_...` values used by the current Paystack-Signature header. */
  webhookSecrets: string[];
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  return (env[key] ?? '').trim();
}

/**
 * Validates the Paystack environment. Throws instead of guessing: a missing key, the wrong
 * test/live key or an unsupported currency must stop checkout rather than silently switch mode.
 */
export function paystackConfig(env: NodeJS.ProcessEnv = process.env): PaystackConfig {
  const secretKey = requiredEnv(env, 'PAYSTACK_SECRET_KEY');
  if (!secretKey) {
    throw new ProviderConfigError('Paystack is not configured: PAYSTACK_SECRET_KEY is missing on the server.');
  }
  if (!/^sk_(test|live)_/.test(secretKey)) {
    throw new ProviderConfigError('Paystack is misconfigured: PAYSTACK_SECRET_KEY must start with sk_test_ or sk_live_.');
  }

  const keyMode = secretKey.startsWith('sk_live_') ? 'live' : 'test';
  const configuredMode = requiredEnv(env, 'PAYSTACK_MODE').toLowerCase();
  if (configuredMode && configuredMode !== 'test' && configuredMode !== 'live') {
    throw new ProviderConfigError('Paystack is misconfigured: PAYSTACK_MODE must be "test" or "live".');
  }
  if (configuredMode && configuredMode !== keyMode) {
    throw new ProviderConfigError(
      `Paystack is misconfigured: PAYSTACK_MODE=${configuredMode} but PAYSTACK_SECRET_KEY is a ${keyMode} key.`,
    );
  }

  // Both currencies are enabled by default because this merchant account is approved for NGN and
  // USD. Operators can still restrict the list; only advertise currencies Paystack has approved.
  const rawCurrencies = requiredEnv(env, 'PAYSTACK_CURRENCIES') || 'NGN,USD';
  const currencies: SupportedCurrency[] = [];
  for (const raw of rawCurrencies.split(',')) {
    const value = raw.trim();
    if (!value) continue;
    let currency: SupportedCurrency;
    try {
      currency = normalizeCurrency(value);
    } catch {
      throw new ProviderConfigError(
        `Paystack is misconfigured: PAYSTACK_CURRENCIES contains "${value}". Kith supports NGN and USD.`,
      );
    }
    if (!currencies.includes(currency)) currencies.push(currency);
  }
  if (currencies.length === 0) {
    throw new ProviderConfigError('Paystack is misconfigured: PAYSTACK_CURRENCIES must list at least one currency.');
  }

  // Active signing secrets can overlap during rotation; Paystack sends one v1 per active secret.
  const webhookSecrets = requiredEnv(env, 'PAYSTACK_WEBHOOK_SECRET')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  for (const secret of webhookSecrets) {
    if (!secret.startsWith('whsec_')) {
      throw new ProviderConfigError('Paystack is misconfigured: PAYSTACK_WEBHOOK_SECRET must start with whsec_.');
    }
  }

  return {
    secretKey,
    publicKey: requiredEnv(env, 'PAYSTACK_PUBLIC_KEY') || null,
    mode: keyMode,
    currencies,
    webhookSecrets,
  };
}

/** Never throws: useful for capability discovery in the checkout UI. */
export function paystackEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!requiredEnv(env, 'PAYSTACK_SECRET_KEY');
}

/** Currencies configured for this deployment. Invalid configuration falls back to none here. */
export function paystackCurrencies(env: NodeJS.ProcessEnv = process.env): SupportedCurrency[] {
  try {
    return paystackConfig(env).currencies;
  } catch {
    return [];
  }
}

function assertPaystackCurrency(currency: string, config: PaystackConfig): SupportedCurrency {
  const code = normalizeCurrency(currency);
  if (!config.currencies.includes(code)) {
    throw new ProviderUnavailableError(
      `Paystack is not enabled for ${code} on this deployment. Configured currencies: ${config.currencies.join(', ')}.`,
      'paystack',
    );
  }
  return code;
}

function assertReference(reference: string): void {
  if (!REFERENCE_RE.test(reference)) {
    throw new PaystackError('Invalid Paystack transaction reference', 400);
  }
}

function assertCallbackUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PaystackError('Invalid Paystack callback URL', 400);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new PaystackError('Invalid Paystack callback URL', 400);
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { secretKey } = paystackConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = e instanceof Error && e.name === 'AbortError' ? 'Paystack timed out' : 'Could not reach Paystack';
    throw new PaystackError(reason, 502);
  } finally {
    clearTimeout(timer);
  }

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new PaystackError(json.message || `Paystack request failed (${res.status})`, res.status);
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface InitializeInput {
  email: string;
  amountMinor: number;
  currency: string;
  /** Unique reference. Kith uses the internal order id. */
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  /**
   * Optional Paystack plan code. When present Paystack creates a subscription after a successful
   * charge and charges the plan amount (which must equal `amountMinor`).
   */
  plan?: string;
  /** Optional channels allow-list, e.g. ['card', 'bank_transfer']. */
  channels?: string[];
  /**
   * Optional split-payment fields. Kith collection stays on the platform account so creator
   * earnings can use the existing ledger and Stripe Connect payouts. Kept for a future adapter.
   */
  subaccountCode?: string;
  platformFeeMinor?: number;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export function initializeTransaction(input: InitializeInput): Promise<InitializeResult> {
  const config = paystackConfig();
  assertPaystackCurrency(input.currency, config);
  assertMinorUnits(input.amountMinor);
  if (input.amountMinor === 0) throw new PaystackError('Paystack cannot charge a zero amount', 400);
  assertReference(input.reference);
  assertCallbackUrl(input.callbackUrl);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new PaystackError('A valid customer email is required for Paystack', 400);
  }

  const body: Record<string, unknown> = {
    email: input.email,
    amount: input.amountMinor,
    currency: input.currency.toUpperCase(),
    reference: input.reference,
    callback_url: input.callbackUrl,
    // Paystack documents metadata as a stringified JSON object.
    metadata: JSON.stringify(input.metadata),
  };
  if (input.plan) {
    if (!/^PLN_[A-Za-z0-9]+$/.test(input.plan)) throw new PaystackError('Invalid Paystack plan code', 400);
    body.plan = input.plan;
  }
  if (input.channels?.length) body.channels = input.channels;
  if (input.subaccountCode) {
    body.subaccount = input.subaccountCode;
    body.bearer = 'account';
    if (input.platformFeeMinor !== undefined) body.transaction_charge = input.platformFeeMinor;
  }

  return request<InitializeResult>('POST', '/transaction/initialize', body);
}

export interface PaystackPlan {
  plan_code: string;
  name: string;
  amount: number;
  interval: string;
  currency: string;
}

export interface CreatePlanInput {
  name: string;
  amountMinor: number;
  currency: string;
  /** Currently only monthly community memberships are sold. */
  interval?: 'monthly';
  description?: string;
}

/**
 * Creates a Paystack Plan. Plans are the unit of recurring billing: a transaction initialized with
 * the returned plan code subscribes the customer and Paystack charges the plan amount on schedule.
 */
export function createPlan(input: CreatePlanInput): Promise<PaystackPlan> {
  const config = paystackConfig();
  const currency = assertPaystackCurrency(input.currency, config);
  assertMinorUnits(input.amountMinor);
  if (input.amountMinor <= 0) throw new PaystackError('A plan amount must be greater than zero', 400);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new PaystackError('A plan name is required', 400);

  return request<PaystackPlan>('POST', '/plan', {
    name,
    amount: input.amountMinor,
    interval: input.interval ?? 'monthly',
    currency,
    ...(input.description ? { description: input.description.slice(0, 200) } : {}),
  });
}

export function fetchPlan(planCode: string): Promise<PaystackPlan> {
  if (!/^PLN_[A-Za-z0-9]+$/.test(planCode)) throw new PaystackError('Invalid Paystack plan code', 400);
  return request<PaystackPlan>('GET', `/plan/${encodeURIComponent(planCode)}`);
}

export interface PaystackSubscriptionState {
  status: string;
  subscription_code?: string | null;
  next_payment_date?: string | null;
  amount?: number | null;
  currency?: string | null;
}

/**
 * Reads one subscription so the nightly reconciliation can tell a missed webhook apart from a real
 * lapse. A successful renewal updates `next_payment_date`; access must never be cut off when it has
 * moved forward but the webhook was lost.
 */
export function fetchSubscription(code: string): Promise<PaystackSubscriptionState> {
  if (!/^SUB_[A-Za-z0-9]+$/.test(code)) throw new PaystackError('Invalid Paystack subscription code', 400);
  return request<PaystackSubscriptionState>('GET', `/subscription/${encodeURIComponent(code)}`);
}

/** Stops a subscription from charging again. Used when a member replaces or cancels their plan. */
export function disableSubscription(input: { code: string; token: string }): Promise<{ status: string }> {
  if (!/^SUB_[A-Za-z0-9]+$/.test(input.code)) throw new PaystackError('Invalid Paystack subscription code', 400);
  if (!input.token) throw new PaystackError('A subscription email token is required', 400);
  return request<{ status: string }>('POST', '/subscription/disable', {
    code: input.code,
    token: input.token,
  });
}

export interface VerifiedTransaction {
  id: number;
  status: string;
  reference: string;
  /** Amount actually charged. Includes Paystack's fee when the customer bears it. */
  amount: number;
  /**
   * Amount the merchant requested. Paystack returns the charge plus its fee in `amount` when the
   * merchant account passes fees to the customer, so this is the value to reconcile against an order.
   */
  requested_amount?: number | null;
  /** Paystack's transaction fee, when reported. */
  fees?: number | null;
  currency: string;
  customer?: { email?: string | null } | null;
  /** Paystack returns this as an object in practice; the docs describe it as a JSON string. */
  metadata?: Record<string, unknown> | string | null;
  gateway_response?: string | null;
  paid_at?: string | null;
  channel?: string | null;
}

/** The amount to compare with an order: what we requested, not the fee-inclusive charge. */
export function requestedAmount(tx: VerifiedTransaction): number {
  const requested = typeof tx.requested_amount === 'number' ? tx.requested_amount : NaN;
  return Number.isSafeInteger(requested) && requested > 0 ? requested : tx.amount;
}

/** Always verify with Paystack before fulfilling an order. Never trust a redirect or webhook body. */
export function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  assertReference(reference);
  return request<VerifiedTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface PaystackWebhookHeaders {
  /** Current header: `t=<unix>,v1=<whk_...>:<hex>[,v1=...]`. */
  paystackSignature?: string;
  /** Legacy header: HMAC-SHA512(raw body) with the secret key. */
  legacySignature?: string;
}

/**
 * Verifies the current `Paystack-Signature` header.
 *
 * HMAC-SHA512 is computed over `<timestamp>.<raw body>` with the `whsec_...` signing secret, and
 * timestamps older/newer than five minutes are rejected to stop replays.
 * Returns the matching key id, or null.
 */
export function verifyPaystackSignatureHeader(
  rawBody: Buffer,
  header: string | undefined,
  secrets: string[],
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || secrets.length === 0) return null;

  let timestamp: number | null = null;
  const signatures: Array<{ kid: string; hex: string }> = [];

  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') {
      if (timestamp !== null || !/^\d+$/.test(value)) return null;
      timestamp = Number(value);
    } else if (key === 'v1') {
      const separator = value.indexOf(':');
      if (separator !== -1) signatures.push({ kid: value.slice(0, separator), hex: value.slice(separator + 1) });
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return null;

  for (const secret of secrets) {
    const expected = crypto
      .createHmac('sha512', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest();
    for (const { kid, hex } of signatures) {
      if (!HEX_SHA512_RE.test(hex)) continue;
      if (crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'))) return kid;
    }
  }
  return null;
}

/** Legacy `x-paystack-signature` verification, used until every webhook carries the new header. */
export function verifyLegacySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secretKey: string,
): boolean {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !HEX_SHA512_RE.test(signature)) return false;
  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/**
 * Validates whichever signature header Paystack sent. Returns the matched key id (or `legacy`)
 * and null when the request is not authentic.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  headers: PaystackWebhookHeaders,
  env: NodeJS.ProcessEnv = process.env,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  const config = paystackConfig(env);

  // Prefer the current header whenever it is present. Do not fall back to the legacy header for
  // an invalid new signature: that would make downgrade attacks possible.
  if (headers.paystackSignature) {
    return verifyPaystackSignatureHeader(rawBody, headers.paystackSignature, config.webhookSecrets, nowSeconds);
  }
  if (headers.legacySignature) {
    return verifyLegacySignature(rawBody, headers.legacySignature, config.secretKey) ? 'legacy' : null;
  }
  return null;
}

/**
 * Backwards-compatible helper used by older call sites/tests. Supports the legacy header only;
 * new code should pass both headers to `verifyWebhookSignature`.
 */
export function isValidWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  try {
    const config = paystackConfig();
    return verifyLegacySignature(rawBody, signature, config.secretKey);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dormant bank/subaccount helpers for the future Paystack payout adapter
// ---------------------------------------------------------------------------

export interface PaystackBank {
  name: string;
  code: string;
}

export function listNigerianBanks(): Promise<PaystackBank[]> {
  return request('GET', '/bank?country=nigeria&perPage=100&use_cursor=false');
}

export function resolveBankAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ account_name: string; account_number: string }> {
  const qs = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
  return request('GET', `/bank/resolve?${qs.toString()}`);
}

export function createSubaccount(input: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge: number;
}): Promise<{ subaccount_code: string }> {
  return request('POST', '/subaccount', {
    business_name: input.businessName,
    settlement_bank: input.bankCode,
    account_number: input.accountNumber,
    percentage_charge: input.percentageCharge,
  });
}
