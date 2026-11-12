-- Paid community memberships.
--
-- Community joining fees can now be charged as real money through the shared payment engine. A
-- membership payment is a normal `orders` row with kind = 'community_membership', so commission,
-- the creator ledger, the 7-day hold and fulfilment stay in one place.
--
-- Recurring fees use Paystack Plans/Subscriptions. These two tables map a community's fee to a
-- Paystack plan and a member to their subscription, so renewal webhooks can credit the owner and
-- extend membership without trusting webhook amounts.
--
-- Rollback: drop community_subscriptions, community_subscription_plans and restore the previous
-- orders_kind_check constraint. Existing orders and ledger rows are not modified.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_kind_check
  CHECK (kind IN ('product', 'event_ticket', 'event_boost', 'product_boost', 'community_membership'));

CREATE TABLE IF NOT EXISTS community_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack')),
  provider_plan_code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL CHECK (currency IN ('NGN', 'USD')),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, provider, currency, amount_cents, interval)
);

COMMENT ON TABLE community_subscription_plans IS
  'Paystack plan cache keyed by the community fee it charges. A new plan is created whenever the owner changes the amount or currency.';

CREATE TABLE IF NOT EXISTS community_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack')),
  provider_plan_code TEXT,
  provider_subscription_id TEXT UNIQUE,
  provider_customer_code TEXT,
  provider_email_token TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('NGN', 'USD')),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'attention', 'non-renewing', 'cancelled', 'completed')),
  current_period_end TIMESTAMPTZ,
  last_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  last_invoice_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_community_subscriptions_member
  ON community_subscriptions (member_id, status);
CREATE INDEX IF NOT EXISTS idx_community_subscriptions_plan
  ON community_subscriptions (provider_plan_code);
CREATE INDEX IF NOT EXISTS idx_community_subscriptions_community
  ON community_subscriptions (community_id, status);

ALTER TABLE community_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_subscriptions ENABLE ROW LEVEL SECURITY;
-- No client policies: only the server (service role) reads or writes these tables. Members read
-- their membership state from the Firestore member document instead.

REVOKE ALL ON community_subscription_plans FROM anon, authenticated;
REVOKE ALL ON community_subscriptions FROM anon, authenticated;
