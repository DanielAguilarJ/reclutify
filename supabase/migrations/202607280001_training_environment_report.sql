-- ============================================================
-- Training Center V2 — Reporte de entorno
-- Introspección tolerante del esquema de capacitación:
-- tablas, nulabilidad de columnas, columnas presentes,
-- funciones, bucket de storage e índices.
--
-- La función nunca lanza excepción: cuando un elemento no
-- existe devuelve false, para poder diagnosticar una base
-- de datos a la que aún le faltan migraciones.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. FUNCIÓN DE REPORTE
-- ============================================================

CREATE OR REPLACE FUNCTION public.training_environment_report()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Tablas que el flujo de capacitación necesita.
  c_tables CONSTANT TEXT[] := ARRAY[
    'training_programs',
    'training_documents',
    'training_modules',
    'training_employees',
    'training_progress',
    'training_evaluations',
    'training_sessions',
    'training_program_documents',
    'training_module_documents',
    'training_document_chunks',
    'training_access_sessions'
  ];

  -- Columnas que DEBEN admitir NULL tras 202607180001.
  c_nullable_columns CONSTANT TEXT[] := ARRAY[
    'training_documents.program_id',
    'training_documents.file_url',
    'training_employees.token'
  ];

  -- Columnas cuya simple presencia se verifica.
  c_present_columns CONSTANT TEXT[] := ARRAY[
    'training_employees.user_id'
  ];

  -- Funciones de Postgres de las que dependen las rutas de API.
  c_functions CONSTANT TEXT[] := ARRAY[
    'is_training_admin',
    'calculate_training_progress',
    'hire_training_candidate',
    'publish_training_program',
    'create_training_program',
    'create_training_program_version',
    'replace_training_modules',
    'finalize_training_evaluation',
    'complete_training_module_without_evaluation',
    'increment_training_time',
    'append_training_session_messages',
    'detach_training_program_document',
    'start_training_module'
  ];

  -- Índices relevantes para las reglas de publicación.
  c_indexes CONSTANT TEXT[] := ARRAY[
    'uniq_published_training_program_per_role'
  ];

  c_bucket_id CONSTANT TEXT := 'training-documents';

  v_tables JSONB := '{}'::JSONB;
  v_nullable_columns JSONB := '{}'::JSONB;
  v_columns JSONB := '{}'::JSONB;
  v_functions JSONB := '{}'::JSONB;
  v_buckets JSONB := '{}'::JSONB;
  v_indexes JSONB := '{}'::JSONB;

  v_bucket JSONB;
  v_has_bucket_table BOOLEAN := false;

  v_name TEXT;
  v_table TEXT;
  v_column TEXT;
  v_flag BOOLEAN;
BEGIN
  -- ----------------------------------------------------------
  -- Tablas
  -- ----------------------------------------------------------
  FOREACH v_name IN ARRAY c_tables LOOP
    v_tables := v_tables || jsonb_build_object(
      v_name,
      EXISTS (
        SELECT 1
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name = v_name
      )
    );
  END LOOP;

  -- ----------------------------------------------------------
  -- Nulabilidad de columnas
  -- true  = la columna existe y admite NULL
  -- false = la columna no existe o es NOT NULL
  -- ----------------------------------------------------------
  FOREACH v_name IN ARRAY c_nullable_columns LOOP
    v_table := split_part(v_name, '.', 1);
    v_column := split_part(v_name, '.', 2);

    SELECT COALESCE(
      (
        SELECT c.is_nullable = 'YES'
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = v_table
          AND c.column_name = v_column
      ),
      false
    )
    INTO v_flag;

    v_nullable_columns := v_nullable_columns || jsonb_build_object(
      v_name,
      v_flag
    );
  END LOOP;

  -- ----------------------------------------------------------
  -- Presencia de columnas
  -- ----------------------------------------------------------
  FOREACH v_name IN ARRAY c_present_columns LOOP
    v_table := split_part(v_name, '.', 1);
    v_column := split_part(v_name, '.', 2);

    v_columns := v_columns || jsonb_build_object(
      v_name,
      EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = v_table
          AND c.column_name = v_column
      )
    );
  END LOOP;

  -- ----------------------------------------------------------
  -- Funciones
  -- ----------------------------------------------------------
  FOREACH v_name IN ARRAY c_functions LOOP
    v_functions := v_functions || jsonb_build_object(
      v_name,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n
          ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = v_name
      )
    );
  END LOOP;

  -- ----------------------------------------------------------
  -- Bucket de storage
  -- Consulta dinámica: en una base sin la extensión de
  -- storage, storage.buckets no existe y no debe romper el
  -- reporte completo.
  -- ----------------------------------------------------------
  v_has_bucket_table := to_regclass('storage.buckets') IS NOT NULL;

  IF v_has_bucket_table THEN
    BEGIN
      EXECUTE $sql$
        SELECT jsonb_build_object(
          'exists', true,
          'public', COALESCE(b.public, false),
          'file_size_limit', b.file_size_limit
        )
        FROM storage.buckets b
        WHERE b.id = $1
      $sql$
      INTO v_bucket
      USING c_bucket_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_bucket := NULL;
    END;
  END IF;

  IF v_bucket IS NULL THEN
    v_bucket := jsonb_build_object(
      'exists', false,
      'public', false,
      'file_size_limit', NULL::BIGINT
    );
  END IF;

  v_buckets := jsonb_build_object(c_bucket_id, v_bucket);

  -- ----------------------------------------------------------
  -- Índices
  -- ----------------------------------------------------------
  FOREACH v_name IN ARRAY c_indexes LOOP
    v_indexes := v_indexes || jsonb_build_object(
      v_name,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.indexname = v_name
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'tables', v_tables,
    'nullable_columns', v_nullable_columns,
    'columns', v_columns,
    'functions', v_functions,
    'buckets', v_buckets,
    'indexes', v_indexes
  );

EXCEPTION
  -- Último recurso: devolver la forma completa con lo que se
  -- haya podido introspeccionar en lugar de propagar el error.
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'tables', v_tables,
      'nullable_columns', v_nullable_columns,
      'columns', v_columns,
      'functions', v_functions,
      'buckets', CASE
        WHEN v_buckets ? c_bucket_id THEN v_buckets
        ELSE jsonb_build_object(
          c_bucket_id,
          jsonb_build_object(
            'exists', false,
            'public', false,
            'file_size_limit', NULL::BIGINT
          )
        )
      END,
      'indexes', v_indexes
    );
END;
$$;

COMMENT ON FUNCTION public.training_environment_report() IS
  'Introspección del entorno de capacitación: tablas, nulabilidad de columnas, columnas, funciones, bucket training-documents e índices. Nunca lanza excepción.';

-- ============================================================
-- 2. PERMISOS
-- ============================================================

REVOKE ALL
ON FUNCTION public.training_environment_report()
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.training_environment_report()
FROM anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.training_environment_report()
TO service_role;

COMMIT;
