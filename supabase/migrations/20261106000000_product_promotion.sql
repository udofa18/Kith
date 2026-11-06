-- Promoted products: a creator can pay to feature a product in the marketplace sidebar for a set time.
-- Promotions are sold as orders (kind = 'product_boost') and granted by the server after payment.

ALTER TABLE products ADD COLUMN IF NOT EXISTS promoted_until TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS promoted_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_promoted ON products (promoted_until DESC) WHERE status = 'published';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_kind_check
  CHECK (kind IN ('product', 'event_ticket', 'event_boost', 'product_boost'));

-- Public seller ranking. Only published products count. Exposes no private data.
CREATE OR REPLACE VIEW creator_leaderboard AS
SELECT
  p.creator_uid,
  MAX(p.creator_name) AS creator_name,
  COUNT(p.id)::int AS product_count,
  COALESCE(SUM(p.sales_count), 0)::int AS total_sales,
  SUM(p.rating_count)::int AS review_count,
  CASE WHEN SUM(p.rating_count) > 0
    THEN ROUND(SUM(p.rating_avg * p.rating_count) / SUM(p.rating_count), 2)
  END AS rating
FROM products p
WHERE p.status = 'published'
GROUP BY p.creator_uid;

GRANT SELECT ON creator_leaderboard TO anon, authenticated;
