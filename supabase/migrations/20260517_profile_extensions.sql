-- ============================================================
-- Migration 20260517: Profile Extensions + Post Media
-- Adds certifications, languages to profiles.
-- Adds image_url to posts.
-- Creates storage buckets for media uploads.
-- ============================================================

-- ─── 1. Add certifications and languages columns to profiles ───
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages JSONB DEFAULT '[]'::jsonb;

-- ─── 2. Add image_url column to posts ───
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ─── 3. Create storage buckets ───
-- NOTE: Storage buckets must be created via the Supabase Dashboard or API,
-- not via SQL migrations. See instructions below.

-- ─── 4. Update search vector to include new fields ───
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
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.skills, ' '), '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.location, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. Add index for posts with images ───
CREATE INDEX IF NOT EXISTS idx_posts_image_url ON public.posts(image_url)
  WHERE image_url IS NOT NULL;

-- ─── 6. Add is_public column to profiles for sitemap ───
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
