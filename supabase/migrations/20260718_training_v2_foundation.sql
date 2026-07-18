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
  ADD COLUMN IF NOT EXISTS role_id TEXT
    REFERENCES public.roles(id) ON DELETE RESTRICT;

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS passing_score INTEGER NOT NULL DEFAULT 70;

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.training_programs
  DROP CONSTRAINT IF EXISTS training_programs_status_check;

ALTER TABLE public.training_programs
  ADD CONSTRAINT training_programs_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE public.training_programs
  DROP CONSTRAINT IF EXISTS training_programs_version_check;

ALTER TABLE public.training_programs
  ADD CONSTRAINT training_programs_version_check
  CHECK (version >= 1);

ALTER TABLE public.training_programs
  DROP CONSTRAINT IF EXISTS training_programs_passing_score_check;

ALTER TABLE public.training_programs
  ADD CONSTRAINT training_programs_passing_score_check
  CHECK (passing_score BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_training_programs_role
  ON public.training_programs(role_id);

CREATE INDEX IF NOT EXISTS idx_training_programs_org_role
  ON public.training_programs(org_id, role_id);

-- Solo puede existir una versión publicada por vacante y organización.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_published_training_program_per_role
  ON public.training_programs(org_id, role_id)
  WHERE status = 'published' AND role_id IS NOT NULL;


-- ============================================================
-- 2. DOCUMENTOS PERSISTENTES
-- ============================================================

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS role_id TEXT
    REFERENCES public.roles(id) ON DELETE RESTRICT;

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'uploaded';

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS processing_error TEXT;

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;

ALTER TABLE public.training_documents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.training_documents
  DROP CONSTRAINT IF EXISTS training_documents_status_check;

ALTER TABLE public.training_documents
  ADD CONSTRAINT training_documents_status_check
  CHECK (
    status IN (
      'uploaded',
      'processing',
      'ready',
      'failed',
      'needs_ocr'
    )
  );

-- file_url era obligatorio, pero ahora los archivos serán privados.
-- storage_path será la referencia real.
ALTER TABLE public.training_documents
  ALTER COLUMN file_url DROP NOT NULL;

-- Completar role_id para documentos existentes cuando el programa ya lo tenga.
UPDATE public.training_documents AS document
SET role_id = program.role_id
FROM public.training_programs AS program
WHERE document.program_id = program.id
  AND document.role_id IS NULL
  AND program.role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_documents_role
  ON public.training_documents(role_id);

CREATE INDEX IF NOT EXISTS idx_training_documents_status
  ON public.training_documents(status);

CREATE INDEX IF NOT EXISTS idx_training_documents_checksum
  ON public.training_documents(org_id, checksum_sha256);


-- ============================================================
-- 3. CHUNKS DE DOCUMENTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL
    REFERENCES public.training_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_training_document_chunks_document
  ON public.training_document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_training_document_chunks_search
  ON public.training_document_chunks
  USING GIN (to_tsvector('simple', content));

ALTER TABLE public.training_document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can manage training document chunks"
  ON public.training_document_chunks;

CREATE POLICY "Org members can manage training document chunks"
  ON public.training_document_chunks
  FOR ALL
  TO authenticated
  USING (
    document_id IN (
      SELECT document.id
      FROM public.training_documents AS document
      WHERE document.org_id IN (
        SELECT membership.org_id
        FROM public.org_members AS membership
        WHERE membership.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT document.id
      FROM public.training_documents AS document
      WHERE document.org_id IN (
        SELECT membership.org_id
        FROM public.org_members AS membership
        WHERE membership.user_id = auth.uid()
      )
    )
  );


-- ============================================================
-- 4. VACANTE Y CONTROL DE ACCESO DEL EMPLEADO
-- ============================================================

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS role_id TEXT
    REFERENCES public.roles(id) ON DELETE RESTRICT;

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;

ALTER TABLE public.training_employees
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;

UPDATE public.training_employees AS employee
SET role_id = program.role_id
FROM public.training_programs AS program
WHERE employee.program_id = program.id
  AND employee.role_id IS NULL
  AND program.role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_employees_role
  ON public.training_employees(role_id);


-- ============================================================
-- 5. BUCKET PRIVADO DE DOCUMENTOS
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


-- ============================================================
-- 6. STORAGE RLS
-- La primera carpeta de cada objeto debe ser el org_id.
-- Formato:
-- {orgId}/{roleId}/{documentId}/{fileName}
-- ============================================================

DROP POLICY IF EXISTS "Org members can read training documents"
  ON storage.objects;

CREATE POLICY "Org members can read training documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'training-documents'
    AND EXISTS (
      SELECT 1
      FROM public.org_members AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "Org members can upload training documents"
  ON storage.objects;

CREATE POLICY "Org members can upload training documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'training-documents'
    AND EXISTS (
      SELECT 1
      FROM public.org_members AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "Org members can update training documents"
  ON storage.objects;

CREATE POLICY "Org members can update training documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'training-documents'
    AND EXISTS (
      SELECT 1
      FROM public.org_members AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id::text = split_part(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'training-documents'
    AND EXISTS (
      SELECT 1
      FROM public.org_members AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS "Org members can delete training documents"
  ON storage.objects;

CREATE POLICY "Org members can delete training documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'training-documents'
    AND EXISTS (
      SELECT 1
      FROM public.org_members AS membership
      WHERE membership.user_id = auth.uid()
        AND membership.org_id::text = split_part(name, '/', 1)
    )
  );


-- ============================================================
-- 7. updated_at AUTOMÁTICO
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

COMMIT;
