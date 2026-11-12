# Payments & Subscriptions Roadmap

Every feature in Kith that either already takes money, is partially modelled for money, or is a
natural place to introduce a subscription. The list is derived from the codebase, not from a generic
SaaS checklist.

**Status legend**

| Status | Meaning |
| --- | --- |
| **Live** | Real Paystack checkout, server-side pricing and fulfilment exist. Creator earnings accrue to the ledger; payouts are paused while Stripe is coming soon. |
| **Partial** | Types, UI copy or schema exist, but no working money path. |
| **Not built** | No schema or UI yet; listed because the surrounding feature is a natural paid surface. |

**Payment engine today** — `api/_lib/payments.ts` (canonical), `src/lib/payments.ts` (client).
Checkout kinds: `product`, `event_ticket`, `event_boost`, `product_boost`, `community_membership`.
Paystack is the active checkout provider for NGN and USD. Stripe remains wired for in-flight
payments but its checkout and payout UI show "Coming soon". Both providers share the same order,
commission, fulfilment and ledger code (see `docs/PAYSTACK.md`). Platform fee defaults to 10%
(`PLATFORM_FEE_BPS`), creator funds are held 7 days (`PAYOUT_HOLD_DAYS`), and payouts will go through
Stripe Connect + the creator ledger once re-enabled.

---

## 1. Live today — one-time payments

These already work end to end. Any new paid feature should reuse this pipeline rather than add a new
provider or a second checkout flow.

| Feature | Where | Notes |
| --- | --- | --- |
| Marketplace products | `src/lib/marketplace.ts`, `src/pages/ProductEditor.tsx`, `supabase/migrations/20261102000000_creator_marketplace.sql` | Course, e-book, template, design asset, app/tool, audio, video, other. Buyer gets a `purchases` entitlement. |
| Course lessons & previews | `product_lessons`, lesson progress/entitlements | One-time course purchase; preview lessons are public. |
| Paid event tickets | `src/pages/EventDetails.tsx`, `EventRegistration.paid` | Creates a registration after confirmation. |
| Event boosts | `src/components/events/BoostEventModal.tsx` | `feed_3d` $9, `spotlight_3d` $29, `spotlight_7d` $59. |
| Product boosts / promoted listings | `src/pages/Dashboard.tsx` | `promo_7d` $5, `promo_30d` $15. Promoted products rank higher (`src/features/feed/ranking/score.ts`). |
| Creator balances & withdrawals | `supabase/migrations/20261107000000_creator_balances.sql`, `/payouts` | Ledger, balance, 7-day hold. Withdrawals are paused while Stripe payouts are coming soon. |
| Purchase library | `/library`, `src/features/settings/sections/BillingSection.tsx` | Read-only view of orders and entitlements. |

**Not monetizable as-is:** `event_boost` and `product_boost` are platform revenue only — the seller
pays, and there is no creator split. That is intentional, but it means boost revenue never touches
the creator ledger.

---

## 2. Partial — modelled, not chargeable yet

These are the highest-leverage next features because the UI, types or rules already point at them.

### 2.1 Community paid membership

- **Status:** Live. `src/lib/communityPricing.ts` supports `{ amount, currency: 'xp' | 'usd', interval: 'once' | 'month' }`;
  `src/components/community/FeeEditor.tsx` lets owners charge XP, USD once, or USD monthly.
- **XP:** moves XP from member to owner in the same batch that creates the membership.
- **USD:** a `community_membership` order priced by the server. One-time payments use a normal
  Paystack transaction; monthly payments use a Paystack Plan/Subscription. Membership is granted only
  after verification, and renewals are re-verified before the owner is credited.
- **Approval:** paid communities approve the request first; the applicant pays from their own account
  afterwards. Leaving a monthly community disables the Paystack subscription first.
- **See:** `api/_lib/payments.ts`, `src/components/CommunityDetailsModal.tsx`,
  `supabase/migrations/20261110000001_community_memberships.sql`, `docs/PAYSTACK.md`.

### 2.2 Premium channels

- **Status:** Partial. `CommunityChannel.isPremium` exists and `src/components/community/ChannelSettings.tsx`
  derives it from role restrictions (`allowedRoles`, `premiumRoles`). Access is role-gated, not paid.
- **Monetization:** sell a "supporter" role that unlocks premium channels, or attach a paid tier to
  a set of channels. The entitlement check can reuse the community membership subscription.
