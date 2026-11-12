import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyLegacySignature,
  verifyPaystackSignatureHeader,
  verifyWebhookSignature,
} from '../api/_lib/paystack.js';
import { paystackConfig } from '../api/_lib/paystack.js';
import { ProviderConfigError } from '../api/_lib/paymentErrors.js';

const WH_SECRET = 'whsec_test_secret';
const SECRET_KEY = 'sk_test_1234567890';
const NOW = 1_800_000_000;

function currentHeader(rawBody: Buffer, secret = WH_SECRET, timestamp = NOW): string {
  const hex = crypto
    .createHmac('sha512', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest('hex');
  return `t=${timestamp},v1=whk_test_key:${hex}`;
}

function legacySignature(rawBody: Buffer, secret = SECRET_KEY): string {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

describe('Paystack webhook signatures', () => {
  it('accepts the current t=... v1=key:hex header', () => {
    const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    expect(verifyPaystackSignatureHeader(body, currentHeader(body), [WH_SECRET], NOW)).toBe('whk_test_key');
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const tampered = Buffer.from('{"event":"charge.failed"}');
    expect(verifyPaystackSignatureHeader(tampered, currentHeader(body), [WH_SECRET], NOW)).toBeNull();
  });

  it('rejects stale timestamps to stop replay', () => {
    const body = Buffer.from('{}');
    expect(verifyPaystackSignatureHeader(body, currentHeader(body), [WH_SECRET], NOW + 301)).toBeNull();
  });

  it('accepts either active secret during rotation', () => {
    const body = Buffer.from('{}');
    expect(verifyPaystackSignatureHeader(body, currentHeader(body, 'whsec_new'), ['whsec_old', 'whsec_new'], NOW)).toBe(
      'whk_test_key',
    );
  });

  it('verifies the legacy x-paystack-signature header with the secret key', () => {
    const body = Buffer.from('{}');
    expect(verifyLegacySignature(body, legacySignature(body), SECRET_KEY)).toBe(true);
    expect(verifyLegacySignature(body, legacySignature(body, 'sk_test_other'), SECRET_KEY)).toBe(false);
  });

  it('prefers the current header and does not downgrade to legacy', () => {
    const env = { ...process.env, PAYSTACK_SECRET_KEY: SECRET_KEY, PAYSTACK_WEBHOOK_SECRET: WH_SECRET };
    const body = Buffer.from('{}');
    const result = verifyWebhookSignature(
      body,
      { paystackSignature: 't=1,v1=bad:deadbeef', legacySignature: legacySignature(body) },
      env,
      NOW,
    );
    expect(result).toBeNull();
  });

  it('fails configuration instead of guessing', () => {
    expect(() => paystackConfig({} as NodeJS.ProcessEnv)).toThrow(ProviderConfigError);
    expect(() =>
      paystackConfig({ PAYSTACK_SECRET_KEY: 'sk_test_1', PAYSTACK_MODE: 'live' } as NodeJS.ProcessEnv),
    ).toThrow(/PAYSTACK_MODE/);
    expect(() =>
      paystackConfig({ PAYSTACK_SECRET_KEY: 'sk_test_1', PAYSTACK_CURRENCIES: 'EUR' } as NodeJS.ProcessEnv),
    ).toThrow(/PAYSTACK_CURRENCIES/);
  });
});
