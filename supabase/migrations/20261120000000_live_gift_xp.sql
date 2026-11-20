-- Live-room gifting.
--
-- The sender pays XP once. The recipient receives the bulk of it, and when the
-- recipient is not the host, the host earns a 20% cut of the same gift. Keeping
-- the debit and both credits in one function means a gift can never half-apply
-- (sender charged but nobody credited) and the host bonus never has to be
-- minted client-side.
--
-- Rules mirror public.gift_xp:
--   * 1-100 XP per transaction
--   * daily gifting allowance is enforced on the sender
--   * no self-gifting
--   * every credit is written to xp_transactions

CREATE OR REPLACE FUNCTION public.live_gift_xp(
  p_receiver_id text,
  p_amount integer,
  p_host_id text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_id TEXT := public.current_uid()::text;
  v_remaining INT;
  v_sender_xp INT;
  v_receiver_exists BOOLEAN;
  v_host_share INT := 0;
  v_recipient_net INT;
  v_tx_id TEXT;
BEGIN
  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100 THEN
    RAISE EXCEPTION 'Invalid gift amount';
  END IF;

  IF v_sender_id = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot gift XP to yourself';
  END IF;

  SELECT daily_gifting_remaining, xp
    INTO v_remaining, v_sender_xp
  FROM users
  WHERE id = v_sender_id
  FOR UPDATE;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'Sender not found';
  END IF;

  IF v_remaining < p_amount THEN
    RAISE EXCEPTION 'Insufficient daily gifting remaining';
  END IF;

  IF v_sender_xp < p_amount THEN
    RAISE EXCEPTION 'Insufficient XP balance';
  END IF;

  -- Guest viewers never get a users row, so refuse instead of silently
  -- debiting the sender for a credit that would land nowhere.
  SELECT TRUE INTO v_receiver_exists
  FROM users
  WHERE id = p_receiver_id;

  IF v_receiver_exists IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- The host cut applies only when someone else is being gifted. A gift to the
  -- host already pays the host in full, and a host gifting a guest should not
  -- pay themselves a bonus.
  IF p_host_id IS NOT NULL
     AND p_host_id <> v_sender_id
     AND p_host_id <> p_receiver_id
     AND p_amount >= 5 THEN
    v_host_share := GREATEST(1, FLOOR(p_amount * 0.2)::INT);
  END IF;

  -- A host without a users row cannot receive the cut; give it all to the
  -- recipient rather than letting the UPDATE hit zero rows and burn XP.
  IF v_host_share > 0 AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_host_id) THEN
    v_host_share := 0;
  END IF;

  v_recipient_net := p_amount - v_host_share;

  UPDATE users SET
    xp = xp - p_amount,
    daily_gifting_remaining = daily_gifting_remaining - p_amount,
    last_gifting_reset = NOW(),
    updated_at = NOW()
  WHERE id = v_sender_id;

  UPDATE users SET
    xp = xp + v_recipient_net,
    updated_at = NOW()
  WHERE id = p_receiver_id;

  IF v_host_share > 0 THEN
    UPDATE users SET
      xp = xp + v_host_share,
      updated_at = NOW()
    WHERE id = p_host_id;

    INSERT INTO xp_transactions (id, sender_id, receiver_id, amount, timestamp)
    VALUES (gen_random_uuid()::text, v_sender_id, p_host_id, v_host_share, NOW());
  END IF;

  v_tx_id := gen_random_uuid()::text;

  INSERT INTO xp_transactions (id, sender_id, receiver_id, amount, timestamp)
  VALUES (v_tx_id, v_sender_id, p_receiver_id, v_recipient_net, NOW());

  RETURN jsonb_build_object(
    'transactionId', v_tx_id,
    'senderId', v_sender_id,
    'receiverId', p_receiver_id,
    'hostId', p_host_id,
    'amount', p_amount,
    'recipientNet', v_recipient_net,
    'hostShare', v_host_share
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.live_gift_xp(text, integer, text) TO authenticated;
