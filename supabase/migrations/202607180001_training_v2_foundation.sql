-- ============================================================
-- Training Center V2
-- Base para programas por vacante, documentos persistentes
-- y acceso público mediante endpoints server-side.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PROGRAMAS VINCULADOS A VACANTES
-- ============================================================

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS role_id TEXT;

ALTER TABLE public.training_programs
  DROP CONSTRAINT IF EXISTS training_programs_role_id_fkey;

ALTER TABLE public.training_programs
  ADD CONSTRAINT training_programs_role_id_fkey
  FOREIGN KEY (role_id)
  REFERENCES public.roles(id)
  ON DELETE RESTRICT;

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS passing_score INTEGER NOT NULL DEFAULT 70;

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Migrar y vincular programas existentes a un rol si es posible
UPDATE public.training_programs AS program
SET role_id = (
  SELECT id FROM public.roles LIMIT 1
)
WHERE program.role_id IS NULL;

-- Asegurar que al menos tengamos una versión coherente en los existentes
UPDATE public.training_programs
SET version = 1
WHERE version IS NULL OR version < 1;

CREATE INDEX IF NOT EXISTS idx_training_programs_role
  ON public.training_programs(role_id);

CREATE INDEX IF NOT EXISTS idx_training_programs_status
  ON public.training_programs(status);


-- ============================================================
-- 2. DOCUMENTOS ASOCIADOS Y SCOPES
-- ============================================================

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'role';

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS processing_error TEXT;

ALTER TABLE public.training_documents
  ALTER COLUMN program_id DROP NOT NULL;

-- Backfill de scope y role_id en documentos preexistentes antes de inyectar el constraint
UPDATE public.training_documents AS doc
SET
  scope = 'role',
  role_id = program.role_id
FROM public.training_programs AS program
WHERE doc.program_id = program.id
  AND doc.role_id IS NULL
  AND program.role_id IS NOT NULL;

-- Para documentos que aún no tienen org_id
UPDATE public.training_documents AS doc
SET org_id = program.org_id
FROM public.training_programs AS program
WHERE doc.program_id = program.id
  AND doc.org_id IS NULL;

-- Si queda alguno suelto, asignar organization scope por defecto
UPDATE public.training_documents
SET scope = 'organization'
WHERE scope IS NULL;

ALTER TABLE public.training_documents
  DROP CONSTRAINT IF EXISTS training_documents_scope_role_check;

