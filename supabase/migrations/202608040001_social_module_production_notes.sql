-- ============================================================================
-- 202608040001 — Módulo social completo: aplicado directamente en producción
-- ============================================================================
--
-- CONTEXTO
-- --------
-- Esta migración documenta, para que el historial del repositorio quede
-- consistente con el estado real de producción, el conjunto de tablas que se
-- aplicaron directamente vía el MCP de Supabase el 2026-08-01: notifications,
-- endorsements, saved_jobs, job_applications, follows, hashtags,
-- post_hashtags, groups, group_members, group_posts, user_blocks, reports,
-- poll_votes, api_rate_limits, y las columnas nuevas de profile_extensions y
-- company_pages.
--
-- El SQL exacto que se ejecutó está en los archivos ya existentes del
-- repositorio:
--   - 20260503_feed.sql (posts/reactions/comments — ya estaba en producción)
--   - 20260509_notifications.sql
--   - 20260511_endorsements.sql
--   - 20260512_saved_jobs.sql
--   - 20260513_hashtags.sql
--   - 20260514_follows.sql
--   - 20260515_groups.sql
--   - 20260516_blocks_reports_polls_shares.sql
--   - 20260517_profile_extensions.sql
--   - 20260510_company_pages.sql
--   - 202608020001_api_rate_limits.sql
--   - 202608030001_interview_telemetry_org_scope.sql
--   - 202608030002_coach_settings_timezone.sql
--
-- CON DOS DIFERENCIAS RESPECTO AL SQL ORIGINAL DE ESOS ARCHIVOS:
--
-- 1. `hashtags`/`post_hashtags` se crearon SIN las políticas de escritura
--    abiertas que `20260513_hashtags.sql` define (`hashtags_insert`,
--    `hashtags_update`, `post_hashtags_insert`, todas con `WITH CHECK
--    (true)`). Se aplicó directamente la corrección que
--    `202608030003_close_hashtag_write_policies.sql` habría hecho después.
--
-- 2. `notifications` se creó SIN `notif_insert` (que en el archivo original
--    no lleva `TO`, así que aplicaría también a `anon`).
--
-- 3. `organizations` recibió `public_company_select` ya acotado a
--    organizaciones con al menos una vacante publicada
--    (`id IN (SELECT org_id FROM roles WHERE is_published = true)`), no el
--    `USING (true)` sin condición del archivo original.
--
-- ADEMÁS, TRAS CREAR LAS FUNCIONES SECURITY DEFINER NUEVAS
-- ----------------------------------------------------------------------------
-- El linter de seguridad de Supabase marcó que las seis funciones trigger
-- nuevas (notify_connection_request, notify_connection_accepted,
-- notify_post_reaction, notify_post_comment, process_post_hashtags,
-- update_follow_counts, update_group_member_count) quedaban ejecutables
-- directamente vía /rest/v1/rpc/<nombre> por `anon` y `authenticated`. Se
-- revocó EXECUTE de las seis: ninguna se invoca por RPC desde el código, solo
-- se disparan como efecto de un INSERT/UPDATE en la tabla correspondiente.
--
-- ESTA MIGRACIÓN NO EJECUTA NADA
-- -------------------------------
-- Es un marcador histórico. El esquema ya existe en producción (aplicado el
-- 2026-08-01). Ejecutar los CREATE TABLE de los archivos listados arriba
-- contra esa misma base es seguro por el `IF NOT EXISTS`, pero NO reproduce
-- las dos correcciones de escritura ni la revocación de EXECUTE, así que
-- **no se debe** re-ejecutar esos archivos tal cual contra producción sin
-- aplicar también los pasos 1-3 y la revocación anterior.
--
-- Para un despliegue NUEVO (una base de Supabase distinta, vacía), sí hay que
-- ejecutar los archivos originales listados arriba en orden, y ADEMÁS:
--   - 202608030003_close_hashtag_write_policies.sql
--   - Las tres REVOKE de esta nota, repetidas abajo por conveniencia.
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Marcador histórico: el módulo social ya está aplicado en el proyecto de producción actual. Ver comentario de esta migración para el detalle exacto y las tres correcciones respecto a los archivos SQL originales.';
END $$;

-- Repetido aquí por si esta migración se ejecuta contra una base nueva que sí
-- ejecutó los archivos originales de 20260509 a 20260517 tal cual, sin las
-- correcciones. Es idempotente.
DROP POLICY IF EXISTS "hashtags_insert" ON public.hashtags;
DROP POLICY IF EXISTS "hashtags_update" ON public.hashtags;
DROP POLICY IF EXISTS "post_hashtags_insert" ON public.post_hashtags;
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;

REVOKE ALL ON FUNCTION public.notify_connection_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_connection_accepted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_post_reaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_post_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_post_hashtags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_follow_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_group_member_count() FROM PUBLIC, anon, authenticated;
