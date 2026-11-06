-- Firebase Auth UIDs are not UUIDs, but Supabase's auth.uid() casts the JWT `sub` claim to
-- uuid. Every policy and helper therefore uses public.current_uid(), which returns text.

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

-- ============================================================
-- Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.current_uid()::text;
$function$;

CREATE OR REPLACE FUNCTION public.gift_xp(p_receiver_id text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.has_purchased(p_product_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM purchases
    WHERE product_id = p_product_id
      AND buyer_id = public.current_uid()::text
      AND status = 'completed'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = public.current_uid()::text
      AND role = 'admin'
  )
  OR public.current_uid()::text = 'gxUXkEvkM2hMUjKbckogrgVfA2g2';
$function$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT public.current_uid() IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.is_community_admin(p_community_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id
      AND user_id = public.current_uid()::text
      AND role IN ('owner', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_community_owner(p_community_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community_id
      AND user_id = public.current_uid()::text
      AND role = 'owner'
  );
$function$;

CREATE OR REPLACE FUNCTION public.owns_product(p_product_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM products
    WHERE id = p_product_id AND creator_uid = public.current_uid()::text
  );
$function$;

-- ============================================================
-- Row-level security policies
-- ============================================================
DROP POLICY IF EXISTS "article_comments_delete" ON public."article_comments";
CREATE POLICY "article_comments_delete" ON public."article_comments" FOR DELETE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "article_comments_insert" ON public."article_comments";
CREATE POLICY "article_comments_insert" ON public."article_comments" FOR INSERT TO public WITH CHECK ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "article_comments_update" ON public."article_comments";
CREATE POLICY "article_comments_update" ON public."article_comments" FOR UPDATE TO public USING ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "article_likes_delete" ON public."article_likes";
CREATE POLICY "article_likes_delete" ON public."article_likes" FOR DELETE TO public USING ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "article_likes_insert" ON public."article_likes";
CREATE POLICY "article_likes_insert" ON public."article_likes" FOR INSERT TO public WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "articles_delete" ON public."articles";
CREATE POLICY "articles_delete" ON public."articles" FOR DELETE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "articles_insert" ON public."articles";
CREATE POLICY "articles_insert" ON public."articles" FOR INSERT TO public WITH CHECK ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "articles_select" ON public."articles";
CREATE POLICY "articles_select" ON public."articles" FOR SELECT TO public USING (((status = 'published'::text) OR (author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "articles_update" ON public."articles";
CREATE POLICY "articles_update" ON public."articles" FOR UPDATE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin())) WITH CHECK (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "challenge_submissions_insert" ON public."challenge_submissions";
CREATE POLICY "challenge_submissions_insert" ON public."challenge_submissions" FOR INSERT TO public WITH CHECK ((user_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "challenges_delete" ON public."challenges";
CREATE POLICY "challenges_delete" ON public."challenges" FOR DELETE TO public USING (((creator_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "challenges_insert" ON public."challenges";
CREATE POLICY "challenges_insert" ON public."challenges" FOR INSERT TO public WITH CHECK ((creator_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "challenges_update" ON public."challenges";
CREATE POLICY "challenges_update" ON public."challenges" FOR UPDATE TO public USING (((creator_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "channel_messages_delete" ON public."channel_messages";
CREATE POLICY "channel_messages_delete" ON public."channel_messages" FOR DELETE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "channel_messages_insert" ON public."channel_messages";
CREATE POLICY "channel_messages_insert" ON public."channel_messages" FOR INSERT TO public WITH CHECK ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "channel_messages_update" ON public."channel_messages";
CREATE POLICY "channel_messages_update" ON public."channel_messages" FOR UPDATE TO public USING (((author_uid = (public.current_uid())::text) OR is_community_admin(( SELECT channels.community_id
   FROM channels
  WHERE (channels.id = channel_messages.channel_id)))));

DROP POLICY IF EXISTS "communities_insert" ON public."communities";
CREATE POLICY "communities_insert" ON public."communities" FOR INSERT TO public WITH CHECK ((creator_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "community_join_requests_insert" ON public."community_join_requests";
CREATE POLICY "community_join_requests_insert" ON public."community_join_requests" FOR INSERT TO public WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "community_join_requests_select" ON public."community_join_requests";
CREATE POLICY "community_join_requests_select" ON public."community_join_requests" FOR SELECT TO public USING (((user_id = (public.current_uid())::text) OR is_community_admin(community_id)));

DROP POLICY IF EXISTS "community_members_delete" ON public."community_members";
CREATE POLICY "community_members_delete" ON public."community_members" FOR DELETE TO public USING (((user_id = (public.current_uid())::text) OR is_community_admin(community_id) OR is_admin()));

DROP POLICY IF EXISTS "community_members_insert" ON public."community_members";
CREATE POLICY "community_members_insert" ON public."community_members" FOR INSERT TO public WITH CHECK (((user_id = (public.current_uid())::text) OR is_community_admin(community_id)));

DROP POLICY IF EXISTS "conversation_messages_insert" ON public."conversation_messages";
CREATE POLICY "conversation_messages_insert" ON public."conversation_messages" FOR INSERT TO public WITH CHECK (((sender_id = (public.current_uid())::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_messages.conversation_id) AND ((public.current_uid())::text = ANY (c.participant_ids)))))));

DROP POLICY IF EXISTS "conversation_messages_select" ON public."conversation_messages";
CREATE POLICY "conversation_messages_select" ON public."conversation_messages" FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = conversation_messages.conversation_id) AND ((public.current_uid())::text = ANY (c.participant_ids))))));

DROP POLICY IF EXISTS "conversations_insert" ON public."conversations";
CREATE POLICY "conversations_insert" ON public."conversations" FOR INSERT TO public WITH CHECK (((public.current_uid())::text = ANY (participant_ids)));

DROP POLICY IF EXISTS "conversations_select" ON public."conversations";
CREATE POLICY "conversations_select" ON public."conversations" FOR SELECT TO public USING (((public.current_uid())::text = ANY (participant_ids)));

DROP POLICY IF EXISTS "conversations_update" ON public."conversations";
CREATE POLICY "conversations_update" ON public."conversations" FOR UPDATE TO public USING (((public.current_uid())::text = ANY (participant_ids)));

DROP POLICY IF EXISTS "creator_accounts_select" ON public."creator_accounts";
CREATE POLICY "creator_accounts_select" ON public."creator_accounts" FOR SELECT TO public USING (((user_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "creator_ledger_select" ON public."creator_ledger";
CREATE POLICY "creator_ledger_select" ON public."creator_ledger" FOR SELECT TO public USING (((creator_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "creator_payouts_select" ON public."creator_payouts";
CREATE POLICY "creator_payouts_select" ON public."creator_payouts" FOR SELECT TO public USING (((creator_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "events_delete" ON public."events";
CREATE POLICY "events_delete" ON public."events" FOR DELETE TO public USING (((host_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "events_insert" ON public."events";
CREATE POLICY "events_insert" ON public."events" FOR INSERT TO public WITH CHECK ((host_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "events_select" ON public."events";
CREATE POLICY "events_select" ON public."events" FOR SELECT TO public USING (((visibility = 'public'::text) OR (host_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "events_update" ON public."events";
CREATE POLICY "events_update" ON public."events" FOR UPDATE TO public USING (((host_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "feed_preferences_all" ON public."feed_preferences";
CREATE POLICY "feed_preferences_all" ON public."feed_preferences" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "jobs_delete" ON public."jobs";
CREATE POLICY "jobs_delete" ON public."jobs" FOR DELETE TO public USING (((creator_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "jobs_insert" ON public."jobs";
CREATE POLICY "jobs_insert" ON public."jobs" FOR INSERT TO public WITH CHECK ((creator_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "jobs_update" ON public."jobs";
CREATE POLICY "jobs_update" ON public."jobs" FOR UPDATE TO public USING (((creator_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "lesson_progress_own" ON public."lesson_progress";
CREATE POLICY "lesson_progress_own" ON public."lesson_progress" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK (((user_id = (public.current_uid())::text) AND (EXISTS ( SELECT 1
   FROM product_lessons l
  WHERE ((l.id = lesson_progress.lesson_id) AND has_purchased(l.product_id))))));

DROP POLICY IF EXISTS "notifications_delete" ON public."notifications";
CREATE POLICY "notifications_delete" ON public."notifications" FOR DELETE TO public USING ((recipient_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "notifications_select" ON public."notifications";
CREATE POLICY "notifications_select" ON public."notifications" FOR SELECT TO public USING ((recipient_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "notifications_update" ON public."notifications";
CREATE POLICY "notifications_update" ON public."notifications" FOR UPDATE TO public USING ((recipient_id = (public.current_uid())::text)) WITH CHECK ((recipient_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "order_items_select" ON public."order_items";
CREATE POLICY "order_items_select" ON public."order_items" FOR SELECT TO public USING (((creator_id = (public.current_uid())::text) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.buyer_id = (public.current_uid())::text)))) OR is_admin()));

DROP POLICY IF EXISTS "orders_buyer_select" ON public."orders";
CREATE POLICY "orders_buyer_select" ON public."orders" FOR SELECT TO public USING (((buyer_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "post_comments_delete" ON public."post_comments";
CREATE POLICY "post_comments_delete" ON public."post_comments" FOR DELETE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "post_comments_insert" ON public."post_comments";
CREATE POLICY "post_comments_insert" ON public."post_comments" FOR INSERT TO public WITH CHECK ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "post_comments_update" ON public."post_comments";
CREATE POLICY "post_comments_update" ON public."post_comments" FOR UPDATE TO public USING ((author_uid = (public.current_uid())::text)) WITH CHECK ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "post_likes_delete" ON public."post_likes";
CREATE POLICY "post_likes_delete" ON public."post_likes" FOR DELETE TO public USING ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "post_likes_insert" ON public."post_likes";
CREATE POLICY "post_likes_insert" ON public."post_likes" FOR INSERT TO public WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "post_views_all" ON public."post_views";
CREATE POLICY "post_views_all" ON public."post_views" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "posts_delete" ON public."posts";
CREATE POLICY "posts_delete" ON public."posts" FOR DELETE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "posts_insert" ON public."posts";
CREATE POLICY "posts_insert" ON public."posts" FOR INSERT TO public WITH CHECK ((author_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "posts_update" ON public."posts";
CREATE POLICY "posts_update" ON public."posts" FOR UPDATE TO public USING (((author_uid = (public.current_uid())::text) OR is_admin())) WITH CHECK (((author_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "product_reviews_delete" ON public."product_reviews";
CREATE POLICY "product_reviews_delete" ON public."product_reviews" FOR DELETE TO public USING (((user_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "product_reviews_insert" ON public."product_reviews";
CREATE POLICY "product_reviews_insert" ON public."product_reviews" FOR INSERT TO public WITH CHECK (((user_id = (public.current_uid())::text) AND has_purchased(product_id)));

DROP POLICY IF EXISTS "product_reviews_select" ON public."product_reviews";
CREATE POLICY "product_reviews_select" ON public."product_reviews" FOR SELECT TO public USING (((NOT hidden) OR (user_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "product_reviews_update" ON public."product_reviews";
CREATE POLICY "product_reviews_update" ON public."product_reviews" FOR UPDATE TO public USING (((user_id = (public.current_uid())::text) OR is_admin())) WITH CHECK (((user_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "products_delete" ON public."products";
CREATE POLICY "products_delete" ON public."products" FOR DELETE TO public USING (((creator_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "products_insert" ON public."products";
CREATE POLICY "products_insert" ON public."products" FOR INSERT TO public WITH CHECK ((creator_uid = (public.current_uid())::text));

DROP POLICY IF EXISTS "products_update" ON public."products";
CREATE POLICY "products_update" ON public."products" FOR UPDATE TO public USING (((creator_uid = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "purchases_select" ON public."purchases";
CREATE POLICY "purchases_select" ON public."purchases" FOR SELECT TO public USING (((buyer_id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "user_blocked_users_all" ON public."user_blocked_users";
CREATE POLICY "user_blocked_users_all" ON public."user_blocked_users" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "user_bookmarks_all" ON public."user_bookmarks";
CREATE POLICY "user_bookmarks_all" ON public."user_bookmarks" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "user_engagement_profiles_all" ON public."user_engagement_profiles";
CREATE POLICY "user_engagement_profiles_all" ON public."user_engagement_profiles" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "user_followers_all" ON public."user_followers";
CREATE POLICY "user_followers_all" ON public."user_followers" FOR ALL TO public USING (((user_id = (public.current_uid())::text) OR (follower_id = (public.current_uid())::text))) WITH CHECK ((follower_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "user_following_all" ON public."user_following";
CREATE POLICY "user_following_all" ON public."user_following" FOR ALL TO public USING (((user_id = (public.current_uid())::text) OR (following_id = (public.current_uid())::text))) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "user_interests_all" ON public."user_interests";
CREATE POLICY "user_interests_all" ON public."user_interests" FOR ALL TO public USING ((user_id = (public.current_uid())::text)) WITH CHECK ((user_id = (public.current_uid())::text));

DROP POLICY IF EXISTS "users_delete" ON public."users";
CREATE POLICY "users_delete" ON public."users" FOR DELETE TO public USING (((id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "users_insert" ON public."users";
CREATE POLICY "users_insert" ON public."users" FOR INSERT TO public WITH CHECK (((id = (public.current_uid())::text) AND ((role IS NULL) OR (role = 'user'::text) OR is_admin())));

DROP POLICY IF EXISTS "users_update" ON public."users";
CREATE POLICY "users_update" ON public."users" FOR UPDATE TO public USING (((id = (public.current_uid())::text) OR is_admin())) WITH CHECK (((id = (public.current_uid())::text) OR is_admin()));

DROP POLICY IF EXISTS "xp_transactions_select" ON public."xp_transactions";
CREATE POLICY "xp_transactions_select" ON public."xp_transactions" FOR SELECT TO public USING (((sender_id = (public.current_uid())::text) OR (receiver_id = (public.current_uid())::text)));