ALTER TABLE public.training_documents
  ADD CONSTRAINT training_documents_scope_role_check
  CHECK (
    (
      scope = 'organization'
      AND role_id IS NULL
    )
    OR
    (
      scope = 'role'
      AND role_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_training_documents_org_scope
  ON public.training_documents(org_id, scope);

CREATE INDEX IF NOT EXISTS idx_training_documents_role
  ON public.training_documents(role_id);

CREATE INDEX IF NOT EXISTS idx_training_documents_status
  ON public.training_documents(status);

CREATE INDEX IF NOT EXISTS idx_training_documents_checksum
  ON public.training_documents(org_id, checksum_sha256);

-- Índices únicos para deduplicación condicional por scope
CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_org_document_checksum
  ON public.training_documents (org_id, checksum_sha256)
  WHERE scope = 'organization' AND checksum_sha256 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_role_document_checksum
  ON public.training_documents (org_id, role_id, checksum_sha256)
  WHERE scope = 'role' AND role_id IS NOT NULL AND checksum_sha256 IS NOT NULL;


-- ============================================================
-- 3. CREAR TABLA INTERMEDIA PROGRAMA-DOCUMENTO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_program_documents (
  program_id UUID NOT NULL
    REFERENCES public.training_programs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL
    REFERENCES public.training_documents(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_training_program_documents_document
  ON public.training_program_documents(document_id);

INSERT INTO public.training_program_documents (
  program_id,
  document_id,
  sort_order,
  required
)
SELECT
  program_id,
  id,
  sort_order,
  true
FROM public.training_documents
WHERE program_id IS NOT NULL
ON CONFLICT (program_id, document_id) DO NOTHING;


-- ============================================================
-- 4. CREAR FUENTES DE MÓDULOS (RELACIÓN MÓDULO-DOCUMENTO)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_module_documents (
  module_id UUID NOT NULL
    REFERENCES public.training_modules(id) ON DELETE CASCADE,
  document_id UUID NOT NULL
    REFERENCES public.training_documents(id) ON DELETE RESTRICT,
  PRIMARY KEY (module_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_training_module_documents_document
  ON public.training_module_documents(document_id);


-- ============================================================
-- 5. CHUNKS DE DOCUMENTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL
    REFERENCES public.training_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_training_document_chunks_document
  ON public.training_document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_training_document_chunks_search
  ON public.training_document_chunks
  USING GIN (to_tsvector('simple', content));


-- ============================================================
-- 6. CORREGIR EMPLEADO Y TOKEN
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS role_id TEXT;

ALTER TABLE public.training_employees
  DROP CONSTRAINT IF EXISTS training_employees_role_id_fkey;

ALTER TABLE public.training_employees
  ADD CONSTRAINT training_employees_role_id_fkey
  FOREIGN KEY (role_id)
  REFERENCES public.roles(id)
  ON DELETE RESTRICT;

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS access_token_hash TEXT;

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;

ALTER TABLE public.training_employees
  ALTER COLUMN token DROP NOT NULL;

-- Backfill de role_id para empleados existentes
UPDATE public.training_employees AS employee
SET role_id = program.role_id
FROM public.training_programs AS program
WHERE employee.program_id = program.id
  AND employee.role_id IS NULL
  AND program.role_id IS NOT NULL;

-- Compatibilidad con enlaces ya emitidos.
UPDATE public.training_employees
SET access_token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token IS NOT NULL
  AND access_token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_employee_access_token_hash
  ON public.training_employees(access_token_hash)
  WHERE access_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_employees_role
  ON public.training_employees(role_id);

-- Comprobación explícita previa a la creación del índice de contratación única
DO $$
BEGIN
  IF EXISTS (
    SELECT candidate_result_id
    FROM public.training_employees
    WHERE candidate_result_id IS NOT NULL
    GROUP BY candidate_result_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate training employees exist for candidate_result_id';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_employee_candidate_result
  ON public.training_employees(candidate_result_id)
  WHERE candidate_result_id IS NOT NULL;


-- ============================================================
-- 7. CREAR SESIONES TEMPORALES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL
    REFERENCES public.training_employees(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_access_sessions_employee
  ON public.training_access_sessions(employee_id);

CREATE INDEX IF NOT EXISTS idx_training_access_sessions_expiration
  ON public.training_access_sessions(expires_at);


-- ============================================================
-- 8. CERRAR ACCESO DIRECTO A TABLAS AUXILIARES (SEGURIDAD)
-- ============================================================

ALTER TABLE public.training_program_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_module_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_access_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.training_program_documents FROM anon, authenticated;
REVOKE ALL ON TABLE public.training_module_documents FROM anon, authenticated;
REVOKE ALL ON TABLE public.training_document_chunks FROM anon, authenticated;
REVOKE ALL ON TABLE public.training_access_sessions FROM anon, authenticated;


-- ============================================================
-- 9. BUCKET PRIVADO DE STORAGE Y RLS
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'training-documents',
  'training-documents',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Eliminar políticas de Storage de acceso directo para authenticated
DROP POLICY IF EXISTS "Org members can read training documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload training documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update training documents" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete training documents" ON storage.objects;


-- ============================================================
-- 10. TRIGGERS UPDATED_AT
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_training_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_training_programs_updated_at
  ON public.training_programs;

CREATE TRIGGER set_training_programs_updated_at
BEFORE UPDATE ON public.training_programs
FOR EACH ROW
EXECUTE FUNCTION public.set_training_updated_at();

DROP TRIGGER IF EXISTS set_training_documents_updated_at
  ON public.training_documents;

CREATE TRIGGER set_training_documents_updated_at
BEFORE UPDATE ON public.training_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_training_updated_at();


-- ============================================================
-- CERRAR ACCESO DIRECTO A TODAS LAS ESCRITURAS DE TRAINING
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_training_admin(
  p_org_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL
ON FUNCTION public.is_training_admin(UUID)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.is_training_admin(UUID)
TO authenticated, service_role;


-- Eliminar políticas antiguas permisivas.
DROP POLICY IF EXISTS
  "Org members can manage training programs"
ON public.training_programs;

DROP POLICY IF EXISTS
  "Org members can manage training documents"
ON public.training_documents;

DROP POLICY IF EXISTS
  "Org members can manage training modules"
ON public.training_modules;

DROP POLICY IF EXISTS
  "Org members can view training employees"
ON public.training_employees;

DROP POLICY IF EXISTS
  "Org members can insert training employees"
ON public.training_employees;

DROP POLICY IF EXISTS
  "Org members or employee can update"
ON public.training_employees;

DROP POLICY IF EXISTS
  "Access training progress"
ON public.training_progress;

DROP POLICY IF EXISTS
  "Access training evaluations"
ON public.training_evaluations;

DROP POLICY IF EXISTS
  "Access training sessions"
ON public.training_sessions;


-- El navegador autenticado puede leer solamente si es admin/owner.
CREATE POLICY "Training admins can read programs"
ON public.training_programs
FOR SELECT
TO authenticated
USING (
  public.is_training_admin(org_id)
);

CREATE POLICY "Training admins can read documents"
ON public.training_documents
FOR SELECT
TO authenticated
USING (
  public.is_training_admin(org_id)
);

CREATE POLICY "Training admins can read modules"
ON public.training_modules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.training_programs program
    WHERE program.id = training_modules.program_id
      AND public.is_training_admin(program.org_id)
  )
);

CREATE POLICY "Training admins can read employees"
ON public.training_employees
FOR SELECT
TO authenticated
USING (
  public.is_training_admin(org_id)
);

CREATE POLICY "Training admins can read progress"
ON public.training_progress
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.training_employees employee
    WHERE employee.id = training_progress.employee_id
      AND public.is_training_admin(employee.org_id)
  )
);

CREATE POLICY "Training admins can read evaluations"
ON public.training_evaluations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.training_employees employee
    WHERE employee.id = training_evaluations.employee_id
      AND public.is_training_admin(employee.org_id)
  )
);

CREATE POLICY "Training admins can read sessions"
ON public.training_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.training_employees employee
    WHERE employee.id = training_sessions.employee_id
      AND public.is_training_admin(employee.org_id)
  )
);


-- Todas las escrituras deben pasar por APIs server-side.
REVOKE INSERT, UPDATE, DELETE
ON public.training_programs
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.training_documents
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.training_modules
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.training_employees
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.training_progress
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.training_evaluations
FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.training_sessions
FROM anon, authenticated;


-- ============================================================
-- 11. CONCURRENCIA DE SESIONES ACTIVAS
-- ============================================================

WITH ranked_sessions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        employee_id,
        module_id,
        session_type
      ORDER BY started_at DESC, id DESC
    ) AS row_number
  FROM public.training_sessions
  WHERE ended_at IS NULL
)
UPDATE public.training_sessions session
SET ended_at = now()
FROM ranked_sessions ranked
WHERE session.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_training_module_session
ON public.training_sessions (
  employee_id,
  module_id,
  session_type
)
WHERE
  ended_at IS NULL
  AND module_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_training_general_session
ON public.training_sessions (
  employee_id,
  session_type
)
WHERE
  ended_at IS NULL
  AND module_id IS NULL;


-- ============================================================
-- 12. CONCURRENCIA DE VERSIONES
-- ============================================================

WITH ranked_programs AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY org_id, role_id
      ORDER BY created_at, id
    ) AS assigned_version
  FROM public.training_programs
  WHERE role_id IS NOT NULL
)
UPDATE public.training_programs program
SET version = ranked.assigned_version
FROM ranked_programs ranked
WHERE program.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_program_version
ON public.training_programs (
  org_id,
  role_id,
  version
)
WHERE role_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_training_program_draft
ON public.training_programs (
  org_id,
  role_id
)
WHERE
  role_id IS NOT NULL
  AND status = 'draft';

COMMIT;