- **Depends on:** community paid membership (§2.1) so a member can hold a paid tier.

### 2.3 Paid live streams / webinars

- **Status:** Partial. `LiveStream.type` includes `'paid'`, `LiveStreamRoom` labels it "Premium",
  and `firebase-blueprint.json` already declares an `enum` with `paid`. Only
  `broadcast | guest | webinar` are selectable in `src/components/LiveStreamView.tsx`.
- **Monetization:** ticket per session, or access included with a community/creator subscription.
  Also a natural home for replays (§2.7).
- **To build:** a `live_ticket` order kind, a gate before joining the LiveKit room, and a host
  revenue split. Paid streams inside a community should usually be covered by membership.

### 2.4 Creator subscriptions

- **Status:** Not built as paid. `PostCard` writes to `users/{author}/subscribers`, but that is a
  notification/interest list, not a billed relationship.
- **Monetization:** monthly support tiers that unlock subscriber-only posts, articles, live sessions
  and DMs. This is the biggest recurring-revenue surface on the platform and the one that most needs
  entitlements.
- **Depends on:** §5 subscription plumbing plus creator payout changes.

### 2.5 Paid articles

- **Status:** Not built. `src/types/articles.ts` has publish/feature metadata (`isFeatured`,
  `featuredCollectionId`) but no paywall, price or subscriber-only flag. `ArticleWrite.tsx` and
  `ArticleView.tsx` have no access checks.
- **Monetization:** per-article unlock, subscriber-only articles, or a metered free-preview.
  Cheapest useful version: a `visibility: 'subscribers'` flag checked against the creator
  subscription entitlement.

### 2.6 Paid challenges

- **Status:** Partial. `Challenge.entryFee` exists in `src/types/challenges.ts` but is referenced
  nowhere else. `rewardPool.cashAmount` is display-only sample data in `src/pages/Challenges.tsx`.
- **Monetization:** paid entry fees feeding the prize pool, sponsored challenges (brand pays,
  platform takes a fee), and paid judging/mentorship add-ons.
- **Needs:** a `challenge_entry` order kind, escrow/hold of prize money, and a payout/distribution
  flow that is more complex than the current seller ledger.

### 2.7 Event add-ons, replays and recordings

- **Status:** Not built. Paid tickets exist; recordings and add-ons do not.
- **Monetization:** recorded replay purchase, workshop add-on, priority Q&A, downloadable materials,
  and "ticket + replay bundle". Replays can reuse the product/entitlement model rather than a new
  order kind.

---

## 3. Platform subscriptions (Kith plans)

These are subscriptions to Kith itself, not to a creator. None exist yet; the current Billing
section explicitly describes one-time purchases only.

| Plan surface | What it would unlock | Status |
| --- | --- | --- |
| **Kith Pro** (individual) | Larger uploads/storage, advanced analytics, custom profile/branding, longer live sessions, no boost credits, priority support | Not built |
| **Kith Creator Pro** | Lower platform fee, more products/lessons, scheduled posts, email capture, bulk uploads, advanced sales analytics, custom domain | Not built |
| **Kith Business / Community Pro** | Larger communities, more roles, audit logs, SSO, higher live limits, branded onboarding | Not built |
| **Boost credits / packs** | Prepaid credits spendable on `event_boost` and `product_boost` | Not built |
| **Verification** | Paid identity/business verification (careful: safety and impersonation must stay free or manually reviewed) | Not built |

Revenue model options: flat monthly, annual discount, or a lower take rate instead of a fee. The
fee-based version is the only one that does not require a new billing relationship, so it is the
cheapest to test.

---

## 4. New paid surfaces inside existing features

These have no schema today but sit on top of features that already have the audience and the UI.

| Surface | Why it fits | Suggested model |
| --- | --- | --- |
| Tips / "super chat" on posts, articles and live | Gifting already exists in XP (`dailyGiftingRemaining`, `gift_xp`); real money is the obvious next step | One-time tip with platform fee |
| Paid DMs / priority messages | Messaging already has request/block logic in `src/features/messages/api.ts` | Creator subscription perk |
| Featured job posts | Jobs table exists (`supabase/migrations/20250625000000_initial_schema.sql`) | One-time featured listing |
| Custom badges, emojis, role colours | Community badges and roles already exist | One-time cosmetic purchase or Pro perk |
| Event sponsorship slots | Events already rank and promote | Sponsored placement |
| AI credits / usage | Product description generation exists in `ProductEditor` | Metered top-ups |
| Paid communities directory placement | Community discovery exists | Monthly featured slot |

