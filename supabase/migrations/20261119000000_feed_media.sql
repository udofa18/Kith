-- Feed media processing records.
--
-- Posts still live in Firestore during the migration, and a post's existing `media` array
-- remains the attachment relationship used by the feed. This table is the canonical record
-- for the hybrid image pipeline: original path, decoded dimensions, processing status and
-- generated variant paths. It is written by the service role only.
--
-- `user_id` and `post_id` intentionally have no foreign keys: Firestore is the current
-- source of truth and the Supabase mirror may lag a post/user write. The columns are still
-- indexed and checked server-side.

CREATE TABLE IF NOT EXISTS feed_media (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  post_id TEXT,
  bucket TEXT NOT NULL DEFAULT 'posts',
  original_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_bytes BIGINT NOT NULL CHECK (original_bytes > 0),
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  aspect_ratio DOUBLE PRECISION NOT NULL CHECK (aspect_ratio > 0),
  format TEXT NOT NULL,
  has_alpha BOOLEAN NOT NULL DEFAULT false,
  is_animated BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  variants JSONB NOT NULL DEFAULT '{}'::jsonb,
  placeholder TEXT,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, original_path)
);

CREATE INDEX IF NOT EXISTS idx_feed_media_user_created
  ON feed_media (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_media_status_updated
  ON feed_media (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_feed_media_post
  ON feed_media (post_id)
  WHERE post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_feed_media_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feed_media_touch_updated_at ON feed_media;
CREATE TRIGGER feed_media_touch_updated_at
  BEFORE UPDATE ON feed_media
  FOR EACH ROW EXECUTE FUNCTION public.touch_feed_media_updated_at();

ALTER TABLE feed_media ENABLE ROW LEVEL SECURITY;

-- Owners may read their own processing records. There are deliberately no INSERT/UPDATE/
-- DELETE policies: all writes go through authenticated server endpoints using the service
-- role, so a client cannot forge status, variant paths or another user's media.
DROP POLICY IF EXISTS feed_media_select_own ON feed_media;
CREATE POLICY feed_media_select_own ON feed_media
  FOR SELECT TO authenticated
  USING (user_id = public.current_uid()::text);

COMMENT ON TABLE feed_media IS
  'Hybrid feed image pipeline records. Variant paths are relative to the posts Storage bucket.';
COMMENT ON COLUMN feed_media.variants IS
  'Structured map: { "thumbnail": { "path", "width", "height", "bytes", "mimeType" }, ... }';
