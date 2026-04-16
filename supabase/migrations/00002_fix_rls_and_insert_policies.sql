-- ============================================================
-- Migration 00002: Create all core tables (if not exist) and
-- fix RLS policies to allow INSERT during onboarding.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Create tables if they don't exist yet
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  max_interviews_per_month INTEGER DEFAULT 10,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  full_name TEXT,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  salary TEXT,
  job_type TEXT,
  topics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  role_id UUID REFERENCES roles(id),
  name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id),
  org_id UUID REFERENCES organizations(id),
  status TEXT,
  evaluation JSONB,
  transcript JSONB,
  duration INTEGER,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- Drop old policies to recreate cleanly (ignore errors if they don't exist)
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their own organization" ON organizations;
DROP POLICY IF EXISTS "Users can insert organization" ON organizations;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "org_isolation_roles" ON roles;
DROP POLICY IF EXISTS "org_isolation_candidates" ON candidates;
DROP POLICY IF EXISTS "org_isolation_interviews" ON interviews;

-- === ORGANIZATIONS ===
-- Any authenticated user can INSERT a new org (onboarding)
CREATE POLICY "Users can insert organization" ON organizations
  FOR INSERT TO authenticated WITH CHECK (true);

-- Users can only SELECT their own org
CREATE POLICY "Users can view their own organization" ON organizations
  FOR SELECT USING (id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

-- Users can UPDATE their own org
CREATE POLICY "Users can update their own organization" ON organizations
  FOR UPDATE USING (id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

-- === USER_PROFILES ===
-- Authenticated users can insert their own profile
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid());

-- === ROLES ===
CREATE POLICY "org_isolation_roles" ON roles
  USING (org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "org_isolation_roles_insert" ON roles
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- === CANDIDATES ===
CREATE POLICY "org_isolation_candidates" ON candidates
  USING (org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "org_isolation_candidates_insert" ON candidates
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- === INTERVIEWS ===
CREATE POLICY "org_isolation_interviews" ON interviews
  USING (org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

CREATE POLICY "org_isolation_interviews_insert" ON interviews
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );
