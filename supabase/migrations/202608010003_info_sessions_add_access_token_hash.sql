-- ============================================================
-- info_sessions — Columna de la credencial de sesión
--                 (`access_token_hash`)
--
-- ESTADO DE ESTA MIGRACIÓN
--     LA COLUMNA Y EL ÍNDICE YA ESTÁN APLICADOS EN PRODUCCIÓN.
--     Este archivo solo versiona el cambio, para que un
--     despliegue limpio desde este repositorio produzca el mismo
--     esquema que producción (Requisito 9 de
--     `.kiro/specs/public-flow-authorization-hardening`). Es
--     idempotente, así que reaplicarlo es un no-op.
--
-- PARA QUÉ SIRVE LA COLUMNA
-- ------------------------------------------------------------
-- El flujo de `/informes/[courseId]` no tiene cuenta de usuario:
-- el cliente llega por un enlace, rellena su nombre y empieza.
-- Para poder retirar las políticas abiertas de `anon` sobre esta
-- tabla (`202608010004_info_sessions_server_side_writes.sql`) y
-- mover las escrituras a rutas de servidor, hace falta algo que
-- demuestre que quien escribe es el dueño de ESA sesión.
--
-- El identificador de la sesión no sirve para eso. Es un nombre,
-- no un secreto: viaja al cuerpo de `/api/info-chat`, al de
-- `/api/info-notify`, al nombre del canal de tiempo real y a los
-- logs de todos esos caminos. Si bastara el `id`, la ruta de
-- servidor tendría el mismo agujero que la política
-- `USING (true)` que sustituye, con un salto más.
--
-- Por eso la ruta de creación emite un token aleatorio de 32
-- bytes (`issueInfoSessionAccessToken` en
-- `src/lib/info-sessions/service.ts`), lo devuelve UNA vez al
-- navegador y guarda aquí únicamente su SHA-256 en hexadecimal.
-- Toda escritura posterior exige el par
-- `{ sessionId, accessToken }` y localiza la fila con los dos
-- `.eq(...)` a la vez, así que la credencial forma parte del
-- filtro y no de una comprobación previa que se pueda quitar sin
-- que nada falle.
--
-- POR QUÉ SOLO EL HASH
-- ------------------------------------------------------------
-- Un volcado de la tabla, un backup filtrado o una consulta con
-- `service_role` desde otra ruta dejan de ser suficientes para
-- escribir en sesiones ajenas: del hash no se reconstruye el
-- token. El secreto tiene 256 bits de entropía, así que el hash
-- va directo y sin sal —lo correcto para un valor no adivinable,
-- y lo que permite además localizar la fila con una comparación
-- indexada.
--
-- POR QUÉ LA COLUMNA ADMITE NULOS
-- ------------------------------------------------------------
-- Las sesiones creadas ANTES de este cambio no tienen token, y
-- son sesiones reales que el panel del asesor sigue mostrando.
-- Un `NOT NULL` habría exigido inventarles una credencial que
-- nadie tiene. El efecto de dejarlas en `NULL` es el correcto:
-- ninguna escritura del flujo público puede alcanzarlas, porque
-- el filtro compara contra el hash de un token presentado y
-- `NULL` no iguala a nada.
--
-- El índice único es PARCIAL por lo mismo: sin el
-- `WHERE access_token_hash IS NOT NULL`, un índice único sobre
-- una columna con nulos funciona igual en Postgres (los nulos no
-- colisionan entre sí), pero el predicado deja escrito que las
-- filas sin credencial son un estado esperado y no un descuido,
-- y mantiene el índice al tamaño de las filas que se consultan.
--
-- IDEMPOTENCIA: `ADD COLUMN IF NOT EXISTS` y
-- `CREATE UNIQUE INDEX IF NOT EXISTS` son no-op si ya están.
-- ============================================================

BEGIN;

ALTER TABLE public.info_sessions
  ADD COLUMN IF NOT EXISTS access_token_hash text;

COMMENT ON COLUMN public.info_sessions.access_token_hash IS
  'SHA-256 en hexadecimal del token de acceso emitido por POST /api/info-sessions. NUNCA el token en claro: el token se devuelve una sola vez al navegador del cliente y no se vuelve a almacenar. Es la credencial que autoriza las escrituras del flujo publico sin cuenta (/informes/[courseId]); las rutas de servidor localizan la fila por id Y por este hash a la vez. NULL en las sesiones creadas antes de la columna: esas filas ya no admiten escritura del flujo publico.';

-- Un token emitido identifica UNA sesión. Dos filas con el mismo
-- hash harían que una credencial autorizara a escribir en dos
-- sesiones, así que la unicidad es parte de la garantía, no una
-- optimización. El índice sirve además a los `.eq(...)` de cada
-- escritura.
CREATE UNIQUE INDEX IF NOT EXISTS info_sessions_access_token_hash_key
  ON public.info_sessions (access_token_hash)
  WHERE access_token_hash IS NOT NULL;

COMMIT;

-- ============================================================
-- RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Necesaria para que la columna nueva sea visible en la API.
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- ADVERTENCIA: eliminar la columna borra las credenciales de
-- todas las sesiones en curso. Los clientes que estén en medio
-- de una sesión de informes dejan de poder guardar su
-- transcripción y su cierre, porque su token ya no coincide con
-- nada. Solo tiene sentido si se revierte también el código de
-- las rutas de servidor.
--
--   BEGIN;
--
--   DROP INDEX IF EXISTS public.info_sessions_access_token_hash_key;
--
--   ALTER TABLE public.info_sessions
--     DROP COLUMN IF EXISTS access_token_hash;
--
--   COMMIT;
--
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- 1. La columna existe y admite nulos:
--
--      SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND table_name = 'info_sessions'
--        AND column_name = 'access_token_hash';
--
-- 2. El índice único parcial existe:
--
--      SELECT indexname, indexdef
--      FROM pg_indexes
--      WHERE schemaname = 'public'
--        AND tablename = 'info_sessions'
--        AND indexname = 'info_sessions_access_token_hash_key';
--
-- 3. Ninguna fila guarda algo que no sea un SHA-256 hexadecimal
--    de 64 caracteres (el token en claro es base64url de 43):
--
--      SELECT count(*)
--      FROM public.info_sessions
--      WHERE access_token_hash IS NOT NULL
--        AND access_token_hash !~ '^[0-9a-f]{64}$';
--
--    Resultado esperado: 0.
-- ============================================================
