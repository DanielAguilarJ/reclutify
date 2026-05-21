-- Groups / Communities
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  cover_url TEXT,
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  privacy TEXT DEFAULT 'public' CHECK (privacy IN ('public','private')),
  members_count INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin','moderator','member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS group_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 3000),
  media_urls TEXT[] DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_groups_slug ON groups(slug);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_posts_group ON group_posts(group_id, created_at DESC);
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups_select" ON groups FOR SELECT TO authenticated USING (privacy = 'public' OR id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "groups_insert" ON groups FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "groups_update" ON groups FOR UPDATE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "groups_delete" ON groups FOR DELETE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "gm_select" ON group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "gm_insert" ON group_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "gm_delete" ON group_members FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "gp_select" ON group_posts FOR SELECT TO authenticated USING (group_id IN (SELECT id FROM groups WHERE privacy = 'public') OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "gp_insert" ON group_posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));
CREATE POLICY "gp_delete" ON group_posts FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_group_member_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN UPDATE groups SET members_count = members_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN UPDATE groups SET members_count = GREATEST(0, members_count - 1) WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_group_member_count AFTER INSERT OR DELETE ON group_members FOR EACH ROW EXECUTE FUNCTION update_group_member_count();
