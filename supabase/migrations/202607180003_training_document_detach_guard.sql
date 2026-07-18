-- Nueva migración SQL para proteger la desasociación de documentos
-- supabase/migrations/202607180003_training_document_detach_guard.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.detach_training_program_document(
  p_actor_user_id UUID,
  p_program_id UUID,
  p_document_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_status TEXT;
BEGIN
  -- Cargar y bloquear el programa
  SELECT org_id, status
  INTO v_org_id, v_status
  FROM public.training_programs
  WHERE id = p_program_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_program_not_found';
  END IF;

  -- Verificar que el programa esté en draft
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'only_draft_programs_can_be_modified';
  END IF;

  -- Verificar membresía del actor
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = p_actor_user_id
      AND org_id = v_org_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Comprobar si algún módulo de este programa todavía utiliza el documento
  IF EXISTS (
    SELECT 1
    FROM public.training_modules m
    JOIN public.training_module_documents md
      ON m.id = md.module_id
    WHERE m.program_id = p_program_id
      AND md.document_id = p_document_id
  ) THEN
    RAISE EXCEPTION 'training_document_in_use';
  END IF;

  -- Eliminar la asociación
  DELETE FROM public.training_program_documents
  WHERE program_id = p_program_id
    AND document_id = p_document_id;

END;
$$;

REVOKE ALL
ON FUNCTION public.detach_training_program_document(UUID, UUID, UUID)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.detach_training_program_document(UUID, UUID, UUID)
TO service_role;

COMMIT;
