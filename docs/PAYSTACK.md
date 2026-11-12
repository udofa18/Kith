# Paystack payments

Kith uses one payment engine (`api/_lib/payments.ts`) for Stripe and Paystack. Paystack is an
additional collection provider, not a second order, pricing, fulfilment or ledger system.

Supported order kinds: `product`, `event_ticket`, `event_boost`, `product_boost`,
`community_membership`.

## Current mode: Paystack now, Stripe coming soon

`api/_lib/paymentProviders.ts` marks Stripe as **coming soon**. While that is true:

- Buyer checkout offers Paystack for both NGN and USD; Stripe is shown as disabled/coming soon.
- An explicit `provider: "stripe"` request returns a clear 400 instead of silently switching.
- `PAYMENT_PROVIDER` is also redirected to Paystack if it is still set to `stripe`.
- Payout onboarding and withdrawals are paused. Sellers do **not** need a payout account to sell;
  their share is still credited to the existing creator ledger and shown in the Kith balance.
- The Stripe backend, adapters and webhooks remain in place so in-flight Stripe payments still
  fulfil and Stripe can be re-enabled by removing it from `COMING_SOON_PROVIDERS`.

## What Paystack does (and does not do)

- **Collects** buyer payments into the platform's Paystack account using hosted redirect checkout.
- **Verifies** every transaction server-side before an order is fulfilled.
- **Feeds** the existing order, commission and creator-ledger code.
- **Does not** create Paystack subaccounts or transfers. Withdrawals are paused while Stripe payouts
  are coming soon; earnings accumulate on the platform ledger until a payout adapter is enabled.
- Boost and promotion prices (`event_boost`, `product_boost`) are defined in USD on the server.
  They therefore require Stripe or a Paystack merchant account approved for USD; Kith never converts
  them to naira with a hard-coded rate.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | no | Deployment default: `paystack` (default while Stripe is coming soon) or `stripe`. Unknown values return 503. A `stripe` value is redirected to Paystack until Stripe is re-enabled. |
| `PAYSTACK_SECRET_KEY` | yes | `sk_test_...` or `sk_live_...`. Paystack is enabled only when this is set. |
| `PAYSTACK_PUBLIC_KEY` | no | `pk_test_...` / `pk_live_...`. Reserved for future inline checkout; not used by redirect checkout. |
| `PAYSTACK_MODE` | no | `test` or `live`. If set, it must match the secret key prefix. |
| `PAYSTACK_CURRENCIES` | no | Comma-separated currencies this merchant account may charge. Default `NGN,USD` because this account is approved for both. The database supports `NGN` and `USD`; only list what Paystack has approved. |
| `PAYSTACK_WEBHOOK_SECRET` | for current signatures | `whsec_...` signing secret(s), comma-separated during rotation. Required to verify the `Paystack-Signature` header. |
| `PAYSTACK_CALLBACK_URL` | no | Public origin used in Paystack redirect URLs when it differs from `APP_URL`. Must be an absolute http(s) URL. |
| `APP_URL` | recommended | Origin used for Stripe and fallback Paystack redirects. |

Provider selection:

1. A checkout request may include `provider` (`stripe` or `paystack`). The server validates that the
   provider is configured and can charge the order currency.
2. Without an override, `PAYMENT_PROVIDER` is used (currently Paystack; a stale `stripe` value is
   redirected to Paystack while Stripe is coming soon).
3. If the selected provider cannot charge the order currency, checkout fails with a clear error. There
   is no silent USD↔NGN conversion and no cross-provider fallback.

## Money rules

- All amounts crossing the payment boundary are integer minor units: cents for USD, kobo for NGN.
- Product prices are stored in `products.price_cents` (minor units).
- Event prices are stored in major units in Firestore and converted with `toMinorUnits` before
  creating the order; the Firestore value itself is never rewritten.
- Commission uses integer basis points (`PLATFORM_FEE_BPS`, default `1000` = 10%).
- Historical prices, currencies and ledger entries are never recalculated.

## Checkout flow

1. The browser calls `POST /api/payments/checkout-options` with `{ kind, targetId, tierId? }`.
   The server prices the target from Postgres/Firestore and returns:
   `{ currency, amountMinor, free, providers, comingSoonProviders, sellerReady, ... }`.
   Only active providers appear in `providers`; Stripe appears in `comingSoonProviders`.
2. The browser calls `POST /api/payments/checkout` with the chosen `provider`. The amount and currency
   in the request are ignored; the server reprices.
