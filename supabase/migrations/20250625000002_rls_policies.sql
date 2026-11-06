-- Row Level Security policies (ported from firestore.rules)

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_following ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_engagement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_sync_log ENABLE ROW LEVEL SECURITY;

-- Users: public read, owner/admin write
CREATE POLICY users_select ON users FOR SELECT USING (true);
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (id = public.current_uid()::text AND (role IS NULL OR role = 'user' OR is_admin()));
CREATE POLICY users_update ON users FOR UPDATE
  USING (id = public.current_uid()::text OR is_admin())
  WITH CHECK (id = public.current_uid()::text OR is_admin());
CREATE POLICY users_delete ON users FOR DELETE
  USING (id = public.current_uid()::text OR is_admin());

-- User subcollections
CREATE POLICY user_followers_all ON user_followers FOR ALL
  USING (user_id = public.current_uid()::text OR follower_id = public.current_uid()::text)
  WITH CHECK (follower_id = public.current_uid()::text);

CREATE POLICY user_following_all ON user_following FOR ALL
  USING (user_id = public.current_uid()::text OR following_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);

CREATE POLICY user_bookmarks_all ON user_bookmarks FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);

CREATE POLICY user_blocked_users_all ON user_blocked_users FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);

-- Posts: public read
CREATE POLICY posts_select ON posts FOR SELECT USING (true);
CREATE POLICY posts_insert ON posts FOR INSERT
  WITH CHECK (author_uid = public.current_uid()::text);
CREATE POLICY posts_update ON posts FOR UPDATE
  USING (author_uid = public.current_uid()::text OR is_admin())
  WITH CHECK (author_uid = public.current_uid()::text OR is_admin());
CREATE POLICY posts_delete ON posts FOR DELETE
  USING (author_uid = public.current_uid()::text OR is_admin());

CREATE POLICY post_comments_select ON post_comments FOR SELECT USING (true);
CREATE POLICY post_comments_insert ON post_comments FOR INSERT
  WITH CHECK (author_uid = public.current_uid()::text);
CREATE POLICY post_comments_update ON post_comments FOR UPDATE
  USING (author_uid = public.current_uid()::text)
  WITH CHECK (author_uid = public.current_uid()::text);
CREATE POLICY post_comments_delete ON post_comments FOR DELETE
  USING (author_uid = public.current_uid()::text OR is_admin());

CREATE POLICY post_likes_select ON post_likes FOR SELECT USING (true);
CREATE POLICY post_likes_insert ON post_likes FOR INSERT
  WITH CHECK (user_id = public.current_uid()::text);
CREATE POLICY post_likes_delete ON post_likes FOR DELETE
  USING (user_id = public.current_uid()::text);

CREATE POLICY post_views_all ON post_views FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);

-- Articles
CREATE POLICY articles_select ON articles FOR SELECT USING (
  status = 'published' OR author_uid = public.current_uid()::text OR is_admin()
);
CREATE POLICY articles_insert ON articles FOR INSERT
  WITH CHECK (author_uid = public.current_uid()::text);
CREATE POLICY articles_update ON articles FOR UPDATE
  USING (author_uid = public.current_uid()::text OR is_admin())
  WITH CHECK (author_uid = public.current_uid()::text OR is_admin());
CREATE POLICY articles_delete ON articles FOR DELETE
  USING (author_uid = public.current_uid()::text OR is_admin());

CREATE POLICY article_comments_select ON article_comments FOR SELECT USING (true);
CREATE POLICY article_comments_insert ON article_comments FOR INSERT
  WITH CHECK (author_uid = public.current_uid()::text);
CREATE POLICY article_comments_update ON article_comments FOR UPDATE
  USING (author_uid = public.current_uid()::text);
CREATE POLICY article_comments_delete ON article_comments FOR DELETE
  USING (author_uid = public.current_uid()::text OR is_admin());

CREATE POLICY article_likes_select ON article_likes FOR SELECT USING (true);
CREATE POLICY article_likes_insert ON article_likes FOR INSERT
  WITH CHECK (user_id = public.current_uid()::text);
CREATE POLICY article_likes_delete ON article_likes FOR DELETE
  USING (user_id = public.current_uid()::text);

-- Communities
CREATE POLICY communities_select ON communities FOR SELECT USING (true);
CREATE POLICY communities_insert ON communities FOR INSERT
  WITH CHECK (creator_id = public.current_uid()::text);
CREATE POLICY communities_update ON communities FOR UPDATE
  USING (is_community_admin(id) OR is_admin())
  WITH CHECK (is_community_admin(id) OR is_admin());
CREATE POLICY communities_delete ON communities FOR DELETE
  USING (is_community_owner(id) OR is_admin());

CREATE POLICY community_members_select ON community_members FOR SELECT USING (true);
CREATE POLICY community_members_insert ON community_members FOR INSERT
  WITH CHECK (user_id = public.current_uid()::text OR is_community_admin(community_id));
CREATE POLICY community_members_update ON community_members FOR UPDATE
  USING (is_community_admin(community_id) OR is_admin());
CREATE POLICY community_members_delete ON community_members FOR DELETE
  USING (user_id = public.current_uid()::text OR is_community_admin(community_id) OR is_admin());

CREATE POLICY community_categories_select ON community_categories FOR SELECT USING (true);
CREATE POLICY community_categories_all ON community_categories FOR ALL
  USING (is_community_admin(community_id) OR is_admin())
  WITH CHECK (is_community_admin(community_id) OR is_admin());

