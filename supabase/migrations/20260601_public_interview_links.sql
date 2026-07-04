-- ============================================================
-- Migración: Enlaces públicos de entrevista (General Link)
-- Permite compartir un enlace general por vacante para que
-- múltiples candidatos puedan tomar la entrevista de forma
-- independiente ingresando nombre y correo.
-- ============================================================

-- ─── 1. Agregar public_token a roles ───
-- Token único que permite acceso público a la entrevista sin ticket individual
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE;

-- Índice para búsqueda rápida por public_token
CREATE INDEX IF NOT EXISTS idx_roles_public_token ON public.roles(public_token);

-- ─── 2. Agregar source a candidate_results ───
-- Rastrear si el candidato vino por enlace general o ticket individual
ALTER TABLE public.candidate_results ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ticket' CHECK (source IN ('ticket', 'public_link'));

-- Índice para filtrar por fuente
CREATE INDEX IF NOT EXISTS idx_candidate_results_source ON public.candidate_results(source);

-- ─── 3. Política RLS para acceso público por token ───
-- Permitir que usuarios anónimos puedan leer roles por public_token
CREATE POLICY "public_role_by_token" ON public.roles
  FOR SELECT
  TO anon
  USING (public_token IS NOT NULL AND public_token != '');

-- ─── 4. Política para que anónimos puedan insertar resultados ───
-- (los candidatos del enlace público no tienen autenticación)
CREATE POLICY "anon_insert_candidate_results" ON public.candidate_results
  FOR INSERT
  TO anon
  WITH CHECK (source = 'public_link');

-- ─── 5. Política para que anónimos puedan actualizar sus propios resultados ───
CREATE POLICY "anon_update_own_results" ON public.candidate_results
  FOR UPDATE
  TO anon
  USING (source = 'public_link')
  WITH CHECK (source = 'public_link');
