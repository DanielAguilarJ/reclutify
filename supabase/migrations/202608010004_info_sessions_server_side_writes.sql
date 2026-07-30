-- ============================================================
-- info_sessions — Retirar el acceso del rol `anon` y arreglar la
--                 pertenencia del asesor
--
-- ATENCIÓN — MIGRACIÓN PENDIENTE, NO APLICADA
--     ESTE ARCHIVO NO ESTÁ APLICADO EN NINGUNA BASE. Se aplica
--     con decisión explícita del usuario, después del despliegue
--     del código y con respaldo previo (Requisito 14 de
--     `.kiro/specs/public-flow-authorization-hardening`).
--
-- PRECONDICIÓN DE DESPLIEGUE
--     ESTA MIGRACIÓN REQUIERE QUE YA ESTÉN EN PRODUCCIÓN:
--       • las rutas de servidor de la sesión de informes
--         (creación, escritura parcial y lectura de estado), que
--         usan `src/lib/info-sessions/service.ts` con
--         `service_role`;
--       • la versión de `src/store/infoSessionStore.ts` que llama
--         a esas rutas en lugar de escribir con la clave anon, y
--         la de los componentes de `/informes/[courseId]` que
--         consulta el estado por ruta en vez de por el canal de
--         tiempo real;
--       • la migración `202608010003`, que crea
--         `access_token_hash`.
--
--     Hasta ese despliegue, el flujo público escribe desde el
--     NAVEGADOR con la clave anon (`createSession`,
--     `syncTranscript`, `updateSessionStatus`) y recibe el aviso
--     de "asesor atendió" por una suscripción de tiempo real que
--     necesita `SELECT`. Aplicar esta migración antes deja a TODO
--     cliente sin poder iniciar ni guardar su sesión de informes:
--     el `INSERT` se rechaza por política y los `UPDATE` afectan
--     cero filas. Y el store ignora esos errores en silencio
--     (`syncTranscript` y `updateSessionStatus` tienen un `catch`
--     vacío), así que el cliente ve una sesión que parece
--     funcionar y no se guarda en ningún sitio.
--
--     Orden correcto: desplegar la aplicación primero, aplicar
--     esta migración después, y comprobar con una sesión real que
--     la fila se crea, la transcripción se sincroniza y el cierre
--     queda registrado.
--
-- PROBLEMA QUE CORRIGE
-- ------------------------------------------------------------
-- `202608010002_info_sessions_declare_anon_policies.sql` declaró
-- las tres políticas que hoy tiene producción, todas para el rol
-- `public` (que incluye a `anon`) y todas con predicado `true`:
--
--   • `anon_insert_sessions`     INSERT WITH CHECK (true)
--   • `anon_read_own_session`    SELECT USING (true)
--   • `anon_update_own_session`  UPDATE USING (true)
--
-- El nombre `own_session` describe una intención que el predicado
-- no cumple: `USING (true)` no acota por sesión, acota por ROL. Y
-- la clave anon viaja al navegador de cualquier visitante, así
-- que con esa clave pública y una petición a PostgREST se podían
-- listar TODAS las sesiones de informes de TODAS las
-- organizaciones —nombre, correo, teléfono, edad, ocupación y
-- transcripción completa de cada cliente—, insertar sesiones con
-- cualquier `org_id` y reescribir la sesión de cualquier otra
-- persona.
--
-- MODELO DE ACCESO QUE QUEDA
-- ------------------------------------------------------------
--   • `anon`          → sin acceso a `info_sessions`.
--   • `authenticated` → `org_members_read_sessions` y
--                       `org_members_update_sessions`, acotadas a
--                       la organización del usuario. Es lo que
--                       usan el panel del asesor
--                       (`src/store/coachStore.ts`:
--                       `fetchLeads`, `fetchActiveSessions`,
--                       `markSessionAttended`) y
--                       `getCoachLeads` en
--                       `src/app/actions/courses.ts`.
--   • `service_role`  → acceso completo, ignora RLS. Es el rol de
--                       las rutas que sustituyen a las políticas
--                       eliminadas, todas en
--                       `src/lib/info-sessions/service.ts`:
--                         - `createInfoSession` resuelve el
--                           `org_id` leyendo `courses` (NO lo
--                           acepta del cliente) y emite el token
--                           de acceso;
--                         - `updateInfoSession` escribe solo las
--                           columnas del flujo del cliente
--                           (`transcript`,
--                           `objections_detected`, `status`,
--                           `closing_mode`, `client_email`,
--                           `client_phone`) y localiza la fila
--                           por `id` Y `access_token_hash` a la
--                           vez;
--                         - `readInfoSessionState` devuelve solo
--                           `status` y `coach_notified`, con el
--                           mismo par de filtros.
--                       También `/api/info-notify`, que ya
--                       escribía `coach_notified` con
--                       `service_role`.
--
-- POR QUÉ SE RECREAN LAS DOS POLÍTICAS DEL ASESOR
-- ------------------------------------------------------------
-- Hoy `org_members_read_sessions` y `org_members_update_sessions`
-- resuelven la pertenencia SOLO por `public.org_members`. Eso no
-- se nota mientras exista la política abierta: un asesor sin fila
-- en `org_members` sigue viendo las sesiones porque
-- `anon_read_own_session USING (true)` se combina con OR y le da
-- acceso a todo. Al retirar la política abierta, ese asesor
-- perdería su propio panel — leads vacíos, sesiones activas
-- vacías, y "marcar como atendida" sin efecto.
--
-- Y ese estado es real: la aplicación trata
-- `user_profiles.org_id` como una vía de pertenencia de primera
-- clase. `getActiveOrganizationId`
-- (`src/app/actions/organizations.ts`) cae a
-- `user_profiles.org_id` cuando no hay cookie de organización
-- activa, `switchOrganization` comprueba `user_profiles` ANTES de
-- `org_members`, y `getCoachLeads` deriva la organización
-- únicamente de `user_profiles`. Además,
-- `202607180005_training_v2_access_fixes.sql` documenta que el
-- backfill de `00004_multi_org_support` dejó filas de
-- `org_members` incompletas o con el rol equivocado: no es una
-- hipótesis, es un fallo que este proyecto ya tuvo, con el mismo
-- patrón —una política que cierra una vía de pertenencia y expulsa
-- a usuarios legítimos.
--
-- Por eso las dos políticas se recrean resolviendo la pertenencia
-- por `org_members` **O** por `user_profiles.org_id`. El conjunto
-- de filas visibles sigue siendo el de la organización del
-- usuario; lo que cambia es que la pertenencia se reconoce por
-- las dos vías que la aplicación usa.
--
-- La política de UPDATE gana además un `WITH CHECK` con el mismo
-- predicado. Sin él, un miembro puede mover una sesión a otra
-- organización con un `UPDATE` de `org_id` y sacarla de su propio
-- alcance. No afecta al único escritor autenticado del producto,
-- `coachStore.markSessionAttended`, que solo toca `status` y
-- `conversion_result` y deja `org_id` intacto.
--
-- IDEMPOTENCIA: `DROP POLICY IF EXISTS` antes de cada
-- `CREATE POLICY`, así que la migración se puede reaplicar sin
-- efecto.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. INSERT ANON — lo sustituye `createInfoSession`, que resuelve
--    el `org_id` en el servidor a partir del curso y emite la
--    credencial de la sesión.
-- ============================================================

