-- ============================================================
-- Migration 20260503: Feed System (Posts, Reactions, Comments)
-- Professional content feed for the social network layer.
-- ============================================================

-- ─── 1. TABLE: posts ───
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 3000),
  media_urls TEXT[] DEFAULT '{}',
  post_type TEXT DEFAULT 'update' CHECK (post_type IN ('update', 'job_share', 'achievement', 'article')),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_type ON public.posts(post_type);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS posts_updated_at_trigger ON public.posts;
CREATE TRIGGER posts_updated_at_trigger
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── 2. TABLE: post_reactions ───
CREATE TABLE IF NOT EXISTS public.post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT DEFAULT 'like' CHECK (reaction_type IN ('like', 'celebrate', 'insightful', 'support')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user_id ON public.post_reactions(user_id);

-- ─── 3. TABLE: post_comments ───
CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  parent_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON public.post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent_id ON public.post_comments(parent_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS post_comments_updated_at_trigger ON public.post_comments;
CREATE TRIGGER post_comments_updated_at_trigger
  BEFORE UPDATE ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ─── Posts RLS ───
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all posts (public feed for now)
CREATE POLICY "posts_authenticated_select" ON public.posts
  FOR SELECT TO authenticated USING (true);

-- Users can insert their own posts
CREATE POLICY "posts_owner_insert" ON public.posts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can update only their own posts
CREATE POLICY "posts_owner_update" ON public.posts
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Users can delete only their own posts
CREATE POLICY "posts_owner_delete" ON public.posts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── Post Reactions RLS ───
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- All authenticated can see reactions (for counts)
CREATE POLICY "reactions_authenticated_select" ON public.post_reactions
  FOR SELECT TO authenticated USING (true);

-- Users can insert their own reactions
CREATE POLICY "reactions_owner_insert" ON public.post_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can delete their own reactions (un-react)
CREATE POLICY "reactions_owner_delete" ON public.post_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── Post Comments RLS ───
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated can read comments
CREATE POLICY "comments_authenticated_select" ON public.post_comments
  FOR SELECT TO authenticated USING (true);

-- Users can insert comments
CREATE POLICY "comments_owner_insert" ON public.post_comments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Users can update own comments
CREATE POLICY "comments_owner_update" ON public.post_comments
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Users can delete own comments
CREATE POLICY "comments_owner_delete" ON public.post_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- Trigger: Auto-update reaction counts on posts
-- ============================================================
CREATE OR REPLACE FUNCTION update_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = (
      SELECT COUNT(*) FROM public.post_reactions WHERE post_id = NEW.post_id
    ) WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = (
      SELECT COUNT(*) FROM public.post_reactions WHERE post_id = OLD.post_id
    ) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_reactions_count_trigger ON public.post_reactions;
CREATE TRIGGER post_reactions_count_trigger
  AFTER INSERT OR DELETE ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION update_post_reaction_count();

-- ============================================================
-- Trigger: Auto-update comment counts on posts
-- ============================================================
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = (
      SELECT COUNT(*) FROM public.post_comments WHERE post_id = NEW.post_id
    ) WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = (
      SELECT COUNT(*) FROM public.post_comments WHERE post_id = OLD.post_id
    ) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_comments_count_trigger ON public.post_comments;
CREATE TRIGGER post_comments_count_trigger
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_post_comment_count();

-- ============================================================
-- Enable Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
