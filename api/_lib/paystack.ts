/**
 * Minimal Paystack REST client. Uses the test secret key (sk_test_...) until the
 * business account is live. No SDK dependency; Node 18+ fetch.
 */
import crypto from 'crypto';

const BASE_URL = 'https://api.paystack.co';

export class PaystackError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackError('Payments are not configured on this server', 500);
  return key;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new PaystackError(json.message || `Paystack request failed (${res.status})`, res.status);
  }
  return json.data as T;
}

export interface PaystackBank {
  name: string;
  code: string;
}

export function listNigerianBanks(): Promise<PaystackBank[]> {
  return request('GET', '/bank?country=nigeria&perPage=100&use_cursor=false');
}

export function resolveBankAccount(accountNumber: string, bankCode: string): Promise<{ account_name: string; account_number: string }> {
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

export interface InitializeInput {
  email: string;
  amountMinor: number;
  currency: 'NGN' | 'USD';
  reference: string;
  callbackUrl: string;
  subaccountCode: string;
  /** Flat platform fee in minor units, kept by the main account. Overrides the subaccount percentage. */
  platformFeeMinor: number;
  metadata: Record<string, unknown>;
}

export function initializeTransaction(input: InitializeInput): Promise<{ authorization_url: string; reference: string }> {
  return request('POST', '/transaction/initialize', {
    email: input.email,
    amount: input.amountMinor,
    currency: input.currency,
    reference: input.reference,
    callback_url: input.callbackUrl,
    subaccount: input.subaccountCode,
    transaction_charge: input.platformFeeMinor,
    bearer: 'account',
    metadata: input.metadata,
  });
}

export interface VerifiedTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
}

/** Always verify with Paystack before fulfilling an order. Never trust a redirect or webhook body alone. */
export function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  return request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Paystack signs webhook bodies with HMAC-SHA512 of the raw request body using the secret key. */
export function isValidWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
