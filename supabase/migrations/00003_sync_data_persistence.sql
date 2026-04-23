-- ============================================================
-- Migración 00003: Persistencia de datos en la nube
-- Problema: Los datos solo vivían en localStorage (Zustand persist)
-- Solución: Tablas + políticas RLS para sincronización con Supabase
-- ============================================================

-- ─── 0. FIX: Cambiar tipo de id de roles a TEXT ───
-- La app genera IDs como 'role-1713456789' (texto), no UUIDs
-- Necesitamos TEXT para compatibilidad

-- Paso 0a: Eliminar la FK constraint que conecta candidates.role_id → roles.id
-- (no se puede cambiar el tipo de una columna referenciada mientras la FK exista)
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_role_id_fkey;

-- Paso 0b: Cambiar tipos de UUID a TEXT
ALTER TABLE public.roles ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE public.candidates ALTER COLUMN role_id TYPE TEXT USING role_id::TEXT;

-- Paso 0c: Recrear la FK constraint con los tipos ya compatibles (TEXT → TEXT)
ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES public.roles(id);

-- ─── 1. TABLA: interview_tickets ───
-- Persistir los tickets de entrevista para acceso cross-device
CREATE TABLE IF NOT EXISTS public.interview_tickets (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  candidate_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  language TEXT DEFAULT 'es' CHECK (language IN ('en', 'es')),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used BOOLEAN DEFAULT false,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE
);

-- Índice para búsqueda rápida por token (candidatos acceden así)
CREATE INDEX IF NOT EXISTS idx_interview_tickets_token ON public.interview_tickets(token);
-- Índice para filtrado por organización
CREATE INDEX IF NOT EXISTS idx_interview_tickets_org_id ON public.interview_tickets(org_id);

-- ─── 2. TABLA: webhook_configs ───
-- Configuración de webhooks por organización
CREATE TABLE IF NOT EXISTS public.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_url TEXT DEFAULT '',
  webhook_secret TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_org_id ON public.webhook_configs(org_id);

-- ─── 3. TABLA: candidate_results ───
-- Resultados completos de entrevistas (mapea 1:1 con CandidateResult del store)
CREATE TABLE IF NOT EXISTS public.candidate_results (
  id TEXT PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT DEFAULT '',
  candidate_phone TEXT DEFAULT '',
  candidate_linkedin TEXT DEFAULT '',
  role_id TEXT NOT NULL,
  role_title TEXT NOT NULL,
  date BIGINT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed')),
  duration INTEGER DEFAULT 0,
  video_url TEXT,
  evaluation JSONB,
  transcript JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_results_org_id ON public.candidate_results(org_id);
CREATE INDEX IF NOT EXISTS idx_candidate_results_role_id ON public.candidate_results(role_id);
CREATE INDEX IF NOT EXISTS idx_candidate_results_status ON public.candidate_results(status);

-- ─── 4. Agregar columna org_id a roles si no existe ───
-- (La tabla roles ya existe con org_id UUID, pero asegurémonos)
-- También agregar índice si no existe
CREATE INDEX IF NOT EXISTS idx_roles_org_id ON public.roles(org_id);

-- ─── 5. Índices para tablas existentes ───
CREATE INDEX IF NOT EXISTS idx_candidates_org_id ON public.candidates(org_id);
CREATE INDEX IF NOT EXISTS idx_interviews_org_id ON public.interviews(org_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id ON public.user_profiles(org_id);

-- ============================================================
-- RLS: interview_tickets
-- ============================================================
ALTER TABLE public.interview_tickets ENABLE ROW LEVEL SECURITY;

-- Los admins de la org pueden ver y crear tickets
CREATE POLICY "org_tickets_select" ON public.interview_tickets
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_tickets_insert" ON public.interview_tickets
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_tickets_update" ON public.interview_tickets
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- Acceso público: cualquier persona puede leer un ticket por su token
-- (necesario para que candidatos sin autenticar puedan verificar su ticket)
CREATE POLICY "public_ticket_by_token" ON public.interview_tickets
  FOR SELECT TO anon USING (true);

-- Acceso anon para marcar ticket como usado (candidatos sin autenticar)
CREATE POLICY "anon_tickets_update" ON public.interview_tickets
  FOR UPDATE TO anon USING (true);

-- ============================================================
-- RLS: webhook_configs
-- ============================================================
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_webhook_select" ON public.webhook_configs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_webhook_insert" ON public.webhook_configs
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_webhook_update" ON public.webhook_configs
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- ============================================================
-- RLS: candidate_results
-- ============================================================
ALTER TABLE public.candidate_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_results_select" ON public.candidate_results
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_results_insert" ON public.candidate_results
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_results_update" ON public.candidate_results
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- Acceso anon para insertar resultados (candidatos sin autenticar envían resultados)
CREATE POLICY "anon_results_insert" ON public.candidate_results
  FOR INSERT TO anon WITH CHECK (true);

-- Acceso anon para actualizar resultados (candidatos completan su entrevista)
CREATE POLICY "anon_results_update" ON public.candidate_results
  FOR UPDATE TO anon USING (true);

-- ============================================================
-- RLS: Actualizar políticas de roles para permitir DELETE
-- ============================================================
DROP POLICY IF EXISTS "org_isolation_roles_delete" ON roles;
CREATE POLICY "org_isolation_roles_delete" ON roles
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- Política de UPDATE explícita para roles (la política existente solo cubre SELECT)
DROP POLICY IF EXISTS "org_isolation_roles_update" ON roles;
CREATE POLICY "org_isolation_roles_update" ON roles
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- Acceso anon para lectura de roles (candidatos necesitan ver los topics del rol)
DROP POLICY IF EXISTS "anon_roles_select" ON roles;
CREATE POLICY "anon_roles_select" ON roles
  FOR SELECT TO anon USING (true);

-- ============================================================
-- Habilitar Realtime para tablas sincronizadas
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidate_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interview_tickets;
