-- ============================================================
-- Migration 20260501: Job Search / Career Fair Portal
-- Adds published status, full-text search, and public RLS
-- for the /career-fair job board.
-- ============================================================

-- ─── 1. Add publishing columns to roles ───
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ─── 2. Add source tracking to candidates ───
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct';

-- ─── 3. Composite index for fast published job queries ───
CREATE INDEX IF NOT EXISTS idx_roles_published
  ON roles(is_published, created_at DESC)
  WHERE is_published = true;

-- ─── 4. Full-text search vector ───
ALTER TABLE roles ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- GIN index for performant full-text search
CREATE INDEX IF NOT EXISTS idx_roles_search_vector
  ON roles USING GIN(search_vector);

-- Trigger function: builds tsvector from title + description + location
-- Uses both spanish and english configs for bilingual support
CREATE OR REPLACE FUNCTION roles_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('spanish', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.location, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.location, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS roles_search_vector_trigger ON roles;
CREATE TRIGGER roles_search_vector_trigger
  BEFORE INSERT OR UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION roles_search_vector_update();

-- Backfill search_vector for existing rows
UPDATE roles SET search_vector =
  setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('spanish', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(location, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(location, '')), 'C');

-- ─── 5. RLS: Public read access for published roles (anon) ───
-- This allows unauthenticated users to browse published jobs
CREATE POLICY "public_published_roles_select" ON roles
  FOR SELECT
  TO anon
  USING (is_published = true);

-- ─── 6. RLS: Allow anonymous candidate inserts (job applications) ───
-- Applications from the public portal need to insert into candidates
CREATE POLICY "public_career_fair_candidates_insert" ON candidates
  FOR INSERT
  TO anon
  WITH CHECK (source = 'career-fair');

-- ─── 7. RLS: Allow anonymous reads on organizations (for logo/name on job cards) ───
-- Only expose minimal org info via the roles join
CREATE POLICY "public_org_info_select" ON organizations
  FOR SELECT
  TO anon
  USING (
    id IN (SELECT org_id FROM roles WHERE is_published = true)
  );