3. For Paystack the server inserts a normal `orders` row with `provider = 'paystack'`, then calls
   `POST https://api.paystack.co/transaction/initialize` with:
   - `reference` = the internal order id
   - `amount` = integer minor units
   - `currency` = the order currency
   - `callback_url` = the app return URL
   - stringified `metadata` containing `orderId`, `kind`, `targetId`, `buyerId`, `provider`
4. The buyer completes payment on Paystack and returns to the app with `?order=<id>&provider=paystack`.
   The app polls `GET /api/payments/order?id=<id>`.
5. The status poll verifies the transaction with Paystack (`GET /transaction/verify/<orderId>`) and
   calls the same `fulfilOrder` function used by webhooks.
6. `fulfilOrder` checks provider, reference, order metadata, buyer, amount and currency against the
   database row before atomically claiming the order (`status: pending → paid`). Only then does
   `grantOrder` create the entitlement/registration/boost and credit the creator ledger.

A redirect alone never grants access. A webhook body alone never grants access either: the handler
always re-verifies with Paystack.

## Community memberships

Communities can charge a real joining fee instead of XP. The fee lives on the community as
`fee: { amount, currency: 'xp' | 'usd', interval: 'once' | 'month' }`; legacy `isPaid`/`price`
communities are treated as one-time XP fees.

- **XP fees** stay on the legacy client-side XP transfer path. They never touch Paystack.
- **USD fees** are `community_membership` orders priced by the server. The browser never sends the
  amount. `priceCommunityMembership` rejects XP fees, the owner, banned members, and members whose
  paid access is still active; a lapsed monthly member can check out again.
- **One-time USD fees** use a normal Paystack transaction. The membership is granted only after
  `charge.success` (or the status poll) verifies the payment.
- **Monthly fees** create/reuse a Paystack Plan (`POST /plan`) keyed by community, currency and
  amount, then initialize the transaction with `plan`. A pending `community_subscriptions` row is
  written before the redirect so `subscription.create` can be matched by plan code and customer
  email.

Approval-gated paid communities approve the request first; approving does **not** create the
membership, move XP or charge the applicant. The applicant opens the community again and pays.
Free and XP communities keep the old behaviour (membership and XP transfer happen on approval).
Directly joined paid communities pay before membership. The server enforces this too: pricing a card
membership for a private/approval-gated community requires the caller's join request to be
`approved`, so checkout cannot be used to skip review.

Membership grants are idempotent per order id and stored on the Firestore member document
(`paymentInterval`, `feeCurrency`, `feeAmount`, `membershipExpiresAt`, `subscriptionStatus`,
`providerSubscriptionId`, `lastOrderId`). Monthly renewals extend from the later of now and the
current expiry, so a delayed webhook never shortens access.

### Subscription lifecycle

Paystack sends subscription events to the same webhook. Each is persisted in `payment_events` and
handled idempotently:

| Event | Effect |
| --- | --- |
| `subscription.create` | Links the Paystack subscription code/token to the pending row and marks the member active. |
| `invoice.update` (paid, success) | Re-verifies the renewal transaction with Paystack, creates a new paid `community_membership` order, credits the creator ledger and extends membership. The initial payment is recognised by its internal order reference and never credited twice. |
| `invoice.payment_failed` | Marks the subscription `attention`. Paid access ends if a successful order already exists; a later successful charge (including a provider retry) re-grants it. |
| `subscription.not_renew` | Records `non-renewing`; access continues until the paid period ends. |
| `subscription.disable` | Marks the subscription cancelled/completed and removes the member unless a newer subscription has replaced it. |

Renewal amounts are checked against the subscription row after verification; a mismatched amount or
customer email fails the event and leaves the order unpaid. Starting a new subscription disables the
old Paystack subscription best-effort, so a member is not billed twice. Membership writes always
come from the server and bypass Firestore client rules.

Leaving a community with an active monthly membership calls `POST /api/payments/cancel-membership`
before the member document is removed. The server disables the Paystack subscription, marks the row
`cancelled` and removes the member document. If the subscription cannot be stopped, the leave is
refused so nobody is left paying for access they no longer have. The endpoint also removes the
member document when called directly, so it cannot be used to keep paid access while stopping
billing.

## Payouts (paused)

Stripe Connect is still the only payout adapter, and its setup/withdrawal UI is marked coming soon.
While payouts are paused:

- `startConnectOnboarding` and `requestWithdrawal` return 503 with a clear explanation.
- `getCreatorBalance` returns balances with `withdrawable: false` and `withdrawableCurrencies: []`.
- Sellers can still publish and sell paid products. The seller share is credited to `creator_ledger`
  with the normal 7-day hold, so it is ready when withdrawals open.
- Existing Stripe-connected sellers cannot withdraw until payouts are re-enabled.

To re-enable Stripe checkout and payouts, remove `'stripe'` from `COMING_SOON_PROVIDERS` in
`api/_lib/paymentProviders.ts` and set `PAYOUTS_COMING_SOON = false` in `api/_lib/payments.ts`.

## Webhooks

Configure the Paystack dashboard webhook URL as:

```
https://<your-domain>/api/payments/paystack-webhook
```

Both signature schemes are supported:

- **Current:** `Paystack-Signature: t=<unix>,v1=<whk_...>:<hex>[,v1=...]`.
  HMAC-SHA512 is computed over `<unix>.<raw body>` with each `whsec_...` secret. Timestamps outside
  ±300 seconds are rejected.
- **Legacy:** `x-paystack-signature`, HMAC-SHA512 over the raw body with `PAYSTACK_SECRET_KEY`.

If the current header is present, only that header is trusted. The server does not fall back to the
legacy header for the same request, which prevents downgrade attacks.

Signature verification uses the **raw request body**. Vercel (`bodyParser: false`) and the local
Express server (`express.raw`) both preserve it. Never re-stringify parsed JSON before verifying.

Handler behaviour:

- Every event is stored in `payment_events` keyed by `paystack:<event>:<event identifier>`. The
  identifier prefers the transaction/invoice/subscription/plan id, then the reference, and finally a
  hash of the raw body, so retries dedupe instead of overwriting unrelated events.
- `charge.success` fulfils orders. Subscription events drive community memberships (see the table
  above). Other events (`refund.*`, `transfer.*`, etc.) are stored for audit but do not change order
  state yet.
- Fulfilment is idempotent. Repeated, delayed and out-of-order events are safe:
  - a paid order is never granted twice (unique indexes and existence checks)
  - a later failure event cannot downgrade a paid order
  - webhooks and the status poll can run concurrently
- Processing errors mark `payment_events.processing_error` and return HTTP 500 so Paystack retries.
  Successful / duplicate deliveries return 200 promptly.

## Database

Apply `supabase/migrations/20261110000000_paystack_provider.sql`. It adds the webhook audit columns
(`payload`, `provider_reference`, `order_id`, `processed_at`, `processing_error`) and indexes used by
reconciliation. It does not modify existing orders, products, prices or ledger rows.

Community memberships also require
`supabase/migrations/20261110000001_community_memberships.sql`. It widens the `orders.kind` check to
include `community_membership` and creates:

- `community_subscription_plans` — one Paystack plan per community/currency/amount
- `community_subscriptions` — one row per `(community_id, member_id)`, holding the Paystack plan and
  subscription codes, status, amount/currency and the last invoice/order

The second migration is required before enabling a monthly fee. Without it, monthly checkout fails
when it tries to save the plan; one-time and XP fees are unaffected.

Deploy order: apply both migrations before or together with the code. If the code goes out first, the
webhook audit write falls back to the original `id/provider/type` row instead of failing, so Stripe
fulfilment and the order-status poll keep working until the columns exist.

Useful operator queries:

```sql
-- Events stored but not successfully processed
SELECT id, provider, type, received_at, processing_error
FROM payment_events
WHERE processed_at IS NULL
ORDER BY received_at DESC;

-- Orders for one Paystack transaction
SELECT id, status, currency, total_cents, paid_at, metadata
FROM orders
WHERE provider = 'paystack' AND metadata->>'providerReference' = '<reference>';
```

## Testing

`npm test` runs Vitest. Tests use mocked Paystack/Stripe clients and cover:

- currency parsing and integer minor-unit conversion
- fees and the 7-day ledger hold
- provider resolution and currency capability checks
- current and legacy webhook signatures, tolerance and tampering
- fulfilment validation (status, reference, buyer, amount, currency)
- idempotent fulfilment and duplicate webhook handling
- community fee parsing (XP/USD/month/legacy) and pricing rejection rules
- one-time and monthly community checkout, Paystack plans and pending subscriptions

Run `npm run lint` (TypeScript) after changes.

## Not implemented yet

- Paystack refunds and disputes (events are recorded for future work).
- Paystack transfers/payouts and subaccounts. Withdrawals remain Stripe Connect only.
- Paystack inline JS. Checkout uses the hosted redirect flow.
- Refund/credit handling when a community subscription is cancelled mid-period. Cancelling (on leave)
  stops future charges; admins removing a member should ask them to leave first so billing stops.