DROP POLICY IF EXISTS "anon_insert_sessions" ON public.info_sessions;

-- ============================================================
-- 2. SELECT ANON — lo sustituye `readInfoSessionState`, que
--    devuelve `status` y `coach_notified` de UNA fila, la que
--    acredita la credencial presentada.
-- ============================================================

DROP POLICY IF EXISTS "anon_read_own_session" ON public.info_sessions;

-- ============================================================
-- 3. UPDATE ANON — lo sustituye `updateInfoSession`, que aplica
--    una lista blanca de columnas y exige el par
--    `{ id, access_token_hash }`.
-- ============================================================

DROP POLICY IF EXISTS "anon_update_own_session" ON public.info_sessions;

-- ============================================================
-- 4. PERTENENCIA DEL ASESOR — `org_members` O `user_profiles`
-- ============================================================

DROP POLICY IF EXISTS "org_members_read_sessions" ON public.info_sessions;

CREATE POLICY "org_members_read_sessions" ON public.info_sessions
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
      UNION
      SELECT org_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_members_update_sessions" ON public.info_sessions;

CREATE POLICY "org_members_update_sessions" ON public.info_sessions
  FOR UPDATE
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
      UNION
      SELECT org_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
      UNION
      SELECT org_id FROM public.user_profiles WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.info_sessions IS
  'Sesiones de informes de cursos. RLS activo y SIN acceso para anon: la escritura del flujo publico (/informes/[courseId]) pasa EXCLUSIVAMENTE por rutas de servidor con service_role, que resuelven el org_id a partir del curso, exigen la credencial de la sesion (id + access_token_hash) y limitan las columnas modificables. El panel del asesor accede con org_members_read_sessions y org_members_update_sessions, que reconocen la pertenencia por org_members o por user_profiles.org_id.';

