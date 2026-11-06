-- Platform-held creator balances.
--
-- Card sales are charged on the platform's Stripe account and stay there. Each sale credits the
-- creator's ledger, and the creator withdraws from the platform when they choose. Stripe transfers
-- the withdrawn amount to their connected account, which pays out to their bank on its schedule.
--
-- Only orders created after this migration are credited (orders.funds_held = true). Older orders used
-- destination charges, so their money already went to the seller and must not be credited again.
--
-- Ledger entries:
--   sale             +creator_amount_cents, becomes spendable at available_at
--   payout           -amount, written when a withdrawal is requested (reserves the funds)
--   payout_reversal  +amount, written when a withdrawal fails so the balance is restored
--   refund           -amount, reserved for refund handling
--   adjustment       +/-amount, manual corrections

ALTER TABLE orders ADD COLUMN IF NOT EXISTS funds_held BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE creator_accounts ADD COLUMN IF NOT EXISTS transfers_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Paid products need an account that can actually receive money. For platform-held funds that means
-- payouts are enabled, not charges on the seller's own account.
CREATE OR REPLACE FUNCTION public.enforce_product_publish_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.price_cents > 0 AND NOT EXISTS (
      SELECT 1 FROM creator_accounts ca
      WHERE ca.user_id = NEW.creator_uid AND ca.payouts_enabled
    ) THEN
      RAISE EXCEPTION 'Set up a payout account before publishing a paid product'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.published_at IS NULL THEN
      NEW.published_at := NOW();
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS creator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency IN ('NGN', 'USD')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_transfer_id TEXT UNIQUE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_payouts_creator
  ON creator_payouts (creator_id, created_at DESC);

ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_payouts_select ON creator_payouts;
CREATE POLICY creator_payouts_select ON creator_payouts FOR SELECT
  USING (creator_id = public.current_uid()::text OR is_admin());

REVOKE INSERT, UPDATE, DELETE ON creator_payouts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS creator_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('NGN', 'USD')),
  amount_cents INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'payout', 'payout_reversal', 'refund', 'adjustment')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payout_id UUID REFERENCES creator_payouts(id) ON DELETE SET NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_ledger_creator
  ON creator_ledger (creator_id, created_at DESC);
-- One sale credit per order, so a retried webhook can never double-credit.
CREATE UNIQUE INDEX IF NOT EXISTS creator_ledger_one_sale_per_order
  ON creator_ledger (order_id) WHERE kind = 'sale';
-- One reversal per payout, so retries can't restore the balance twice.
CREATE UNIQUE INDEX IF NOT EXISTS creator_ledger_one_reversal_per_payout
  ON creator_ledger (payout_id) WHERE kind = 'payout_reversal';

ALTER TABLE creator_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_ledger_select ON creator_ledger;
CREATE POLICY creator_ledger_select ON creator_ledger FOR SELECT
  USING (creator_id = public.current_uid()::text OR is_admin());

REVOKE INSERT, UPDATE, DELETE ON creator_ledger FROM anon, authenticated;

-- Available balance = spendable sale credits, minus payouts, reversals, refunds and adjustments.
-- Pending balance = sale credits that are still inside the refund hold window.
CREATE OR REPLACE FUNCTION public.creator_balance_for(p_creator TEXT)
RETURNS TABLE (currency TEXT, available_cents BIGINT, pending_cents BIGINT, lifetime_cents BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.currency,
    COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind <> 'sale' OR l.available_at <= NOW()), 0)::bigint,
    COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind = 'sale' AND l.available_at > NOW()), 0)::bigint,
    COALESCE(SUM(l.amount_cents) FILTER (WHERE l.kind = 'sale'), 0)::bigint
  FROM creator_ledger l
  WHERE l.creator_id = p_creator
  GROUP BY l.currency;
$$;

-- Reserves funds and creates the payout row in one transaction. The advisory lock serialises two
-- withdrawal requests from the same creator, so the balance can't be spent twice.
CREATE OR REPLACE FUNCTION public.request_creator_payout(
  p_creator TEXT,
  p_amount_cents INT,
  p_currency TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available BIGINT;
  v_payout_id UUID;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = 'check_violation';
  END IF;
  IF p_currency NOT IN ('NGN', 'USD') THEN
    RAISE EXCEPTION 'Unsupported currency' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_creator));

  SELECT COALESCE(SUM(amount_cents) FILTER (WHERE kind <> 'sale' OR available_at <= NOW()), 0)
    INTO v_available
    FROM creator_ledger
   WHERE creator_id = p_creator AND currency = p_currency;

  IF v_available < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO creator_payouts (creator_id, amount_cents, currency, status)
  VALUES (p_creator, p_amount_cents, p_currency, 'pending')
  RETURNING id INTO v_payout_id;

  INSERT INTO creator_ledger (creator_id, currency, amount_cents, kind, payout_id)
  VALUES (p_creator, p_currency, -p_amount_cents, 'payout', v_payout_id);

  RETURN v_payout_id;
END;
$$;

-- Finalises a reserved payout. Marking it failed restores the reserved amount. Safe to call twice.
CREATE OR REPLACE FUNCTION public.settle_creator_payout(
  p_payout_id UUID,
  p_status TEXT,
  p_transfer_id TEXT DEFAULT NULL,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout creator_payouts%ROWTYPE;
BEGIN
  IF p_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'Invalid payout status' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_payout FROM creator_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found';
  END IF;
  IF v_payout.status = 'failed' THEN
    RETURN; -- already reversed
  END IF;

  IF p_status = 'paid' THEN
    IF v_payout.status = 'paid' THEN
      RETURN;
    END IF;
    UPDATE creator_payouts
       SET status = 'paid', provider_transfer_id = p_transfer_id, paid_at = NOW()
     WHERE id = p_payout_id;
  ELSE
    -- A transfer can fail after it was created, so a paid payout may still be reversed here.
    UPDATE creator_payouts
       SET status = 'failed', failure_reason = p_failure_reason
     WHERE id = p_payout_id;
    INSERT INTO creator_ledger (creator_id, currency, amount_cents, kind, payout_id)
    VALUES (v_payout.creator_id, v_payout.currency, v_payout.amount_cents, 'payout_reversal', p_payout_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Server-only. Clients read balances through the API.
REVOKE ALL ON FUNCTION public.creator_balance_for(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_creator_payout(TEXT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_creator_payout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_balance_for(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_creator_payout(TEXT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_creator_payout(UUID, TEXT, TEXT, TEXT) TO service_role;
