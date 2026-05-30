-- ============================================================
-- Training Center - Centro de Capacitación Autónomo
-- ============================================================

-- 1. Training Programs (configured by employer)
CREATE TABLE IF NOT EXISTS public.training_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  welcome_message TEXT,
  ai_personality TEXT DEFAULT 'friendly_mentor',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Training Documents (company knowledge base)
CREATE TABLE IF NOT EXISTS public.training_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  extracted_text TEXT,
  ai_summary TEXT,
  ai_topics JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Training Modules (structured content)
CREATE TABLE IF NOT EXISTS public.training_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content JSONB DEFAULT '{}'::jsonb,
  source_document_id UUID REFERENCES public.training_documents(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  duration_estimate INTEGER DEFAULT 15,
  evaluation_enabled BOOLEAN DEFAULT true,
  evaluation_questions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Training Employees (hired candidates entering training)
CREATE TABLE IF NOT EXISTS public.training_employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_result_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  program_id UUID NOT NULL REFERENCES public.training_programs(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role_title TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('active', 'completed', 'paused', 'not_started')),
  overall_progress INTEGER DEFAULT 0,
  overall_score NUMERIC(5,2),
  hired_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  interview_data JSONB DEFAULT '{}'::jsonb,
  personalization_notes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Training Progress (per module per employee)
CREATE TABLE IF NOT EXISTS public.training_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.training_employees(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  ai_feedback TEXT,
  time_spent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, module_id)
);

-- 6. Training Evaluations (quiz results per module)
CREATE TABLE IF NOT EXISTS public.training_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.training_employees(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC(5,2),
  passed BOOLEAN DEFAULT false,
  attempts INTEGER DEFAULT 1,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Training Sessions (AI conversation history)
CREATE TABLE IF NOT EXISTS public.training_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.training_employees(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.training_modules(id) ON DELETE SET NULL,
  session_type TEXT DEFAULT 'module' CHECK (session_type IN ('module', 'general', 'evaluation')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_training_programs_org ON public.training_programs(org_id);
CREATE INDEX idx_training_documents_program ON public.training_documents(program_id);
CREATE INDEX idx_training_modules_program ON public.training_modules(program_id);
CREATE INDEX idx_training_employees_org ON public.training_employees(org_id);
CREATE INDEX idx_training_employees_token ON public.training_employees(token);
CREATE INDEX idx_training_employees_email ON public.training_employees(email);
CREATE INDEX idx_training_progress_employee ON public.training_progress(employee_id);
CREATE INDEX idx_training_progress_module ON public.training_progress(module_id);
CREATE INDEX idx_training_evaluations_employee ON public.training_evaluations(employee_id);
CREATE INDEX idx_training_sessions_employee ON public.training_sessions(employee_id);

-- RLS Policies
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: Training Programs
CREATE POLICY "Org members can manage training programs"
  ON public.training_programs FOR ALL
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

-- RLS: Training Documents
CREATE POLICY "Org members can manage training documents"
  ON public.training_documents FOR ALL
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

-- RLS: Training Modules (via program -> org)
CREATE POLICY "Org members can manage training modules"
  ON public.training_modules FOR ALL
  USING (program_id IN (SELECT id FROM public.training_programs WHERE org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())))
  WITH CHECK (program_id IN (SELECT id FROM public.training_programs WHERE org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())));

-- RLS: Training Employees
CREATE POLICY "Org members can view training employees"
  ON public.training_employees FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Org members can insert training employees"
  ON public.training_employees FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

CREATE POLICY "Org members or employee can update"
  ON public.training_employees FOR UPDATE
  USING (
    org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- RLS: Training Progress
CREATE POLICY "Access training progress"
  ON public.training_progress FOR ALL
  USING (
    employee_id IN (
      SELECT id FROM public.training_employees
      WHERE org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
      OR user_id = auth.uid()
    )
  );

-- RLS: Training Evaluations
CREATE POLICY "Access training evaluations"
  ON public.training_evaluations FOR ALL
  USING (
    employee_id IN (
      SELECT id FROM public.training_employees
      WHERE org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
      OR user_id = auth.uid()
    )
  );

-- RLS: Training Sessions
CREATE POLICY "Access training sessions"
  ON public.training_sessions FOR ALL
  USING (
    employee_id IN (
      SELECT id FROM public.training_employees
      WHERE org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid())
      OR user_id = auth.uid()
    )
  );

-- Function to calculate overall progress
CREATE OR REPLACE FUNCTION public.calculate_training_progress(p_employee_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_modules INTEGER;
  completed_modules INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_modules
  FROM public.training_progress
  WHERE employee_id = p_employee_id;

  SELECT COUNT(*) INTO completed_modules
  FROM public.training_progress
  WHERE employee_id = p_employee_id AND status = 'completed';

  IF total_modules = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((completed_modules::NUMERIC / total_modules::NUMERIC) * 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
