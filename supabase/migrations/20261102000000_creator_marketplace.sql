-- Creator marketplace: products, files, lessons, orders, entitlements, reviews, creator payout accounts.
--
-- Conventions:
-- * Money is stored as integer minor units (kobo for NGN, cents for USD).
-- * Payments are written server-side only (payment webhook / API routes using the service role).
--   Clients never insert into orders, order_items, purchases, creator_accounts, or payment_events.
-- * Buyer access is derived from purchases with status = 'completed'.
-- * Payment provider is provider-neutral (currently Paystack, test mode).

-- ============================================================
-- Helper functions (SECURITY DEFINER avoids RLS recursion)
-- ============================================================
-- The helpers below read these columns, so they must exist before the functions are validated.
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published', 'paused', 'archived'));
ALTER TABLE products ALTER COLUMN status SET DEFAULT 'draft';

CREATE OR REPLACE FUNCTION public.owns_product(p_product_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM products
    WHERE id = p_product_id AND creator_uid = public.current_uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.has_purchased(p_product_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM purchases
    WHERE product_id = p_product_id
      AND buyer_id = public.current_uid()::text
      AND status = 'completed'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_published_product(p_product_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM products
    WHERE id = p_product_id AND status = 'published'
  );
$$;

-- ============================================================
-- Products (extend legacy table from Firestore import)
-- ============================================================
-- Legacy rows were visible in the marketplace, so they start as published.
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published', 'paused', 'archived'));
ALTER TABLE products ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN'
  CHECK (currency IN ('NGN', 'USD'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_count INT NOT NULL DEFAULT 0 CHECK (sales_count >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating_count INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

-- NOT VALID: enforced for new rows, legacy rows are not re-checked.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('ebook', 'course', 'template', 'asset', 'music', 'video', 'app', 'other')) NOT VALID;

COMMENT ON COLUMN products.price IS 'Legacy NUMERIC price. Use price_cents. Drop after backfill.';

CREATE UNIQUE INDEX IF NOT EXISTS products_creator_slug_key
  ON products (creator_uid, slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_status_created ON products (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_sales ON products (status, sales_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_status_rating ON products (status, rating_avg DESC);
CREATE INDEX IF NOT EXISTS idx_products_creator ON products (creator_uid);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN (search_vector);

-- Creators may not self-report counters. Only server code (service role) changes these.
REVOKE UPDATE (sales_count, rating_avg, rating_count) ON products FROM anon, authenticated;

-- Publish rules: paid products need a payout account that can accept payments.
CREATE OR REPLACE FUNCTION public.enforce_product_publish_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.price_cents > 0 AND NOT EXISTS (
      SELECT 1 FROM creator_accounts ca
      WHERE ca.user_id = NEW.creator_uid AND ca.charges_enabled
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

DROP TRIGGER IF EXISTS products_publish_rules ON products;
CREATE TRIGGER products_publish_rules
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_publish_rules();

-- ============================================================
-- Creator payout accounts (one per creator, e.g. a Paystack subaccount)
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack', 'flutterwave', 'stripe')),
  provider_account_id TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL DEFAULT 'NG',
  bank_code TEXT,
  account_name TEXT,
  account_last4 TEXT,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_accounts_select ON creator_accounts FOR SELECT
  USING (user_id = public.current_uid()::text OR is_admin());

-- ============================================================
-- Product files (private bucket; storage_path never exposed to clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_files_product ON product_files (product_id, position);

ALTER TABLE product_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_files_owner_all ON product_files FOR ALL
  USING (owns_product(product_id) OR is_admin())
  WITH CHECK (owns_product(product_id) OR is_admin());

CREATE POLICY product_files_buyer_select ON product_files FOR SELECT
  USING (has_purchased(product_id));

-- Table-level SELECT overrides column-level REVOKE, so revoke the table grant first.
REVOKE SELECT ON product_files FROM anon, authenticated;
GRANT SELECT (id, product_id, file_name, mime_type, size_bytes, position, created_at)
  ON product_files TO anon, authenticated;

-- ============================================================
-- Lessons (courses)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  section_title TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT,
  video_asset_id TEXT,
  duration_seconds INT CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  is_preview BOOLEAN NOT NULL DEFAULT FALSE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_lessons_product ON product_lessons (product_id, position);

ALTER TABLE product_lessons ENABLE ROW LEVEL SECURITY;

-- Preview lessons are public for published products. Everything else needs ownership or a purchase.
CREATE POLICY product_lessons_select ON product_lessons FOR SELECT
  USING (
    owns_product(product_id)
    OR has_purchased(product_id)
    OR is_admin()
    OR (is_preview AND is_published_product(product_id))
  );

CREATE POLICY product_lessons_owner_write ON product_lessons FOR ALL
  USING (owns_product(product_id) OR is_admin())
  WITH CHECK (owns_product(product_id) OR is_admin());

-- ============================================================
-- Orders and line items (written by the payment webhook only)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded')),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency IN ('NGN', 'USD')),
  total_cents INT NOT NULL CHECK (total_cents >= 0),
  provider TEXT NOT NULL DEFAULT 'paystack',
  provider_transaction_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders (buyer_id, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_buyer_select ON orders FOR SELECT
  USING (buyer_id = public.current_uid()::text OR is_admin());

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
  platform_fee_cents INT NOT NULL CHECK (platform_fee_cents >= 0),
  creator_amount_cents INT NOT NULL CHECK (creator_amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('NGN', 'USD')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id, product_id),
  CHECK (platform_fee_cents + creator_amount_cents = unit_price_cents)
);

CREATE INDEX IF NOT EXISTS idx_order_items_creator ON order_items (creator_id, created_at DESC);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_items_select ON order_items FOR SELECT
  USING (
    creator_id = public.current_uid()::text
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id AND o.buyer_id = public.current_uid()::text
    )
    OR is_admin()
  );

-- ============================================================
-- Purchases (entitlements). Extend legacy table.
-- ============================================================
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS price_cents INT CHECK (price_cents IS NULL OR price_cents >= 0);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
  CHECK (status IN ('completed', 'refunded')) NOT VALID;

ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_product_id_fkey;
ALTER TABLE purchases ADD CONSTRAINT purchases_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS purchases_one_active_per_product
  ON purchases (buyer_id, product_id) WHERE status = 'completed';

-- Fix: buyers could previously insert their own purchase rows and get free access.
DROP POLICY IF EXISTS purchases_insert ON purchases;
REVOKE INSERT, UPDATE, DELETE ON purchases FROM anon, authenticated;

-- Keep sales_count in sync with completed purchases.
CREATE OR REPLACE FUNCTION public.sync_product_sales_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    UPDATE products SET sales_count = sales_count + 1 WHERE id = NEW.product_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'refunded' THEN
    UPDATE products SET sales_count = GREATEST(sales_count - 1, 0) WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_sales_count ON purchases;
CREATE TRIGGER purchases_sales_count
  AFTER INSERT OR UPDATE OF status ON purchases
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_sales_count();

-- ============================================================
-- Lesson progress
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES product_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY lesson_progress_own ON lesson_progress FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (
    user_id = public.current_uid()::text
    AND EXISTS (
      SELECT 1 FROM product_lessons l
      WHERE l.id = lesson_id AND has_purchased(l.product_id)
    )
  );

-- ============================================================
-- Reviews (buyers only, one per product)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT CHECK (char_length(body) <= 2000),
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, user_id)
);

ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_reviews_select ON product_reviews FOR SELECT
  USING (NOT hidden OR user_id = public.current_uid()::text OR is_admin());

CREATE POLICY product_reviews_insert ON product_reviews FOR INSERT
  WITH CHECK (user_id = public.current_uid()::text AND has_purchased(product_id));

CREATE POLICY product_reviews_update ON product_reviews FOR UPDATE
  USING (user_id = public.current_uid()::text OR is_admin())
  WITH CHECK (user_id = public.current_uid()::text OR is_admin());

CREATE POLICY product_reviews_delete ON product_reviews FOR DELETE
  USING (user_id = public.current_uid()::text OR is_admin());

-- Recompute rating_avg / rating_count on any review change.
CREATE OR REPLACE FUNCTION public.refresh_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id TEXT := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE products p
  SET rating_count = s.cnt,
      rating_avg = s.avg
  FROM (
    SELECT COUNT(*)::int AS cnt,
           COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS avg
    FROM product_reviews
    WHERE product_id = target_id AND NOT hidden
  ) s
  WHERE p.id = target_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_reviews_rating ON product_reviews;
CREATE TRIGGER product_reviews_rating
  AFTER INSERT OR UPDATE OR DELETE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_product_rating();

-- ============================================================
-- Payment webhook audit log (service role only, no client policies)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
