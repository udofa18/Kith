-- Paystack as a first-class payment provider.
--
-- Paystack transactions and Stripe Checkout sessions both create normal `orders` rows. Fulfilment,
-- commission, the creator ledger and the 7-day hold stay in the existing engine. This migration only
-- extends the webhook audit log so both providers can be reconciled and replayed safely.
--
-- Rollback: the columns/indexes below are additive and safe to leave in place. If you must remove
-- them, drop the indexes and columns on payment_events. Existing orders and ledger rows are not
-- modified.

ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS payload JSONB;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- Every event id is unique per provider (`${provider}:${type}:${event id}`), so a redelivery upserts
-- in place instead of creating a second audit row.
CREATE INDEX IF NOT EXISTS idx_payment_events_provider_received
  ON payment_events (provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_order
  ON payment_events (order_id);
-- Operator query for events that were stored but whose handler failed.
CREATE INDEX IF NOT EXISTS idx_payment_events_unprocessed
  ON payment_events (received_at)
  WHERE processed_at IS NULL;

-- Reconciliation helpers used by operators when investigating a checkout.
CREATE INDEX IF NOT EXISTS idx_orders_provider_paid
  ON orders (provider, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_provider_reference
  ON orders (provider, ((metadata ->> 'providerReference')));

COMMENT ON COLUMN payment_events.provider_reference IS
  'Paystack transaction reference or Stripe Checkout Session id. Not the internal order id.';
COMMENT ON COLUMN payment_events.order_id IS
  'Internal order id when the event can be tied to one. NULL for unrelated provider events.';
COMMENT ON COLUMN payment_events.processed_at IS
  'Set after the handler completes. A stored event with processed_at IS NULL may need a retry.';