CREATE POLICY channels_select ON channels FOR SELECT USING (true);
CREATE POLICY channels_all ON channels FOR ALL
  USING (is_community_admin(community_id) OR is_admin())
  WITH CHECK (is_community_admin(community_id) OR is_admin());

CREATE POLICY channel_messages_select ON channel_messages FOR SELECT USING (true);
CREATE POLICY channel_messages_insert ON channel_messages FOR INSERT
  WITH CHECK (author_uid = public.current_uid()::text);
CREATE POLICY channel_messages_update ON channel_messages FOR UPDATE
  USING (author_uid = public.current_uid()::text OR is_community_admin(
    (SELECT community_id FROM channels WHERE id = channel_id)
  ));
CREATE POLICY channel_messages_delete ON channel_messages FOR DELETE
  USING (author_uid = public.current_uid()::text OR is_admin());

CREATE POLICY community_join_requests_select ON community_join_requests FOR SELECT
  USING (user_id = public.current_uid()::text OR is_community_admin(community_id));
CREATE POLICY community_join_requests_insert ON community_join_requests FOR INSERT
  WITH CHECK (user_id = public.current_uid()::text);
CREATE POLICY community_join_requests_update ON community_join_requests FOR UPDATE
  USING (is_community_admin(community_id));

-- Conversations
CREATE POLICY conversations_select ON conversations FOR SELECT
  USING (public.current_uid()::text = ANY(participant_ids));
CREATE POLICY conversations_insert ON conversations FOR INSERT
  WITH CHECK (public.current_uid()::text = ANY(participant_ids));
CREATE POLICY conversations_update ON conversations FOR UPDATE
  USING (public.current_uid()::text = ANY(participant_ids));

CREATE POLICY conversation_messages_select ON conversation_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id AND public.current_uid()::text = ANY(c.participant_ids)
  ));
CREATE POLICY conversation_messages_insert ON conversation_messages FOR INSERT
  WITH CHECK (
    sender_id = public.current_uid()::text AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND public.current_uid()::text = ANY(c.participant_ids)
    )
  );

-- Notifications
CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (recipient_id = public.current_uid()::text);
CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (true);  -- any authenticated user can create notifications for others
CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (recipient_id = public.current_uid()::text)
  WITH CHECK (recipient_id = public.current_uid()::text);
CREATE POLICY notifications_delete ON notifications FOR DELETE
  USING (recipient_id = public.current_uid()::text);

-- XP transactions: read own, insert via gift_xp function only
CREATE POLICY xp_transactions_select ON xp_transactions FOR SELECT
  USING (sender_id = public.current_uid()::text OR receiver_id = public.current_uid()::text);

-- Purchases
CREATE POLICY purchases_select ON purchases FOR SELECT
  USING (buyer_id = public.current_uid()::text OR is_admin());
CREATE POLICY purchases_insert ON purchases FOR INSERT
  WITH CHECK (buyer_id = public.current_uid()::text);

-- Hashtags: public read, authenticated write
CREATE POLICY hashtags_select ON hashtags FOR SELECT USING (true);
CREATE POLICY hashtags_insert ON hashtags FOR INSERT WITH CHECK (is_authenticated());
CREATE POLICY hashtags_update ON hashtags FOR UPDATE USING (is_authenticated());

-- Feed/ranking profiles
CREATE POLICY user_interests_all ON user_interests FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);

CREATE POLICY user_engagement_profiles_all ON user_engagement_profiles FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);

-- Secondary content
CREATE POLICY challenges_select ON challenges FOR SELECT USING (true);
CREATE POLICY challenges_insert ON challenges FOR INSERT WITH CHECK (creator_uid = public.current_uid()::text);
CREATE POLICY challenges_update ON challenges FOR UPDATE USING (creator_uid = public.current_uid()::text OR is_admin());
CREATE POLICY challenges_delete ON challenges FOR DELETE USING (creator_uid = public.current_uid()::text OR is_admin());

CREATE POLICY challenge_submissions_select ON challenge_submissions FOR SELECT USING (true);
CREATE POLICY challenge_submissions_insert ON challenge_submissions FOR INSERT
  WITH CHECK (user_uid = public.current_uid()::text);

CREATE POLICY events_select ON events FOR SELECT USING (visibility = 'public' OR host_id = public.current_uid()::text OR is_admin());
CREATE POLICY events_insert ON events FOR INSERT WITH CHECK (host_id = public.current_uid()::text);
CREATE POLICY events_update ON events FOR UPDATE USING (host_id = public.current_uid()::text OR is_admin());
CREATE POLICY events_delete ON events FOR DELETE USING (host_id = public.current_uid()::text OR is_admin());

CREATE POLICY products_select ON products FOR SELECT USING (true);
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (creator_uid = public.current_uid()::text);
CREATE POLICY products_update ON products FOR UPDATE USING (creator_uid = public.current_uid()::text OR is_admin());
CREATE POLICY products_delete ON products FOR DELETE USING (creator_uid = public.current_uid()::text OR is_admin());

CREATE POLICY jobs_select ON jobs FOR SELECT USING (true);
CREATE POLICY jobs_insert ON jobs FOR INSERT WITH CHECK (creator_uid = public.current_uid()::text);
CREATE POLICY jobs_update ON jobs FOR UPDATE USING (creator_uid = public.current_uid()::text OR is_admin());
CREATE POLICY jobs_delete ON jobs FOR DELETE USING (creator_uid = public.current_uid()::text OR is_admin());

-- Migration sync log: service role only (no client policies)
CREATE POLICY migration_sync_log_deny ON migration_sync_log FOR ALL USING (false);
