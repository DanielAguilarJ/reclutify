-- ============================================================
-- Migration 20260502: Social Profiles for Professional Network
-- Adds a separate `profiles` table for candidate/recruiter
-- social presence (distinct from org-scoped `user_profiles`).
-- ============================================================

-- ─── 1. TABLE: profiles ───
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  headline TEXT,
  bio TEXT,
  location TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  public_email BOOLEAN DEFAULT false,
  is_open_to_work BOOLEAN DEFAULT true,
  user_type TEXT DEFAULT 'candidate' CHECK (user_type IN ('candidate', 'recruiter')),
  skills TEXT[] DEFAULT '{}',
  experience JSONB DEFAULT '[]'::jsonb,
  education JSONB DEFAULT '[]'::jsonb,
  connections_count INTEGER DEFAULT 0,
  profile_views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. INDEXES ───
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_user_type ON public.profiles(user_type);
CREATE INDEX IF NOT EXISTS idx_profiles_is_open_to_work ON public.profiles(is_open_to_work) WHERE is_open_to_work = true;
CREATE INDEX IF NOT EXISTS idx_profiles_skills ON public.profiles USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location);

-- ─── 3. Full-text search vector ───
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

CREATE INDEX IF NOT EXISTS idx_profiles_search_vector
  ON public.profiles USING GIN(search_vector);

-- Trigger: auto-build search vector on insert/update
CREATE OR REPLACE FUNCTION profiles_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('spanish', coalesce(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.headline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.headline, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.bio, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.bio, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.skills, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_search_vector_trigger ON public.profiles;
CREATE TRIGGER profiles_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION profiles_search_vector_update();

-- ─── 4. Auto-update updated_at trigger ───
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at_trigger ON public.profiles;
CREATE TRIGGER profiles_updated_at_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── 5. RLS POLICIES ───
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public: anyone can view profiles (SEO-indexable)
CREATE POLICY "profiles_public_select" ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Owner: only the user can insert their own profile
CREATE POLICY "profiles_owner_insert" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner: only the user can update their own profile
CREATE POLICY "profiles_owner_update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Owner: only the user can delete their own profile
CREATE POLICY "profiles_owner_delete" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ─── 6. Enable Realtime ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
