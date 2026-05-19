-- Blocks, Reports, Polls, Shares, Articles, Connection Notes
CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('post','comment','message','profile','group')),
  content_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam','harassment','inappropriate','misinformation','hate_speech','other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','action_taken','dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_options JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_ends_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shared_from_id UUID REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS article_title TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS article_content TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS article_cover_url TEXT;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX idx_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON user_blocks(blocked_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_poll_votes_post ON poll_votes(post_id);
CREATE INDEX idx_posts_shared ON posts(shared_from_id) WHERE shared_from_id IS NOT NULL;

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_own" ON user_blocks FOR ALL TO authenticated USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "reports_insert" ON reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_own_select" ON reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());
CREATE POLICY "poll_votes_select" ON poll_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "poll_votes_own" ON poll_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "poll_votes_delete" ON poll_votes FOR DELETE TO authenticated USING (user_id = auth.uid());
