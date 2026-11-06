-- RLS helper functions (ported from firestore.rules)
-- Firebase Auth UIDs are stored in public.current_uid() via third-party JWT integration

-- Supabase's built-in auth.uid() casts the JWT `sub` claim to UUID. Firebase UIDs are not UUIDs,
-- so every policy uses this TEXT-returning equivalent instead.
CREATE OR REPLACE FUNCTION public.current_uid()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_uid() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_uid()::text;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = public.current_uid()::text
      AND role = 'admin'
  )
  OR public.current_uid()::text = 'gxUXkEvkM2hMUjKbckogrgVfA2g2';
$$;

CREATE OR REPLACE FUNCTION public.is_community_admin(p_community_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id
      AND user_id = public.current_uid()::text
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_community_owner(p_community_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id
      AND user_id = public.current_uid()::text
      AND role = 'owner'
  );
$$;

-- XP gifting transaction (replaces Firestore runTransaction)
CREATE OR REPLACE FUNCTION public.gift_xp(
  p_receiver_id TEXT,
  p_amount INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id TEXT := public.current_uid()::text;
  v_remaining INT;
  v_tx_id TEXT;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount <= 0 OR p_amount > 100 THEN
    RAISE EXCEPTION 'Invalid gift amount';
  END IF;

  IF v_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot gift XP to yourself';
  END IF;

  SELECT daily_gifting_remaining INTO v_remaining
  FROM users WHERE id = v_sender_id FOR UPDATE;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'Sender not found';
  END IF;

  IF v_remaining < p_amount THEN
    RAISE EXCEPTION 'Insufficient daily gifting remaining';
  END IF;

  -- Verify sender has enough XP balance
  IF (SELECT xp FROM users WHERE id = v_sender_id) < p_amount THEN
    RAISE EXCEPTION 'Insufficient XP balance';
  END IF;

  UPDATE users SET
    xp = xp - p_amount,
    daily_gifting_remaining = daily_gifting_remaining - p_amount,
    last_gifting_reset = NOW(),
    updated_at = NOW()
  WHERE id = v_sender_id;

  UPDATE users SET
    xp = xp + p_amount,
    updated_at = NOW()
  WHERE id = p_receiver_id;

  v_tx_id := gen_random_uuid()::text;

  INSERT INTO xp_transactions (id, sender_id, receiver_id, amount, timestamp)
  VALUES (v_tx_id, v_sender_id, p_receiver_id, p_amount, NOW());

  RETURN jsonb_build_object(
    'transactionId', v_tx_id,
    'senderId', v_sender_id,
    'receiverId', p_receiver_id,
    'amount', p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gift_xp(TEXT, INT) TO authenticated;
