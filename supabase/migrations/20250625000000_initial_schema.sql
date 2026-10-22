-- Kith initial Postgres schema (migrated from Firestore)
-- Source: firebase-blueprint.json

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Core: Users
-- ============================================================
CREATE TABLE users (
  id TEXT PRIMARY KEY,  -- Firebase Auth UID
  uid TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  profile_image TEXT,
  bio TEXT DEFAULT '',
  location TEXT DEFAULT '',
  skills TEXT[] DEFAULT '{}',
  github_url TEXT DEFAULT '',
  experience_level TEXT CHECK (experience_level IN ('Beginner', 'Intermediate', 'Advanced')),
  user_type TEXT CHECK (user_type IN ('Developer', 'Buyer', 'Both')),
  intent TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}',
  onboarding_step INT DEFAULT 0,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  total_sales NUMERIC DEFAULT 0,
  total_impressions NUMERIC DEFAULT 0,
  xp INT DEFAULT 100,
  badges TEXT[] DEFAULT '{}',
  daily_gifting_remaining INT DEFAULT 100,
  last_gifting_reset TIMESTAMPTZ DEFAULT NOW(),
  providers TEXT[] DEFAULT '{}',
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  settings JSONB DEFAULT '{}',
  theme TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_xp ON users (xp DESC);
CREATE INDEX idx_users_email ON users (email);

-- User subcollections
CREATE TABLE user_followers (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, follower_id)
);

CREATE TABLE user_following (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, following_id)
);

CREATE TABLE user_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE user_blocked_users (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, blocked_user_id)
);

-- ============================================================
-- Posts & engagement
-- ============================================================
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL DEFAULT '',
  author_photo TEXT DEFAULT '',
  author_xp INT DEFAULT 0,
  community_id TEXT,
  content TEXT NOT NULL,
  code_snippet TEXT,
  language TEXT,
  media JSONB DEFAULT '[]',
  poll JSONB,
  github_link TEXT,
  hashtags TEXT[] DEFAULT '{}',
  visibility TEXT DEFAULT 'public',
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  reposts_count INT DEFAULT 0,
  impressions INT DEFAULT 0,
  xp_value INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_author ON posts (author_uid);
CREATE INDEX idx_posts_created ON posts (created_at DESC);
CREATE INDEX idx_posts_visibility_created ON posts (visibility, created_at DESC);
CREATE INDEX idx_posts_community ON posts (community_id);

CREATE TABLE post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT DEFAULT '',
  author_photo TEXT DEFAULT '',
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  replies_count INT DEFAULT 0,
  reply_to_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_post_comments_post ON post_comments (post_id, created_at);

CREATE TABLE post_likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE post_views (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ============================================================
-- Articles
-- ============================================================
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  author_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  cover_image TEXT,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  tags TEXT[] DEFAULT '{}',
  reading_time INT DEFAULT 0,
  views_count INT DEFAULT 0,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_articles_status_created ON articles (status, created_at DESC);

CREATE TABLE article_comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT DEFAULT '',
  author_photo TEXT DEFAULT '',
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE article_likes (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (article_id, user_id)
);

-- ============================================================
-- Communities
-- ============================================================
CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT,
  banner_url TEXT,
  visibility TEXT DEFAULT 'public',
  member_count INT DEFAULT 0,
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_communities_created ON communities (created_at DESC);

CREATE TABLE community_members (
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
  permissions JSONB DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

CREATE INDEX idx_community_members_user ON community_members (user_id);

CREATE TABLE community_categories (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES community_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channels_community ON channels (community_id);

CREATE TABLE channel_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name TEXT DEFAULT '',
  author_photo TEXT DEFAULT '',
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  reply_to_id TEXT,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channel_messages_channel ON channel_messages (channel_id, created_at DESC);

CREATE TABLE community_join_requests (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Messaging
-- ============================================================
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  participant_ids TEXT[] NOT NULL,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read_by TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_messages ON conversation_messages (conversation_id, created_at DESC);

-- ============================================================
-- Notifications
-- ============================================================
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id TEXT,
  sender_name TEXT DEFAULT '',
  sender_photo TEXT DEFAULT '',
  type TEXT NOT NULL,
  category TEXT DEFAULT 'social',
  priority TEXT DEFAULT 'normal',
  content TEXT NOT NULL,
  related_id TEXT,
  channel_id TEXT,
  read BOOLEAN DEFAULT FALSE,
  actors JSONB DEFAULT '[]',
  merged_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications (recipient_id, created_at DESC);

-- ============================================================
-- XP, purchases, hashtags
-- ============================================================
CREATE TABLE xp_transactions (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT,
  amount NUMERIC DEFAULT 0,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hashtags (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hashtags_count ON hashtags (count DESC);

-- ============================================================
-- Feed / ranking
-- ============================================================
CREATE TABLE user_interests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  categories TEXT[] DEFAULT '{}',
  skills TEXT[] DEFAULT '{}',
  hashtags TEXT[] DEFAULT '{}',
  followed_topics TEXT[] DEFAULT '{}'
);

CREATE TABLE user_engagement_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  liked_tags JSONB DEFAULT '{}',
  bookmarked_tags JSONB DEFAULT '{}',
  purchased_categories TEXT[] DEFAULT '{}',
  joined_communities TEXT[] DEFAULT '{}',
  interaction_history JSONB DEFAULT '[]'
);

-- ============================================================
-- Challenges, events, products, jobs (secondary)
-- ============================================================
CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  creator_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT,
  status TEXT DEFAULT 'active',
  deadline TIMESTAMPTZ,
  reward_xp INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE challenge_submissions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_repo TEXT,
  demo_url TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT DEFAULT 'public',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_visibility ON events (visibility, created_at DESC);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  creator_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_name TEXT DEFAULT '',
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  product_type TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  creator_uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  company TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration sync metadata (for delta sync during cutover)
CREATE TABLE migration_sync_log (
  id SERIAL PRIMARY KEY,
  collection TEXT NOT NULL,
  firestore_path TEXT NOT NULL,
  supabase_table TEXT NOT NULL,
  document_id TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (collection, document_id)
);

CREATE INDEX idx_migration_sync_collection ON migration_sync_log (collection, synced_at DESC);