COMMIT;

-- ============================================================
-- 5. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- Restaura las tres políticas de `anon` tal como las declara
-- `202608010002_info_sessions_declare_anon_policies.sql`, y
-- devuelve las dos del asesor a su forma anterior (pertenencia
-- solo por `org_members`, UPDATE sin `WITH CHECK`).
--
-- ADVERTENCIA: ejecutar este bloque vuelve a exponer TODAS las
-- sesiones de informes —con los datos de contacto y la
-- transcripción de cada cliente— a cualquiera que tenga la clave
-- anon, que es cualquiera que abra la aplicación. Solo tiene
-- sentido como reversión de emergencia si esta migración se
-- aplicó ANTES de desplegar el código, y hay que retirarlo en
-- cuanto el despliegue esté hecho.
--
-- Criterio para ejecutarlo: cualquier fallo del recorrido
-- completo de `/informes/{courseId}` (Requisito 10 del spec).
--
--   BEGIN;
--
--   CREATE POLICY "anon_insert_sessions" ON public.info_sessions
--     FOR INSERT TO public
--     WITH CHECK (true);
--
--   CREATE POLICY "anon_read_own_session" ON public.info_sessions
--     FOR SELECT TO public
--     USING (true);
--
--   CREATE POLICY "anon_update_own_session" ON public.info_sessions
--     FOR UPDATE TO public
--     USING (true);
--
--   DROP POLICY IF EXISTS "org_members_read_sessions"
--     ON public.info_sessions;
--
--   CREATE POLICY "org_members_read_sessions" ON public.info_sessions
--     FOR SELECT TO authenticated
--     USING (
--       org_id IN (
--         SELECT org_id FROM public.org_members
--         WHERE user_id = auth.uid()
--       )
--     );
--
--   DROP POLICY IF EXISTS "org_members_update_sessions"
--     ON public.info_sessions;
--
--   CREATE POLICY "org_members_update_sessions" ON public.info_sessions
--     FOR UPDATE TO authenticated
--     USING (
--       org_id IN (
--         SELECT org_id FROM public.org_members
--         WHERE user_id = auth.uid()
--       )
--     );
--
--   COMMIT;
--
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- 1. Que no queden políticas de `anon`/`public` sobre la tabla:
--
--      SELECT policyname, cmd, roles, qual, with_check
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename = 'info_sessions'
--      ORDER BY policyname;
--
--    Resultado esperado: solo `org_members_read_sessions` y
--    `org_members_update_sessions`, ambas `{authenticated}`.
--
-- 2. Con la clave anon, el SELECT debe devolver lista vacía:
--
--      curl -s "$SUPABASE_URL/rest/v1/info_sessions?select=id,client_email" \
--        -H "apikey: $ANON_KEY"
--
-- 3. Con la clave anon, el INSERT debe ser rechazado por
--    violación de política (42501):
--
--      curl -s -X POST "$SUPABASE_URL/rest/v1/info_sessions" \
--        -H "apikey: $ANON_KEY" \
--        -H "Content-Type: application/json" \
--        -d '{"course_id":"...","org_id":"...","client_name":"sonda","status":"active"}'
--
-- 4. Con la clave anon, el UPDATE debe afectar cero filas:
--
--      curl -s -X PATCH \
--        "$SUPABASE_URL/rest/v1/info_sessions?id=eq.$SESSION_ID" \
--        -H "apikey: $ANON_KEY" \
--        -H "Content-Type: application/json" \
--        -d '{"status":"completed"}'
--
-- 5. Panel del asesor, con un usuario que tenga `user_profiles.
--    org_id` y NO tenga fila en `org_members`: `/coach/leads` y
--    `/coach/sessions` deben seguir listando las sesiones de su
--    organización, y "marcar como atendida" debe seguir
--    funcionando. Es la comprobación que justifica el `UNION`.
--
-- 6. Flujo real, que es la condición de aceptación de todo el
--    endurecimiento (Requisito 10 del spec): abrir
--    `/informes/{courseId}`, completar la sesión, pedir asesor,
--    cerrar en modo presencial y en modo remoto, y comprobar que
--    la fila queda con su transcripción, sus objeciones, su
--    `closing_mode` y su estado final.
-- ============================================================
