-- ============================================================
-- training_programs.content_language — Idioma del contenido
--
-- PROBLEMA QUE CORRIGE
-- ------------------------------------------------------------
-- El módulo de capacitación no tenía ningún concepto de idioma.
-- Los cuatro puntos donde se llama al modelo
-- (`generate-modules`, `chat`, `evaluate-module` y
-- `hire-candidate`) enviaban prompts de sistema en inglés sin
-- ninguna directiva de idioma, así que el modelo respondía en
-- inglés y todo el contenido que ve el empleado —títulos de
-- módulo, secciones, preguntas, retroalimentación y el correo de
-- bienvenida— salía en inglés aunque la organización, el puesto y
-- los documentos fuente estuvieran en español.
--
-- QUÉ AÑADE
-- ------------------------------------------------------------
-- Una sola columna en el programa. El programa es el nivel
-- correcto: es lo que agrupa documentos, módulos y empleados, y es
-- lo que el administrador configura antes de generar contenido.
--
-- DEFAULT 'es': el producto se opera en español, y dejar que la
-- base aplique el defecto permite que la ruta de creación no tenga
-- que enviar la columna. Las filas existentes quedan en 'es', que
-- es el idioma en el que se espera que el administrador regenere
-- sus módulos.
--
-- El CHECK acota el dominio a los dos idiomas que la interfaz sabe
-- representar. Está deliberadamente cerrado: un valor fuera de la
-- unión rompería el tipado de `TrainingContentLanguage` en el
-- cliente y las directivas de prompt no sabrían qué inyectar.
--
-- IMPORTANTE — CAMBIAR EL IDIOMA NO RETRADUCE NADA
-- ------------------------------------------------------------
-- La columna gobierna la *generación futura*. Los módulos ya
-- almacenados conservan el idioma con el que se generaron; para
-- cambiarlos hay que regenerarlos desde la pantalla de
-- configuración.
--
-- IDEMPOTENCIA: `ADD COLUMN IF NOT EXISTS`, el `DO` que añade el
-- CHECK solo si falta, `COMMENT ON COLUMN`, `CREATE OR REPLACE
-- FUNCTION` y los `GRANT`/`REVOKE` son todos reaplicables sin
-- efecto adicional.
--
-- NINGUNA FIRMA DE FUNCIÓN CAMBIA. Las actualizaciones del
-- programa van por `UPDATE` directo desde
-- `src/app/api/training/programs/[programId]/route.ts`, no por RPC,
-- y la única función que se reemplaza
-- (`create_training_program_version`) conserva su firma `(UUID,
-- UUID)`: solo copia una columna más.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. COLUMNA
-- ============================================================

ALTER TABLE public.training_programs
  ADD COLUMN IF NOT EXISTS content_language TEXT NOT NULL DEFAULT 'es';

-- El CHECK se añade por separado y con nombre explícito para que
-- sea idempotente: `ADD COLUMN IF NOT EXISTS` no vuelve a evaluar
-- las restricciones inline cuando la columna ya existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'training_programs_content_language_check'
      AND conrelid = 'public.training_programs'::regclass
  ) THEN
    ALTER TABLE public.training_programs
      ADD CONSTRAINT training_programs_content_language_check
      CHECK (content_language IN ('es', 'en'));
  END IF;
END
$$;

-- ============================================================
-- 2. DOCUMENTACIÓN
-- ============================================================

COMMENT ON COLUMN public.training_programs.content_language IS
  'Idioma del contenido de capacitación (''es'' | ''en''). Gobierna el idioma en el que la IA genera módulos, secciones, preguntas, la calificación de respuestas abiertas, las respuestas del tutor, las notas de personalización y el correo de bienvenida; y también el idioma de la interfaz del empleado, que entra por enlace de token y no tiene preferencia de idioma propia. Cambiar este valor NO retraduce los módulos ya generados: hay que regenerarlos.';

-- ============================================================
-- 3. PROPAGACIÓN AL VERSIONADO
--
-- `create_training_program_version` copia el programa columna a
-- columna, así que sin este reemplazo una nueva versión borrador
-- de un programa en inglés nacería en 'es' (el DEFAULT) y el
-- administrador perdería el idioma en silencio al versionar.
--
-- La FIRMA NO CAMBIA (`(UUID, UUID)`): solo se añade
-- `content_language` a la lista de columnas copiadas. El resto del
-- cuerpo se reproduce literalmente del estado vigente
-- (`202607280002_training_v2_consolidated_repair.sql`, sección
-- 1.3), incluidos el bloqueo consultivo, el orden de las
-- validaciones y `SET search_path = public`. Los permisos se
-- reaplican después porque `CREATE OR REPLACE` los conserva pero
-- repetirlos es inocuo y deja el estado explícito.
-- ============================================================

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
    content_language,
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
    v_source.content_language,
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
REVOKE EXECUTE ON FUNCTION public.create_training_program_version(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_training_program_version(UUID, UUID) TO service_role;

COMMIT;

-- ============================================================
-- 4. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'training_programs'
--     AND column_name = 'content_language';
--
-- Y que el CHECK rechaza un idioma no soportado:
--
--   UPDATE public.training_programs SET content_language = 'fr'
--   WHERE id = '<algún id>';  -- debe fallar
-- ============================================================

-- ============================================================
-- ROLLBACK
-- ============================================================
-- ORDEN OBLIGATORIO: primero restaurar la función, después quitar
-- la columna. `create_training_program_version` referencia
-- `content_language`, así que borrar la columna dejando la función
-- nueva rompe el versionado en tiempo de ejecución.
--
-- 1. Reaplicar la sección 1.3 de
--    `202607280002_training_v2_consolidated_repair.sql` tal cual
--    (misma firma, cuerpo sin `content_language`).
--
-- 2. Quitar la restricción y la columna:
--
-- ALTER TABLE public.training_programs
--   DROP CONSTRAINT IF EXISTS training_programs_content_language_check;
--
-- ALTER TABLE public.training_programs
--   DROP COLUMN IF EXISTS content_language;
--
-- NOTIFY pgrst, 'reload schema';
-- ============================================================
