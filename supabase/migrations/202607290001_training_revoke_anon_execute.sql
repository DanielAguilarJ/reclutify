-- ============================================================
-- Training Center V2 — Endurecimiento de permisos de RPC
--
-- CAUSA RAÍZ QUE ESTA MIGRACIÓN CORRIGE
-- ------------------------------------------------------------
-- Las migraciones que crean las funciones del módulo hacían
-- únicamente:
--
--     REVOKE ALL ON FUNCTION public.foo(...) FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION public.foo(...) TO service_role;
--
-- Eso NO deja la función fuera del alcance de la API pública en
-- Supabase. Supabase concede `EXECUTE` de forma **nominal** a los
-- roles `anon` y `authenticated` mediante `ALTER DEFAULT
-- PRIVILEGES` sobre el esquema `public`. Revocar del pseudo-rol
-- `PUBLIC` no elimina una concesión hecha a un rol por nombre:
-- son entradas de ACL distintas. Resultado: las funciones
-- seguían siendo invocables por cualquiera que tuviese la clave
-- pública del proyecto, vía
--
--     POST /rest/v1/rpc/<nombre>
--
-- Esto es escalada de privilegios directa, porque estas funciones
-- son `SECURITY DEFINER` y autorizan con parámetros que envía el
-- propio llamante (`p_actor_user_id`, `p_score`, …). No hay
-- ninguna comprobación basada en `auth.uid()`.
--
-- LA FORMA CORRECTA, para no reintroducir el patrón roto:
--
--     REVOKE ALL     ON FUNCTION public.foo(...) FROM PUBLIC;
--     REVOKE EXECUTE ON FUNCTION public.foo(...) FROM anon, authenticated;
--     GRANT  EXECUTE ON FUNCTION public.foo(...) TO service_role;
--
-- Todas las llamadas legítimas del módulo salen de rutas de
-- servidor con `createAdminClient()` (`service_role`), así que
-- quitar `anon`/`authenticated` no cambia ningún comportamiento.
--
-- ALCANCE: las 12 funciones transaccionales del módulo, más
-- `training_environment_report()` (la función de diagnóstico, que
-- estaba igual de expuesta y revela estructura de la base de
-- datos) y `is_training_admin(UUID)` con la excepción de abajo.
-- `update_org_subscription` va aparte, en
-- `202607290002_stripe_revoke_anon_execute.sql`, porque exige que
-- el webhook de Stripe ya esté desplegado con `service_role`.
--
-- EXCEPCIÓN: `public.is_training_admin(UUID)` conserva `EXECUTE`
-- para `authenticated`. Las políticas RLS de las tablas de
-- capacitación la invocan y se evalúan con el rol del llamante:
-- si se le revoca `authenticated`, el panel de administración
-- deja de poder leer sus propias tablas. A esa función se le
-- revoca solo `anon`.
--
-- IDEMPOTENCIA: `REVOKE` sobre un privilegio que ya no existe no
-- es error en PostgreSQL, es un no-op. La migración es por tanto
-- idempotente de forma natural y se puede reaplicar sin efecto.
-- El bloque `DO` además salta con `RAISE NOTICE` cualquier
-- función que todavía no exista en el entorno donde se aplique
-- (`to_regprocedure(...) IS NULL`), en lugar de abortar: un
-- entorno nuevo puede no tener aún todas las migraciones.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. REVOCAR EXECUTE A anon Y authenticated
-- ============================================================
-- Se revoca también de PUBLIC de forma defensiva: si alguna
-- función fue recreada con `CREATE FUNCTION` en algún entorno,
-- PostgreSQL le vuelve a conceder EXECUTE a PUBLIC por defecto.

DO $$
DECLARE
  v_signature TEXT;
  v_grantees  TEXT;
BEGIN
  FOR v_signature, v_grantees IN
    SELECT signature, grantees
    FROM (
      VALUES
        -- Funciones transaccionales (202607180002 / 202607280002).
        ('public.hire_training_candidate(uuid, text, uuid, text, timestamptz)',
         'PUBLIC, anon, authenticated'),
        ('public.publish_training_program(uuid, uuid)',
         'PUBLIC, anon, authenticated'),
        ('public.create_training_program(uuid, text, text, text, text, text)',
         'PUBLIC, anon, authenticated'),
        ('public.create_training_program_version(uuid, uuid)',
         'PUBLIC, anon, authenticated'),
        ('public.replace_training_modules(uuid, uuid, jsonb)',
         'PUBLIC, anon, authenticated'),
        ('public.calculate_training_progress(uuid)',
         'PUBLIC, anon, authenticated'),
        ('public.finalize_training_evaluation(uuid, uuid, jsonb, jsonb, numeric, text)',
         'PUBLIC, anon, authenticated'),
        ('public.complete_training_module_without_evaluation(uuid, uuid)',
         'PUBLIC, anon, authenticated'),
        ('public.increment_training_time(uuid, uuid, integer)',
         'PUBLIC, anon, authenticated'),
        ('public.append_training_session_messages(uuid, uuid, jsonb)',
         'PUBLIC, anon, authenticated'),
        -- Guarda de desasociación de documentos (202607180003).
        ('public.detach_training_program_document(uuid, uuid, uuid)',
         'PUBLIC, anon, authenticated'),
        -- Arranque de módulo (202607180004).
        ('public.start_training_module(uuid, uuid)',
         'PUBLIC, anon, authenticated'),
        -- Reporte de entorno (202607280001). Es la decimoquinta
        -- función SECURITY DEFINER del esquema y también estaba
        -- expuesta: revela estructura interna de la base de datos.
        -- Su único llamante es `src/lib/training/diagnostics.ts`,
        -- que usa `createAdminClient()`.
        ('public.training_environment_report()',
         'PUBLIC, anon, authenticated'),
        -- EXCEPCIÓN: `authenticated` la necesita para las políticas RLS.
        ('public.is_training_admin(uuid)',
         'anon')
    ) AS t(signature, grantees)
  LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE NOTICE 'omitida (no existe en este entorno): %', v_signature;
      CONTINUE;
    END IF;

    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM %s',
      v_signature,
      v_grantees
    );

    RAISE NOTICE 'EXECUTE revocado a % en %', v_grantees, v_signature;
  END LOOP;
