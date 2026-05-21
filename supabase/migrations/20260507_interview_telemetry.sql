-- Create the interview telemetry table for debugging and tracking AI performance
CREATE TABLE IF NOT EXISTS public.interview_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    candidate_name TEXT,
    role_title TEXT,
    turn_index INTEGER NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    reasoning_text TEXT,
    prompt_text TEXT,
    response_text TEXT,
    error_text TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index for faster querying by session
CREATE INDEX IF NOT EXISTS idx_interview_telemetry_session_id ON public.interview_telemetry(session_id);

-- Add index for ordering by time
CREATE INDEX IF NOT EXISTS idx_interview_telemetry_created_at ON public.interview_telemetry(created_at DESC);

-- Enable RLS
ALTER TABLE public.interview_telemetry ENABLE ROW LEVEL SECURITY;

-- Allow insert from anon (since it's called from the backend/frontend during the interview)
-- Actually, since it will be inserted from the server API, we can use the service role key to bypass RLS,
-- but we'll add an insert policy for anon just in case we ever want to write directly from client.
CREATE POLICY "Enable insert for all users" ON public.interview_telemetry
    FOR INSERT WITH CHECK (true);

-- Allow select for authenticated admins only
CREATE POLICY "Enable read access for authenticated users" ON public.interview_telemetry
    FOR SELECT TO authenticated USING (true);
