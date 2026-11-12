/**
 * Stripe client helpers: Connect Express accounts for sellers, hosted Checkout for buyers,
 * and webhook verification. The Paystack path in paystack.ts stays available for later.
 *
 * Money flow for seller sales (platform-held balance): the buyer pays the platform's Stripe account
 * and the money stays there. The platform credits the seller's in-app balance, and transfers funds to
 * the seller's connected account only when the seller withdraws. Boosts have no seller, so the
 * platform keeps the full amount.
 */
import Stripe from 'stripe';
import { ProviderConfigError } from './paymentErrors.js';

// Kept as a re-export so existing imports from this module keep working.
export { ProviderConfigError } from './paymentErrors.js';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new ProviderConfigError('Stripe is not configured: STRIPE_SECRET_KEY is missing on the server.');
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export async function createExpressAccount(input: { country: string; email?: string; userId: string; businessName?: string }) {
  // Accounts v2: Stripe rejects new v1 Connect accounts. The seller is a *recipient* (the platform
  // collects the money and transfers their share later), but payouts to their bank come from the
  // merchant configuration's stripe_balance.payouts capability, so both are requested.
  return stripe().v2.core.accounts.create({
    contact_email: input.email,
    identity: { country: input.country },
    dashboard: 'express',
    display_name: input.businessName,
    defaults: {
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
    },
    configuration: {
      merchant: { capabilities: { card_payments: { requested: true } } },
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    metadata: { userId: input.userId },
  });
}

/** The parts of a Connect account the app cares about, normalized across v1/v2 shapes. */
export interface ConnectAccountState {
  id: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsStatus: 'currently_due' | 'eventually_due' | 'past_due' | null;
}

export function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  return stripe().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['merchant', 'recipient'],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
}

export async function retrieveAccountState(accountId: string): Promise<ConnectAccountState> {
  const account = await stripe().v2.core.accounts.retrieve(accountId, {
    include: ['configuration.merchant', 'configuration.recipient', 'requirements'],
  });
  const merchant = account.configuration?.merchant?.capabilities;
  const recipient = account.configuration?.recipient?.capabilities;
  const requirementsStatus = account.requirements?.summary?.minimum_deadline?.status ?? null;

  return {
    id: account.id,
    chargesEnabled: merchant?.card_payments?.status === 'active',
    payoutsEnabled: merchant?.stripe_balance?.payouts?.status === 'active',
    transfersEnabled: recipient?.stripe_balance?.stripe_transfers?.status === 'active',
    // `past_due` means onboarding hasn't been completed yet.
    detailsSubmitted: requirementsStatus !== 'past_due',
    requirementsStatus,
  };
}

export interface CheckoutInput {
  orderId: string;
  kind: string;
  targetId: string;
  title: string;
  amountMinor: number;
  currency: string;
  buyerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export function createCheckoutSession(input: CheckoutInput) {
  return stripe().checkout.sessions.create({
    mode: 'payment',
    client_reference_id: input.orderId,
    customer_email: input.buyerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountMinor,
          product_data: { name: input.title },
        },
      },
    ],
    // No transfer_data: funds stay on the platform until the creator withdraws.
    payment_intent_data: { metadata: { orderId: input.orderId, kind: input.kind, targetId: input.targetId } },
    metadata: { orderId: input.orderId, kind: input.kind, targetId: input.targetId },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
}

export function retrieveCheckoutSession(sessionId: string) {
  return stripe().checkout.sessions.retrieve(sessionId);
}

/** Moves withdrawn funds from the platform balance to the seller's connected account. */
export function createTransfer(input: {
  accountId: string;
  amountMinor: number;
  currency: string;
  payoutId: string;
  creatorId: string;
}) {
  return stripe().transfers.create(
    {
      amount: input.amountMinor,
      currency: input.currency.toLowerCase(),
      destination: input.accountId,
      metadata: { payoutId: input.payoutId, creatorId: input.creatorId },
    },
    { idempotencyKey: `payout-${input.payoutId}` },
  );
}

/** Verifies the Stripe-Signature header against the raw request body. Throws if it's invalid. */
export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ProviderConfigError('Stripe webhooks are not configured: STRIPE_WEBHOOK_SECRET is missing.');
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
