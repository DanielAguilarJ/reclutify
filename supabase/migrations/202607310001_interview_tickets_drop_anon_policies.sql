-- ============================================================
-- interview_tickets — Retirar el acceso del rol `anon`
--
-- ATENCIÓN — PRECONDICIÓN DE DESPLIEGUE
--     ESTA MIGRACIÓN REQUIERE QUE YA ESTÉN EN PRODUCCIÓN:
--       • `src/app/api/interview/ticket/route.ts`
--       • `src/app/api/interview/ticket/consume/route.ts`
--       • la versión de `src/app/interview/t/[token]/page.tsx`
--         que consume esas dos rutas
--         (`src/lib/interview-tickets/client.ts`).
--
--     Hasta ese despliegue, la pantalla del candidato resuelve
--     su ticket desde el NAVEGADOR con la clave anon
--     (`ticketStore.fetchTicketByToken`) y marca `used = true`
--     igual (`ticketStore.syncMarkUsed`). Aplicar esta migración
--     antes deja a TODO candidato con enlace válido fuera de su
--     entrevista: el `SELECT` por token devuelve cero filas y la
--     pantalla muestra "Ticket Inválido". No hay aviso ni error
--     visible en el panel; simplemente nadie puede entrevistarse.
--
--     Orden correcto: desplegar la aplicación primero, aplicar
--     esta migración después, y comprobar con un enlace real que
--     la entrevista abre y que el ticket queda usado al entrar a
--     la sala.
--
-- PROBLEMA QUE CORRIGE
-- ------------------------------------------------------------
-- `00003_sync_data_persistence.sql:113-119` creó dos políticas
-- para que el candidato sin cuenta pudiera usar su enlace:
--
--   • `public_ticket_by_token`: FOR SELECT TO anon USING (true)
--   • `anon_tickets_update`:    FOR UPDATE TO anon USING (true)
--
-- El `USING (true)` no acota nada por token: acota por ROL. Como
-- la clave anon viaja al navegador de cualquier visitante, esas
-- dos políticas son públicas. Con la clave anon y una sola
-- petición a PostgREST se podían listar TODAS las filas de
-- `interview_tickets` con su `token`, su `candidate_name` y su
-- `role_id` — es decir, abrir `/interview/t/{token}` como
-- cualquier candidato de cualquier organización— y marcar
-- `used = true` en tickets ajenos para dejar a esas personas sin
-- poder entrar. El linter de Supabase no reporta este caso,
-- porque RLS está activo: el problema es el predicado.
--
-- MODELO DE ACCESO QUE QUEDA
-- ------------------------------------------------------------
--   • `anon`          → sin acceso a `interview_tickets`.
--   • `authenticated` → las políticas por organización que ya
--                       existen y NO se tocan aquí:
--                       `org_tickets_select`, `org_tickets_insert`
--                       y `org_tickets_update`. El panel
--                       (`/admin/tickets`, `/admin/create-role`,
--                       vía `src/store/ticketStore.ts`) sigue
--                       listando y creando los tickets de su
--                       propia organización.
--   • `service_role`  → acceso completo, ignora RLS. Es el rol de
--                       las rutas que sustituyen a las políticas
--                       eliminadas:
--                         - `POST /api/interview/ticket`
--                           resuelve el token y devuelve solo
--                           `candidate_name`, `role_id`,
--                           `language`, `expires_at` y `used` del
--                           ticket, el subconjunto del puesto que
--                           la entrevista necesita y el
--                           `plan_tier` de la organización. NUNCA
--                           el `token` ni `roles.public_token`.
--                         - `POST /api/interview/ticket/consume`
--                           marca `used = true` solo si el ticket
--                           existe, no está usado y no ha
--                           expirado.
--                       También `src/lib/invites/service.ts`, que
--                       ya creaba los tickets con `service_role`.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
-- ------------------------------------------------------------
-- No toca `anon_roles_select` ni las políticas de
-- `organizations`. El flujo de ticket ya no las necesita, pero
-- otras pantallas públicas sí las usan hoy y cerrarlas es un
-- tramo aparte (Requisito 2 de
-- `.kiro/specs/public-flow-authorization-hardening`). Mientras
-- sigan abiertas, el `token` del ticket deja de ser enumerable
-- pero el `public_token` de las vacantes no.
--
-- IDEMPOTENCIA: `DROP POLICY IF EXISTS` es un no-op si la
-- política ya no está, así que la migración se puede reaplicar
-- sin efecto.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. LECTURA ANON POR TOKEN — la sustituye
--    `POST /api/interview/ticket`
-- ============================================================

DROP POLICY IF EXISTS "public_ticket_by_token" ON public.interview_tickets;

-- ============================================================
-- 2. ESCRITURA ANON DE `used` — la sustituye
--    `POST /api/interview/ticket/consume`
-- ============================================================

DROP POLICY IF EXISTS "anon_tickets_update" ON public.interview_tickets;

COMMENT ON TABLE public.interview_tickets IS
  'Tickets de entrevista de un solo uso. RLS activo y SIN acceso para anon: el candidato sin cuenta resuelve y consume su ticket a traves de /api/interview/ticket y /api/interview/ticket/consume, que corren con service_role. El panel autenticado accede con las politicas org_tickets_*.';

COMMIT;

-- ============================================================
-- 3. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- Restaura EXACTAMENTE las dos políticas eliminadas, tal como
-- las declara `00003_sync_data_persistence.sql:113-119`.
--
-- ADVERTENCIA: ejecutar este bloque vuelve a exponer todos los
-- tokens de entrevista al rol `anon`. Solo tiene sentido como
-- reversión de emergencia si se aplicó esta migración ANTES de
-- desplegar el código, y hay que retirarlo en cuanto el
-- despliegue esté hecho.
--
--   BEGIN;
--
--   CREATE POLICY "public_ticket_by_token" ON public.interview_tickets
--     FOR SELECT TO anon USING (true);
--
--   CREATE POLICY "anon_tickets_update" ON public.interview_tickets
--     FOR UPDATE TO anon USING (true);
--
--   COMMIT;
--
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- 1. Con la clave anon, esto debe devolver una lista vacía:
--
--      curl -s "$SUPABASE_URL/rest/v1/interview_tickets?select=token" \
--        -H "apikey: $ANON_KEY"
--
--    Y con filtro por un token conocido, también vacía:
--
--      curl -s "$SUPABASE_URL/rest/v1/interview_tickets?select=token&token=eq.$TOKEN" \
--        -H "apikey: $ANON_KEY"
--
-- 2. El UPDATE con la clave anon debe afectar cero filas:
--
--      curl -s -X PATCH \
--        "$SUPABASE_URL/rest/v1/interview_tickets?token=eq.$TOKEN" \
--        -H "apikey: $ANON_KEY" \
--        -H "Content-Type: application/json" \
--        -d '{"used": true}'
--
-- 3. Que no queden políticas de anon sobre la tabla:
--
--      SELECT policyname, cmd, roles
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename = 'interview_tickets';
--
--    Resultado esperado: solo `org_tickets_select`,
--    `org_tickets_insert` y `org_tickets_update`.
--
-- 4. Flujo real: abrir un enlace `/interview/t/{token}` vigente,
--    comprobar que la entrevista arranca, entrar a la sala y
--    verificar que la fila queda con `used = true`.
-- ============================================================
