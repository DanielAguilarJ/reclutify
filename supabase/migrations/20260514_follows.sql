-- Follow system (unidirectional)
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows_select" ON follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows_insert" ON follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete" ON follows FOR DELETE TO authenticated USING (follower_id = auth.uid());
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION update_follow_counts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET followers_count = followers_count + 1 WHERE user_id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE user_id = NEW.follower_id;
    INSERT INTO notifications (user_id, type, title, metadata)
    VALUES (NEW.following_id, 'follow', 'New follower', jsonb_build_object('follower_id', NEW.follower_id));
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE user_id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = OLD.follower_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_follow_counts AFTER INSERT OR DELETE ON follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts();
