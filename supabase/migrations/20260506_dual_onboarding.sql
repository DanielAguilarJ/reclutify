-- ============================================================
-- Migration 20260506: Dual Onboarding (Candidate + Employer)
-- Extends user_profiles with user_type and onboarding_completed
-- so the middleware can route by role in a single query.
-- ============================================================

-- ─── 1. Add dual-role columns to user_profiles ───
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS user_type TEXT DEFAULT 'employer'
    CHECK (user_type IN ('candidate', 'employer', 'admin')),
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- ─── 2. Backfill existing employers ───
-- Any user with an org_id is an employer who already completed onboarding.
UPDATE user_profiles
  SET onboarding_completed = true,
      user_type = 'employer'
  WHERE org_id IS NOT NULL
    AND (onboarding_completed IS NULL OR onboarding_completed = false);

-- ─── 3. Index for fast middleware lookups ───
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_type
  ON user_profiles(user_type);

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding
  ON user_profiles(onboarding_completed)
  WHERE onboarding_completed = false;