**Keep free:** moderation, reporting, blocking, account deletion, accessibility settings and safety
tools. Charging for these creates the wrong incentives and invites platform-risk problems.

---

## 5. Platform plumbing required for subscriptions

The community slice of this is now live on Paystack: `community_subscription_plans` /
`community_subscriptions`, a `community_membership` order kind, Paystack Plan/Subscription
checkout, and idempotent `subscription.create` / `invoice.*` / `subscription.*` webhooks (see
`docs/PAYSTACK.md`). The items below are the generalisation still needed for creator and platform
subscriptions.

1. **Subscription tables**
   - `subscriptions` (buyer, seller, plan/price, status, provider IDs, period start/end, cancel-at,
     trial end).
   - `subscription_items` if a plan can bundle products, channels or communities.
   - `entitlements` extended to reference a subscription, not only a one-time purchase.
2. **Recurring checkout**
   - New order kind(s): `community_membership`, `creator_subscription`, `platform_subscription`.
   - Stripe Prices/Products per plan, or `price_data` for creator-defined tiers.
   - Idempotent fulfilment keyed by `(provider, subscription_id, invoice_id)`.
3. **Webhooks**
   - `customer.subscription.created|updated|deleted`
   - `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`
   - `charge.refunded` / `charge.dispute.created` revoking access
   - `account.updated` for Connect payout readiness
4. **Billing portal & self-serve**
   - Stripe Billing Portal session for cards, cancellation, invoices.
   - Cancel/resume, plan switch, proration preview, and a "cancel at period end" state.
5. **Invoices and receipts**
   - Store provider invoice IDs; show them in `BillingSection`; email receipts.
   - Tax handling (Stripe Tax) and refund policy surfaced at checkout.
6. **Dunning and lifecycle**
   - Grace period, retry schedule, downgrade to free, access revocation timing.
   - Email/in-app notices for failed payments and expiring cards.
7. **Proration and upgrades**
   - Upgrade/downgrade rules per surface; who eats the proration (platform or creator).
8. **Recurring creator payouts**
   - Current ledger assumes one-time `seller_cents` per order. Subscriptions need per-invoice
     splits, refund clawbacks, dispute reserves and a monthly payout run.
9. **Entitlement checks everywhere**
   - One shared helper (server + client) for "does this user have access to X", so premium
     channels, paid streams, paid articles and subscriber posts do not each invent their own check.
10. **Admin tooling**
    - Look up a subscription, force-cancel, comp access, refund, and audit who changed what.

---

## 6. Suggested sequencing

| Order | Feature | Why now | Size |
| --- | --- | --- | --- |
| 1 | Community paid membership (one-time USD) | Everything is already modelled; only a checkout kind and rules change are missing | Small |
| 2 | Subscription plumbing + community monthly tiers | Recurring revenue with the smallest blast radius; unlocks the rest | Large |
| 3 | Creator subscriptions | Biggest recurring surface; reuses community subscription machinery | Medium |
| 4 | Paid live streams + replays | Existing `paid` type and LiveKit gating point straight at it | Medium |
| 5 | Paid articles / subscriber-only posts | Cheap once entitlements exist | Small |
| 6 | Kith Pro / Creator Pro | Needs usage limits and analytics to be worth paying for | Medium |
| 7 | Tips and super chat | High engagement, low complexity, but needs moderation and chargeback handling | Medium |
| 8 | Paid challenges | Highest complexity (escrow, prize distribution, fraud) | Large |

---

## 7. Decisions to settle before building

- **One subscription or many?** A single `subscriptions` table with a polymorphic `target_type`
  keeps the code small; per-surface tables keep constraints honest. Recommendation: one table plus a
  small `subscription_plans` table.
- **Who owns the Stripe customer?** Platform-level customer with connected-account transfers is
  simpler than a customer per creator, and it keeps the billing portal in one place.
- **Fee on subscriptions:** reuse `PLATFORM_FEE_BPS` or give Pro creators a lower rate. Do not
  hard-code per-surface percentages.
- **Refund and cancellation policy:** access should end at period end, not at click time; state this
  in the UI before charging.
- **Currency:** Paystack currently handles both NGN and USD checkout
  (`PAYSTACK_CURRENCIES`, default `NGN,USD`). Do not add another currency until the database and the
  provider adapters explicitly support it, and never convert an existing price.
