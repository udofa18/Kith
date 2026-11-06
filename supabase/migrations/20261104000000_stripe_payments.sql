-- Stripe becomes the default payment provider. Event boosts become an order kind.
-- Paystack rows stay valid; the provider column records which provider handled each order.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_kind_check
  CHECK (kind IN ('product', 'event_ticket', 'event_boost'));

ALTER TABLE orders ALTER COLUMN provider SET DEFAULT 'stripe';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_provider_check
  CHECK (provider IN ('stripe', 'paystack'));
