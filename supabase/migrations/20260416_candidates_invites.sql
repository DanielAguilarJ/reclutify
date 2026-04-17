-- 20260416_candidates_invites.sql
CREATE TABLE IF NOT EXISTS public.candidate_invites (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  role_title TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  candidate_name TEXT,
  interview_link TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | completed | in-progress
  email_sent_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  evaluation JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
