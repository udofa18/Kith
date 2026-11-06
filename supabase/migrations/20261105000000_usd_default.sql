-- New products and orders default to USD, the only currency Stripe card payments accept here.
-- Existing NGN rows are kept as they are. Checkout refuses them until the seller sets a USD price.
ALTER TABLE products ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'USD';
