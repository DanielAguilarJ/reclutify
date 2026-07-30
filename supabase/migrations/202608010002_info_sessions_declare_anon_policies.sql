-- ============================================================
-- info_sessions — Declarar las políticas anon que hoy solo
--                 existen en la base real
--
-- ESTADO DE ESTA MIGRACIÓN
--     ESTA MIGRACIÓN NO CAMBIA NADA EN PRODUCCIÓN. Declara el
--     estado ACTUAL de las tres políticas de `anon` sobre
--     `public.info_sessions`, que se crearon a mano y NUNCA
--     estuvieron en `supabase/migrations/`.
--
--     Existe por dos motivos, los dos del Requisito 9 de
--     `.kiro/specs/public-flow-authorization-hardening`:
--
--       1. Deriva repo↔base. Un despliegue limpio desde este
--          repositorio producía una base SIN estas políticas, es
--          decir con el flujo de `/informes/[courseId]` roto
--          desde el primer día, y nadie lo habría notado hasta
--          que un cliente intentara empezar una sesión.
--       2. Para poder RETIRARLAS en la migración siguiente
--          (`202608010004_info_sessions_server_side_writes.sql`)
--          con un `DROP POLICY` que revise contra algo escrito.
--          Retirar una política que el repositorio nunca declaró
--          deja un cambio imposible de revisar: no hay forma de
--          saber qué se está quitando ni cómo restaurarlo.
--
--     Si la base ya las tiene —el caso de producción—, aplicar
--     esto es un no-op: se recrean idénticas.
--
-- QUÉ PERMITEN HOY ESTAS TRES POLÍTICAS
-- ------------------------------------------------------------
-- Las tres son para el rol `public`, que en Postgres INCLUYE a
-- `anon`, y las tres tienen predicado `true`:
--
--   • `anon_insert_sessions`     INSERT WITH CHECK (true)
--   • `anon_read_own_session`    SELECT USING (true)
--   • `anon_update_own_session`  UPDATE USING (true)
--
-- El nombre `own_session` describe una intención que el
-- predicado no cumple: `USING (true)` no acota por sesión, acota
-- por ROL. Y la clave anon viaja al navegador de cualquier
-- visitante, así que hoy, con una sola petición a PostgREST y la
-- clave pública, se puede:
--
--   • listar TODAS las sesiones de informes de TODAS las
--     organizaciones, con `client_name`, `client_email`,
--     `client_phone`, `client_age`, `client_occupation` y la
--     `transcript` completa de cada conversación;
--   • insertar sesiones con cualquier `org_id`, y meter leads
--     falsos en el panel de cualquier asesor;
--   • reescribir cualquier sesión ajena: su transcripción, su
--     estado, su `conversion_result` o su `closing_mode`.
--
-- El linter de Supabase no reporta este caso porque RLS está
-- activo. El problema es el predicado.
--
-- QUIÉN LAS USA HOY (y por eso no se pueden quitar aquí)
-- ------------------------------------------------------------
-- `src/store/infoSessionStore.ts` escribe desde el NAVEGADOR con
-- la clave anon:
--
--   • `createSession`        → INSERT  (`anon_insert_sessions`)
--   • `syncTranscript`       → UPDATE  (`anon_update_own_session`)
--   • `updateSessionStatus`  → UPDATE  (`anon_update_own_session`)
--   • `subscribeToSessionUpdates` → la suscripción de tiempo real
--     necesita `SELECT` sobre la fila (`anon_read_own_session`)
--     para entregar el evento.
--
-- Mientras ese código sea el que está en producción, quitar
-- estas políticas deja a todo cliente sin poder completar su
-- sesión de informes. La retirada va en la migración siguiente,
-- que declara su propia precondición de despliegue.
--
-- IDEMPOTENCIA: `DROP POLICY IF EXISTS` antes de cada
-- `CREATE POLICY`, así que la migración se puede reaplicar sin
-- efecto.
-- ============================================================

BEGIN;

-- RLS ya está activo en producción; se declara por si un
-- despliegue limpio crea la tabla sin él.
ALTER TABLE public.info_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1. INSERT ABIERTO — lo usa `infoSessionStore.createSession`
-- ============================================================

DROP POLICY IF EXISTS "anon_insert_sessions" ON public.info_sessions;

CREATE POLICY "anon_insert_sessions" ON public.info_sessions
  FOR INSERT TO public
  WITH CHECK (true);

-- ============================================================
-- 2. SELECT ABIERTO — lo usa la suscripción de tiempo real de
--    `infoSessionStore.subscribeToSessionUpdates`
-- ============================================================

DROP POLICY IF EXISTS "anon_read_own_session" ON public.info_sessions;

CREATE POLICY "anon_read_own_session" ON public.info_sessions
  FOR SELECT TO public
  USING (true);

-- ============================================================
-- 3. UPDATE ABIERTO — lo usan
--    `infoSessionStore.syncTranscript` y `updateSessionStatus`
-- ============================================================

DROP POLICY IF EXISTS "anon_update_own_session" ON public.info_sessions;

CREATE POLICY "anon_update_own_session" ON public.info_sessions
  FOR UPDATE TO public
  USING (true);

COMMIT;

-- ============================================================
-- 4. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- El "estado anterior" de esta migración es la base real, que ya
-- tiene las tres políticas. Revertirla, por tanto, es
-- eliminarlas — y eso es exactamente lo que hace
-- `202608010004_info_sessions_server_side_writes.sql`, con su
-- precondición de despliegue documentada.
--
-- Ejecutar los tres `DROP` sueltos, sin ese despliegue, deja a
-- todo cliente sin poder completar su sesión de informes:
--
--   BEGIN;
--
--   DROP POLICY IF EXISTS "anon_insert_sessions"
--     ON public.info_sessions;
--   DROP POLICY IF EXISTS "anon_read_own_session"
--     ON public.info_sessions;
--   DROP POLICY IF EXISTS "anon_update_own_session"
--     ON public.info_sessions;
--
--   COMMIT;
--
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- 1. Las tres políticas presentes, con su predicado:
--
--      SELECT policyname, cmd, roles, qual, with_check
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename = 'info_sessions'
--      ORDER BY policyname;
--
--    Resultado esperado: `anon_insert_sessions`,
--    `anon_read_own_session` y `anon_update_own_session`, más las
--    políticas de `authenticated` que ya existan
--    (`org_members_read_sessions`, `org_members_update_sessions`).
--
-- 2. El flujo público sigue igual que antes de esta migración:
--    abrir `/informes/{courseId}`, rellenar los datos, empezar la
--    sesión y comprobar que la fila se crea y que la
--    transcripción se sincroniza.
-- ============================================================
