-- Unified payments: every paid action in the app creates an order with a kind.
--   product       → buyer gets a purchase (entitlement) for a marketplace product
--   event_ticket  → buyer gets a registration for a paid event (stored in Firestore)
--
-- Money split: seller_id receives seller_cents, the platform keeps fee_cents.
-- Orders are written by server code only (service role). Clients read their own orders.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'product'
  CHECK (kind IN ('product', 'event_ticket'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fee_cents INT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_cents INT NOT NULL DEFAULT 0 CHECK (seller_cents >= 0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_kind_target ON orders (kind, target_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders (seller_id, created_at DESC);
