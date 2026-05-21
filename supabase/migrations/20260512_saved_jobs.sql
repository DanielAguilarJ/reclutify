-- Saved jobs and application tracking
CREATE TABLE IF NOT EXISTS saved_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL,
  org_id UUID REFERENCES organizations(id),
  role_title TEXT NOT NULL,
  org_name TEXT,
  status TEXT DEFAULT 'applied' CHECK (status IN ('applied','in_review','interview_scheduled','interview_completed','offered','rejected','withdrawn')),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX idx_saved_jobs_user ON saved_jobs(user_id);
CREATE INDEX idx_applications_user ON job_applications(user_id, applied_at DESC);
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_jobs_own" ON saved_jobs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "applications_own" ON job_applications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
