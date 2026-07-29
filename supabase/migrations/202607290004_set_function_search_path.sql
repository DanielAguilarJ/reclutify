-- ============================================================
-- Fijar search_path en las funciones de trigger
--
-- QUÉ CORRIGE
-- ------------------------------------------------------------
-- El linter de seguridad de Supabase marca estas funciones con
-- `function_search_path_mutable`: se crearon sin cláusula
-- `SET search_path`, así que resuelven los nombres sin cualificar
-- con el `search_path` de la sesión que dispara el trigger. Quien
-- pueda influir en ese `search_path` (o crear objetos en un
-- esquema que quede por delante de `public`) puede hacer que la
-- función use tablas u operadores distintos de los previstos.
--
-- POR QUÉ `= public` Y NO `= public, pg_temp`
-- ------------------------------------------------------------
-- Se deja `pg_temp` fuera a propósito. Si `pg_temp` está en el
-- `search_path`, cualquier rol puede crear una tabla o función
-- temporal que **sombree** un objeto de `public` durante la
-- ejecución del trigger, que es exactamente el vector que se
-- quiere cerrar. Sin `pg_temp` en la ruta, los objetos
-- temporales solo son accesibles cualificados, y ninguna de estas
-- funciones los usa.
--
-- `pg_catalog` no hace falta declararlo: PostgreSQL lo busca
-- siempre primero de forma implícita, así que `now()`,
-- `to_tsvector`, `coalesce`, `setweight` y los operadores de
-- tsvector siguen resolviéndose igual. Los cuerpos de estas ocho
-- funciones solo tocan tablas de `public` (`posts`,
-- `post_reactions`, `post_comments`, `profiles`, `conversations`)
-- y campos de `NEW`/`OLD`.
--
-- RIESGO: inocuo. `ALTER FUNCTION ... SET search_path` no cambia
-- el cuerpo, ni la firma, ni los permisos, ni la definición de
-- los triggers asociados. Solo añade una opción de configuración
-- a la función.
--
-- IDEMPOTENCIA: `ALTER FUNCTION ... SET search_path = public`
-- sobre una función que ya lo tiene fijado es un no-op. El bloque
-- `DO` salta con `RAISE NOTICE` cualquier función que no exista en
-- el entorno donde se aplique (`to_regprocedure(...) IS NULL`) en
-- lugar de abortar.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ALTER FUNCTION ... SET search_path = public
-- ============================================================
-- Todas son funciones de trigger sin argumentos, así que la firma
-- es `nombre()` en los ocho casos.

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    -- 20260501_job_search.sql
    'public.roles_search_vector_update()',
    -- 20260502_profiles_social.sql / 20260517_profile_extensions.sql
    'public.profiles_search_vector_update()',
    -- 20260502_profiles_social.sql
    'public.update_updated_at_column()',
    -- 20260503_feed.sql
    'public.update_post_reaction_count()',
    'public.update_post_comment_count()',
    -- 20260504_connections.sql
    'public.update_connection_counts()',
    -- 20260505_messaging.sql
    'public.update_conversation_last_message()',
    -- 202607180001_training_v2_foundation.sql
    'public.set_training_updated_at()'
  ]
  LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE NOTICE 'omitida (no existe en este entorno): %', v_signature;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_signature);

    RAISE NOTICE 'search_path fijado a public en %', v_signature;
  END LOOP;
END;
$$;

COMMIT;

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- `proconfig` debe contener `search_path=public`:
--
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN (
--       'roles_search_vector_update',
--       'profiles_search_vector_update',
--       'update_updated_at_column',
--       'update_post_reaction_count',
--       'update_post_comment_count',
--       'update_connection_counts',
--       'update_conversation_last_message',
--       'set_training_updated_at'
--     );
-- ============================================================
