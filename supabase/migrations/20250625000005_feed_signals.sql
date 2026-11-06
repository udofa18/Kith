-- Feed phase 2: engagement signals and explicit feed preferences.

-- Recently seen items (newest first, capped client-side) to down-rank repeats.
ALTER TABLE user_engagement_profiles
  ADD COLUMN IF NOT EXISTS seen_item_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Choices made from the feed menu: "Not interested", "Mute", "Show less".
CREATE TABLE IF NOT EXISTS feed_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hidden_item_ids TEXT[] DEFAULT '{}',
  muted_creator_ids TEXT[] DEFAULT '{}',
  less_topics TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE feed_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_preferences_all ON feed_preferences FOR ALL
  USING (user_id = public.current_uid()::text)
  WITH CHECK (user_id = public.current_uid()::text);
