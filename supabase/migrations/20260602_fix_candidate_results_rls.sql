-- ============================================================
-- Migración: Reafirmar políticas RLS de candidate_results
-- ============================================================
-- Contexto: en producción se observaron errores 401 / 42501
-- ("new row violates row-level security policy for table
-- candidate_results") al insertar/actualizar resultados de
-- entrevista desde el navegador del candidato (rol `anon`).
--
-- El fix principal ahora es arquitectónico: el frontend ya NO
-- escribe candidate_results directo con la anon key — pasa por
-- /api/candidate-results, que usa la SERVICE ROLE KEY en el
-- servidor y por lo tanto no depende de RLS en absoluto.
--
-- Esta migración es una red de seguridad adicional: garantiza,
-- de forma idempotente, que las políticas de `anon`/`authenticated`
-- para candidate_results existan y sean consistentes, por si algún
-- código legado o futuro vuelve a escribir directo desde el cliente.
-- Es seguro ejecutar esta migración múltiples veces.
-- ============================================================

ALTER TABLE public.candidate_results ENABLE ROW LEVEL SECURITY;

-- Aseguramos que la columna "source" exista (idempotente; ya se agrega
-- en 20260601_public_interview_links.sql, pero por si esta migración se
-- corre en una base que no tuvo esa migración aplicada).
ALTER TABLE public.candidate_results
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ticket' CHECK (source IN ('ticket', 'public_link'));

-- ─── Limpieza: eliminar políticas previas (posiblemente inconsistentes) ───
DROP POLICY IF EXISTS "org_results_select" ON public.candidate_results;
DROP POLICY IF EXISTS "org_results_insert" ON public.candidate_results;
DROP POLICY IF EXISTS "org_results_update" ON public.candidate_results;
DROP POLICY IF EXISTS "anon_results_insert" ON public.candidate_results;
DROP POLICY IF EXISTS "anon_results_update" ON public.candidate_results;
DROP POLICY IF EXISTS "anon_insert_candidate_results" ON public.candidate_results;
DROP POLICY IF EXISTS "anon_update_own_results" ON public.candidate_results;

-- ─── SELECT: solo miembros de la organización dueña del resultado ───
CREATE POLICY "org_results_select" ON public.candidate_results
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- ─── INSERT/UPDATE autenticado: miembros de la organización ───
CREATE POLICY "org_results_insert" ON public.candidate_results
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "org_results_update" ON public.candidate_results
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- ─── INSERT/UPDATE anónimo: candidatos sin sesión (ticket o enlace público) ───
-- Nota: la vía principal para estas escrituras es /api/candidate-results
-- (service role). Esta política es solo una red de seguridad de respaldo.
CREATE POLICY "anon_results_insert" ON public.candidate_results
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon_results_update" ON public.candidate_results
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Índice usado por el filtro de origen (si no existe ya)
CREATE INDEX IF NOT EXISTS idx_candidate_results_source ON public.candidate_results(source);
