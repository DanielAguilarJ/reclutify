-- Add raw payload column to capture everything sent from frontend to backend
ALTER TABLE public.interview_telemetry 
ADD COLUMN IF NOT EXISTS raw_payload JSONB;