END;
$$;

-- ============================================================
-- 2. REAFIRMAR LOS PERMISOS LEGÍTIMOS
-- ============================================================
-- Idempotente: volver a conceder un privilegio existente es un
-- no-op. Va después del revoke para que el orden de aplicación no
-- pueda dejar una función sin el rol que sí la necesita.

DO $$
DECLARE
  v_signature TEXT;
  v_grantees  TEXT;
BEGIN
  FOR v_signature, v_grantees IN
    SELECT signature, grantees
    FROM (
      VALUES
        ('public.hire_training_candidate(uuid, text, uuid, text, timestamptz)',
         'service_role'),
        ('public.publish_training_program(uuid, uuid)',
         'service_role'),
        ('public.create_training_program(uuid, text, text, text, text, text)',
         'service_role'),
        ('public.create_training_program_version(uuid, uuid)',
         'service_role'),
        ('public.replace_training_modules(uuid, uuid, jsonb)',
         'service_role'),
        ('public.calculate_training_progress(uuid)',
         'service_role'),
        ('public.finalize_training_evaluation(uuid, uuid, jsonb, jsonb, numeric, text)',
         'service_role'),
        ('public.complete_training_module_without_evaluation(uuid, uuid)',
         'service_role'),
        ('public.increment_training_time(uuid, uuid, integer)',
         'service_role'),
        ('public.append_training_session_messages(uuid, uuid, jsonb)',
         'service_role'),
        ('public.detach_training_program_document(uuid, uuid, uuid)',
         'service_role'),
        ('public.start_training_module(uuid, uuid)',
         'service_role'),
        ('public.training_environment_report()',
         'service_role'),
        -- `authenticated` es imprescindible aquí: las políticas RLS
        -- de las tablas de capacitación llaman a esta función y se
        -- evalúan con el rol del llamante.
        ('public.is_training_admin(uuid)',
         'authenticated, service_role')
    ) AS t(signature, grantees)
  LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO %s',
      v_signature,
      v_grantees
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 3. AVISO SI QUEDA ALGUNA FUNCIÓN EXPUESTA
-- ============================================================
-- Solo lectura de catálogos: no cambia nada, y `RAISE WARNING` no
-- aborta la transacción. Sirve para que una función con firma
-- distinta a la esperada (y por tanto omitida arriba) no pase
-- desapercibida. `is_training_admin` con `authenticated` es la
-- única excepción legítima.
--
-- `update_org_subscription` aparecerá aquí a propósito hasta que
-- se aplique `202607290002_stripe_revoke_anon_execute.sql`, que va
-- aparte porque depende de que el webhook de Stripe ya esté
-- desplegado usando `service_role`.

DO $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args,
           r.rolname AS role_name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
      AND NOT (p.proname = 'is_training_admin' AND r.rolname = 'authenticated')
    ORDER BY p.proname, r.rolname
  LOOP
    v_count := v_count + 1;
    RAISE WARNING 'sigue expuesta a %: public.%(%)',
      v_row.role_name, v_row.func_name, v_row.args;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE 'ninguna función SECURITY DEFINER de public queda expuesta a anon/authenticated';
  ELSE
    RAISE WARNING '% concesión(es) pendiente(s). Revisa la firma real de esas funciones y añádelas a este endurecimiento.', v_count;
  END IF;
END;
$$;

COMMIT;

-- ============================================================
-- 4. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción, igual que en la migración
-- consolidada. PostgREST cachea qué funciones expone y con qué
-- permisos. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- Debe devolver 0 filas, salvo `is_training_admin` con
-- `authenticated`:
--
--   SELECT p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          r.rolname,
--          has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can_execute
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
--   WHERE n.nspname = 'public'
--     AND p.prosecdef
--     AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');
-- ============================================================
