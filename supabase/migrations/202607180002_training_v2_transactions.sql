-- ============================================================
-- RPCs y funciones transaccionales para el Training Center V2
-- ============================================================

BEGIN;

-- 1. CONTRATACIÓN TRANSACCIONAL E IDEMPOTENTE
CREATE OR REPLACE FUNCTION public.hire_training_candidate(
  p_actor_user_id UUID,
  p_candidate_result_id TEXT,
  p_program_id UUID,
  p_access_token_hash TEXT,
  p_access_expires_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program public.training_programs%ROWTYPE;
  v_candidate public.candidate_results%ROWTYPE;
  v_existing_employee_id UUID;
  v_employee_id UUID;
BEGIN
  -- Evita dos contrataciones simultáneas del mismo candidato.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_candidate_result_id, 0)
  );

  SELECT *
  INTO v_program
  FROM public.training_programs
  WHERE id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_program_not_found';
  END IF;

  IF v_program.status <> 'published' THEN
    RAISE EXCEPTION 'training_program_not_published';
  END IF;

  IF v_program.role_id IS NULL THEN
    RAISE EXCEPTION 'training_program_has_no_role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = p_actor_user_id
      AND org_id = v_program.org_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_candidate
  FROM public.candidate_results
  WHERE id = p_candidate_result_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate_result_not_found';
  END IF;

  IF v_candidate.org_id IS DISTINCT FROM v_program.org_id THEN
    RAISE EXCEPTION 'candidate_org_mismatch';
  END IF;

  IF v_candidate.role_id IS DISTINCT FROM v_program.role_id THEN
    RAISE EXCEPTION 'candidate_role_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.training_modules
    WHERE program_id = v_program.id
  ) THEN
    RAISE EXCEPTION 'training_program_has_no_modules';
  END IF;

  SELECT id
  INTO v_existing_employee_id
  FROM public.training_employees
  WHERE candidate_result_id = p_candidate_result_id
  LIMIT 1;

  -- Bloque idempotente:
  IF v_existing_employee_id IS NOT NULL THEN
    UPDATE public.training_employees
    SET
      access_token_hash = p_access_token_hash,
      access_expires_at = p_access_expires_at,
      access_revoked_at = NULL
    WHERE id = v_existing_employee_id;

    UPDATE public.training_access_sessions
    SET revoked_at = now()
    WHERE employee_id = v_existing_employee_id
      AND revoked_at IS NULL;

    RETURN v_existing_employee_id;
  END IF;

  INSERT INTO public.training_employees (
    org_id,
    candidate_result_id,
    role_id,
    program_id,
    token,
    access_token_hash,
    access_expires_at,
    email,
    name,
    role_title,
    status,
    overall_progress,
    interview_data,
    personalization_notes
  )
  VALUES (
    v_program.org_id,
    v_candidate.id,
    v_candidate.role_id,
    v_program.id,
    NULL,
    p_access_token_hash,
    p_access_expires_at,
    v_candidate.candidate_email,
    v_candidate.candidate_name,
    v_candidate.role_title,
    'not_started',
    0,
    jsonb_build_object(
      'evaluation', v_candidate.evaluation,
      'transcript', v_candidate.transcript
    ),
    '{}'::jsonb
  )
  RETURNING id INTO v_employee_id;

  INSERT INTO public.training_progress (
    employee_id,
    module_id,
    status,
    time_spent
  )
  SELECT
    v_employee_id,
    module.id,
    CASE
      WHEN row_number() OVER (
        ORDER BY module.sort_order, module.created_at
      ) = 1
      THEN 'available'
      ELSE 'locked'
    END,
    0
  FROM public.training_modules AS module
  WHERE module.program_id = v_program.id;

  RETURN v_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hire_training_candidate(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hire_training_candidate(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ) TO service_role;


-- 2. PUBLICACIÓN TRANSACCIONAL DE PROGRAMAS
CREATE OR REPLACE FUNCTION public.publish_training_program(
  p_actor_user_id UUID,
  p_program_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program public.training_programs%ROWTYPE;
BEGIN
  SELECT *
  INTO v_program
  FROM public.training_programs
  WHERE id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_program_not_found';
  END IF;

  -- Validar estado: solo drafts pueden publicarse.
  IF v_program.status <> 'draft' THEN
    RAISE EXCEPTION 'only_draft_programs_can_be_published';
  END IF;

  -- Evitar condiciones de carrera concurrentes para el mismo org_id y role_id
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_program.org_id::TEXT
      || ':'
      || COALESCE(v_program.role_id, ''),
      0
    )
  );

  IF v_program.role_id IS NULL THEN
    RAISE EXCEPTION 'training_program_has_no_role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = p_actor_user_id
      AND org_id = v_program.org_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.training_modules
    WHERE program_id = p_program_id
  ) THEN
    RAISE EXCEPTION 'training_program_has_no_modules';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.training_program_documents association
    JOIN public.training_documents document
      ON document.id = association.document_id
    WHERE association.program_id = p_program_id
      AND association.required = true
      AND document.status <> 'ready'
  ) THEN
    RAISE EXCEPTION 'training_program_has_unready_documents';
  END IF;

  -- Archivar la versión publicada anterior.
  UPDATE public.training_programs
  SET
    status = 'archived',
    updated_at = now()
  WHERE org_id = v_program.org_id
    AND role_id = v_program.role_id
    AND status = 'published'
    AND id <> p_program_id;

  UPDATE public.training_programs
  SET
    status = 'published',
    published_at = now(),
    updated_at = now()
  WHERE id = p_program_id;

  RETURN p_program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_training_program(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_training_program(UUID, UUID) TO service_role;


-- 3. CREACIÓN DE NUEVA VERSIÓN DE PROGRAMA
CREATE OR REPLACE FUNCTION public.create_training_program_version(
  p_actor_user_id UUID,
  p_source_program_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.training_programs%ROWTYPE;
  v_new_program_id UUID;
  v_next_version INTEGER;
BEGIN
  SELECT *
  INTO v_source
  FROM public.training_programs
  WHERE id = p_source_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_program_not_found';
  END IF;

  -- Evitar condiciones de carrera concurrentes para el mismo org_id y role_id
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_source.org_id::TEXT
      || ':'
      || COALESCE(v_source.role_id, ''),
      0
    )
  );

  -- Validar estado: solo published o archived pueden versionarse.
  IF v_source.status NOT IN ('published', 'archived') THEN
    RAISE EXCEPTION 'only_published_or_archived_programs_can_be_versioned';
  END IF;

  -- Verificar que no exista ya un draft para esta vacante.
  IF EXISTS (
    SELECT 1
    FROM public.training_programs
    WHERE org_id = v_source.org_id
      AND role_id = v_source.role_id
      AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'draft_version_already_exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = p_actor_user_id
      AND org_id = v_source.org_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM public.training_programs
  WHERE org_id = v_source.org_id
    AND role_id = v_source.role_id;

  INSERT INTO public.training_programs (
    org_id,
    role_id,
    title,
    description,
    is_default,
    welcome_message,
    ai_personality,
    status,
    version,
    passing_score
  )
  VALUES (
    v_source.org_id,
    v_source.role_id,
    v_source.title,
    v_source.description,
    false,
    v_source.welcome_message,
    v_source.ai_personality,
    'draft',
    v_next_version,
    v_source.passing_score
  )
  RETURNING id INTO v_new_program_id;

  INSERT INTO public.training_program_documents (
    program_id,
    document_id,
    sort_order,
    required
  )
  SELECT
    v_new_program_id,
    document_id,
    sort_order,
    required
  FROM public.training_program_documents
  WHERE program_id = p_source_program_id;

  RETURN v_new_program_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_training_program_version(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_training_program_version(UUID, UUID) TO service_role;


-- 4. REEMPLAZO TRANSACCIONAL DE MÓDULOS GENERADOS
CREATE OR REPLACE FUNCTION public.replace_training_modules(
  p_actor_user_id UUID,
  p_program_id UUID,
  p_modules JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program public.training_programs%ROWTYPE;
  v_module JSONB;
  v_source JSONB;
  v_module_id UUID;
  v_result JSONB;
BEGIN
  IF jsonb_typeof(p_modules) <> 'array' THEN
    RAISE EXCEPTION 'modules_must_be_array';
  END IF;

  SELECT *
  INTO v_program
  FROM public.training_programs
  WHERE id = p_program_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_program_not_found';
  END IF;

  IF v_program.status <> 'draft' THEN
    RAISE EXCEPTION 'only_draft_programs_can_replace_modules';
  END IF;

  -- Evitar dos reemplazos simultáneos del mismo programa.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_program_id::TEXT, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = p_actor_user_id
      AND org_id = v_program.org_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.training_progress progress
    JOIN public.training_modules module
      ON module.id = progress.module_id
    WHERE module.program_id = p_program_id
  ) THEN
    RAISE EXCEPTION 'program_modules_are_in_use';
  END IF;

  -- Validar documentos antes de borrar módulos existentes.
  FOR v_module IN
    SELECT value
    FROM jsonb_array_elements(p_modules)
  LOOP
    IF NULLIF(trim(v_module->>'title'), '') IS NULL THEN
      RAISE EXCEPTION 'module_title_required';
    END IF;

    IF jsonb_typeof(
      COALESCE(
        v_module->'sourceDocumentIds',
        '[]'::jsonb
      )
    ) <> 'array' THEN
      RAISE EXCEPTION 'source_document_ids_must_be_array';
    END IF;

    FOR v_source IN
      SELECT value
      FROM jsonb_array_elements(
        COALESCE(
          v_module->'sourceDocumentIds',
          '[]'::jsonb
        )
      )
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.training_program_documents
        WHERE program_id = p_program_id
          AND document_id =
            trim(both '"' from v_source::text)::UUID
      ) THEN
        RAISE EXCEPTION 'unauthorized_source_document';
      END IF;
    END LOOP;
  END LOOP;

  DELETE FROM public.training_modules
  WHERE program_id = p_program_id;

  FOR v_module IN
    SELECT value
    FROM jsonb_array_elements(p_modules)
  LOOP
    v_module_id := COALESCE(
      NULLIF(v_module->>'id', '')::UUID,
      gen_random_uuid()
    );

    INSERT INTO public.training_modules (
      id,
      program_id,
      title,
      description,
      content,
      sort_order,
      duration_estimate,
      evaluation_enabled,
      evaluation_questions
    )
    VALUES (
      v_module_id,
      p_program_id,
      trim(v_module->>'title'),
      NULLIF(trim(v_module->>'description'), ''),
      COALESCE(
        v_module->'content',
        '{"sections":[]}'::jsonb
      ),
      COALESCE(
        (v_module->>'sortOrder')::INTEGER,
        0
      ),
      GREATEST(
        1,
        COALESCE(
          (v_module->>'durationEstimate')::INTEGER,
          30
        )
      ),
      COALESCE(
        (v_module->>'evaluationEnabled')::BOOLEAN,
        true
      ),
      COALESCE(
        v_module->'evaluationQuestions',
        '[]'::jsonb
      )
    );

    FOR v_source IN
      SELECT value
      FROM jsonb_array_elements(
        COALESCE(
          v_module->'sourceDocumentIds',
          '[]'::jsonb
        )
      )
    LOOP
      INSERT INTO public.training_module_documents (
        module_id,
        document_id
      )
      VALUES (
        v_module_id,
        trim(both '"' from v_source::text)::UUID
      );
    END LOOP;
  END LOOP;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', module.id,
        'programId', module.program_id,
        'title', module.title,
        'description', module.description,
        'content', module.content,
        'sortOrder', module.sort_order,
        'durationEstimate', module.duration_estimate,
        'evaluationEnabled', module.evaluation_enabled,
        'evaluationQuestions', module.evaluation_questions,
        'createdAt', module.created_at,
        'updatedAt', module.updated_at,
        'sourceDocumentIds', COALESCE(
          (
            SELECT jsonb_agg(relation.document_id)
            FROM public.training_module_documents relation
            WHERE relation.module_id = module.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY module.sort_order
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.training_modules module
  WHERE module.program_id = p_program_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_training_modules(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_training_modules(UUID, UUID, JSONB) TO service_role;


-- 5. CÁLCULO DE PROGRESO GLOBAL DEL EMPLEADO (FUNCIÓN AUXILIAR)
CREATE OR REPLACE FUNCTION public.calculate_training_progress(
  p_employee_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_completed INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.training_progress
  WHERE employee_id = p_employee_id;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_completed
  FROM public.training_progress
  WHERE employee_id = p_employee_id
    AND status = 'completed';

  RETURN ROUND((v_completed::NUMERIC / v_total::NUMERIC) * 100)::INTEGER;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_training_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_training_progress(UUID) TO service_role;


-- 6. FINALIZACIÓN TRANSACCIONAL DE EVALUACIONES
CREATE OR REPLACE FUNCTION public.finalize_training_evaluation(
  p_employee_id UUID,
  p_module_id UUID,
  p_questions JSONB,
  p_answers JSONB,
  p_score NUMERIC,
  p_feedback TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id UUID;
  v_passing_score INTEGER;
  v_passed BOOLEAN;
  v_attempts INTEGER;
  v_next_module_id UUID;
  v_overall_progress INTEGER;
  v_overall_score NUMERIC;
BEGIN
  IF p_score < 0 OR p_score > 100 THEN
    RAISE EXCEPTION 'invalid_score';
  END IF;

  SELECT module.program_id, program.passing_score
  INTO v_program_id, v_passing_score
  FROM public.training_modules module
  JOIN public.training_programs program
    ON program.id = module.program_id
  WHERE module.id = p_module_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'module_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.training_employees employee
    WHERE employee.id = p_employee_id
      AND employee.program_id = v_program_id
  ) THEN
    RAISE EXCEPTION 'module_not_assigned_to_employee';
  END IF;

  -- Bloquear fila para evitar evaluaciones duplicadas simultáneas.
  PERFORM 1
  FROM public.training_progress
  WHERE employee_id = p_employee_id
    AND module_id = p_module_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_progress_not_found';
  END IF;

  -- Validar que el módulo requiere evaluación.
  IF NOT EXISTS (
    SELECT 1
    FROM public.training_modules
    WHERE id = p_module_id
      AND evaluation_enabled = true
  ) THEN
    RAISE EXCEPTION 'module_does_not_require_evaluation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.training_progress
    WHERE employee_id = p_employee_id
      AND module_id = p_module_id
      AND status IN ('available', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'module_not_available_for_evaluation';
  END IF;

  v_passed := p_score >= v_passing_score;

  SELECT COALESCE(MAX(attempts), 0) + 1
  INTO v_attempts
  FROM public.training_evaluations
  WHERE employee_id = p_employee_id
    AND module_id = p_module_id;

  INSERT INTO public.training_evaluations (
    employee_id,
    module_id,
    questions,
    answers,
    score,
    passed,
    attempts,
    evaluated_at
  )
  VALUES (
    p_employee_id,
    p_module_id,
    p_questions,
    p_answers,
    p_score,
    v_passed,
    v_attempts,
    now()
  );

  UPDATE public.training_progress
  SET
    status = CASE
      WHEN v_passed THEN 'completed'
      ELSE 'in_progress'
    END,
    score = p_score,
    ai_feedback = p_feedback,
    completed_at = CASE
      WHEN v_passed THEN now()
      ELSE NULL
    END
  WHERE employee_id = p_employee_id
    AND module_id = p_module_id;

  IF v_passed THEN
    SELECT next_module.id
    INTO v_next_module_id
    FROM public.training_modules current_module
    JOIN public.training_modules next_module
      ON next_module.program_id = current_module.program_id
     AND (
       next_module.sort_order > current_module.sort_order
       OR (
         next_module.sort_order = current_module.sort_order
         AND next_module.created_at > current_module.created_at
       )
     )
    WHERE current_module.id = p_module_id
    ORDER BY
      next_module.sort_order,
      next_module.created_at
    LIMIT 1;

    IF v_next_module_id IS NOT NULL THEN
      UPDATE public.training_progress
      SET status = 'available'
      WHERE employee_id = p_employee_id
        AND module_id = v_next_module_id
        AND status = 'locked';
    END IF;
  END IF;

  SELECT public.calculate_training_progress(p_employee_id)
  INTO v_overall_progress;

  SELECT ROUND(AVG(score), 2)
  INTO v_overall_score
  FROM public.training_progress
  WHERE employee_id = p_employee_id
    AND score IS NOT NULL;

  UPDATE public.training_employees
  SET
    overall_progress = v_overall_progress,
    overall_score = v_overall_score,
    status = CASE
      WHEN v_overall_progress = 100 THEN 'completed'
      ELSE 'active'
    END,
    completed_at = CASE
      WHEN v_overall_progress = 100 THEN now()
      ELSE NULL
    END
  WHERE id = p_employee_id;

  RETURN jsonb_build_object(
    'score', p_score,
    'passed', v_passed,
    'passingScore', v_passing_score,
    'attempts', v_attempts,
    'overallProgress', v_overall_progress,
    'overallScore', v_overall_score
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_training_evaluation(UUID, UUID, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_training_evaluation(UUID, UUID, JSONB, JSONB, NUMERIC, TEXT) TO service_role;


-- 7. COMPLETAR MÓDULO SIN EVALUACIÓN
CREATE OR REPLACE FUNCTION public.complete_training_module_without_evaluation(
  p_employee_id UUID,
  p_module_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id UUID;
  v_next_module_id UUID;
  v_progress INTEGER;
BEGIN
  SELECT program_id
  INTO v_program_id
  FROM public.training_modules
  WHERE id = p_module_id
    AND evaluation_enabled = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'module_requires_evaluation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.training_employees
    WHERE id = p_employee_id
      AND program_id = v_program_id
  ) THEN
    RAISE EXCEPTION 'module_not_assigned';
  END IF;

  UPDATE public.training_progress
  SET
    status = 'completed',
    completed_at = now()
  WHERE employee_id = p_employee_id
    AND module_id = p_module_id
    AND status IN ('available', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'module_not_available';
  END IF;

  SELECT next_module.id
  INTO v_next_module_id
  FROM public.training_modules current_module
  JOIN public.training_modules next_module
    ON next_module.program_id = current_module.program_id
   AND (
     next_module.sort_order > current_module.sort_order
     OR (
       next_module.sort_order = current_module.sort_order
       AND next_module.created_at > current_module.created_at
     )
   )
  WHERE current_module.id = p_module_id
  ORDER BY
    next_module.sort_order,
    next_module.created_at
  LIMIT 1;

  IF v_next_module_id IS NOT NULL THEN
    UPDATE public.training_progress
    SET status = 'available'
    WHERE employee_id = p_employee_id
      AND module_id = v_next_module_id
      AND status = 'locked';
  END IF;

  SELECT public.calculate_training_progress(p_employee_id)
  INTO v_progress;

  UPDATE public.training_employees
  SET
    overall_progress = v_progress,
    status = CASE
      WHEN v_progress = 100 THEN 'completed'
      ELSE 'active'
    END,
    completed_at = CASE
      WHEN v_progress = 100 THEN now()
      ELSE NULL
    END
  WHERE id = p_employee_id;

  RETURN jsonb_build_object(
    'completed', true,
    'overallProgress', v_progress,
    'nextModuleId', v_next_module_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_training_module_without_evaluation(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_training_module_without_evaluation(UUID, UUID) TO service_role;


-- 8. INCREMENTO ATÓMICO DEL TIEMPO DE PROGRESO
CREATE OR REPLACE FUNCTION public.increment_training_time(
  p_employee_id UUID,
  p_module_id UUID,
  p_minutes_delta INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_time_spent INTEGER;
BEGIN
  IF p_minutes_delta < 1 OR p_minutes_delta > 60 THEN
    RAISE EXCEPTION 'invalid_time_delta';
  END IF;

  UPDATE public.training_progress progress
  SET time_spent = COALESCE(progress.time_spent, 0) + p_minutes_delta
  WHERE progress.employee_id = p_employee_id
    AND progress.module_id = p_module_id
    AND progress.status IN ('available', 'in_progress')
  RETURNING time_spent INTO v_time_spent;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'training_progress_not_available';
  END IF;

  RETURN v_time_spent;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_training_time(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_training_time(UUID, UUID, INTEGER) TO service_role;

-- 9. PERSISTENCIA ATÓMICA DE MENSAJES DE CHAT
CREATE OR REPLACE FUNCTION public.append_training_session_messages(
  p_employee_id UUID,
  p_session_id UUID,
  p_messages JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_messages JSONB;
  v_result JSONB;
BEGIN
  IF jsonb_typeof(p_messages) <> 'array' THEN
    RAISE EXCEPTION 'messages_must_be_array';
  END IF;

  IF jsonb_array_length(p_messages) < 1
     OR jsonb_array_length(p_messages) > 2 THEN
    RAISE EXCEPTION 'invalid_message_batch_size';
  END IF;

  SELECT COALESCE(messages, '[]'::jsonb)
  INTO v_current_messages
  FROM public.training_sessions
  WHERE id = p_session_id
    AND employee_id = p_employee_id
    AND ended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_session_not_found';
  END IF;

  IF jsonb_array_length(v_current_messages) +
     jsonb_array_length(p_messages) > 200 THEN
    RAISE EXCEPTION 'training_session_message_limit_reached';
  END IF;

  v_result := v_current_messages || p_messages;

  UPDATE public.training_sessions
  SET messages = v_result
  WHERE id = p_session_id;

  RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.append_training_session_messages(UUID, UUID, JSONB)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.append_training_session_messages(UUID, UUID, JSONB)
TO service_role;


-- 10. CREACIÓN TRANSACCIONAL DE PROGRAMAS DE ENTRENAMIENTO
CREATE OR REPLACE FUNCTION public.create_training_program(
  p_actor_user_id UUID,
  p_role_id TEXT,
  p_title TEXT,
  p_description TEXT,
  p_welcome_message TEXT,
  p_ai_personality TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_program_id UUID;
  v_version INTEGER;
BEGIN
  SELECT org_id
  INTO v_org_id
  FROM public.roles
  WHERE id = p_role_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE user_id = p_actor_user_id
      AND org_id = v_org_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_org_id::TEXT || ':' || p_role_id,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.training_programs
    WHERE org_id = v_org_id
      AND role_id = p_role_id
      AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'draft_version_already_exists';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.training_programs
  WHERE org_id = v_org_id
    AND role_id = p_role_id;

  INSERT INTO public.training_programs (
    org_id,
    role_id,
    title,
    description,
    is_default,
    welcome_message,
    ai_personality,
    status,
    version,
    passing_score
  )
  VALUES (
    v_org_id,
    p_role_id,
    p_title,
    p_description,
    false,
    p_welcome_message,
    p_ai_personality,
    'draft',
    v_version,
    70
  )
  RETURNING id INTO v_program_id;

  RETURN v_program_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_training_program(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_training_program(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
TO service_role;

COMMIT;
