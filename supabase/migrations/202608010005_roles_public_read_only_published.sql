-- ============================================================
-- roles — La lectura pública se limita a las vacantes
--         PUBLICADAS, y alcanza también a `authenticated`
--
-- ESTADO DE ESTA MIGRACIÓN
--     LAS TRES SENTENCIAS DE ESTE ARCHIVO YA SE APLICARON A
--     MANO EN PRODUCCIÓN. El archivo existe para que el cambio
--     quede versionado y para que un despliegue limpio produzca
--     el mismo estado de autorización que producción
--     (Requisito 9 de
--     `.kiro/specs/public-flow-authorization-hardening`).
--     Es idempotente, así que reaplicarlo es un no-op.
--
-- QUÉ SE ELIMINA Y QUÉ EXPONÍA
-- ------------------------------------------------------------
-- 1) `anon_roles_select` (`00003_sync_data_persistence.sql:185-187`)
--    era `FOR SELECT TO anon USING (true)`. El `USING (true)` no
--    acota por fila: acota por ROL, y la clave anon viaja al
--    navegador de cualquier visitante. Con esa clave y una sola
--    petición a PostgREST se podían listar LAS 38 VACANTES de
--    TODAS las organizaciones, incluidas las NO PUBLICADAS con su
--    descripción y sus criterios de evaluación (`topics`), y leer
--    LOS 18 `public_token`.
--
--    Ese último dato es el que convierte la fuga en acceso: el
--    `public_token` ES la credencial de
--    `/interview/public/[publicToken]`. Enumerar `roles` era
--    enumerar entrevistas abiertas, el mismo efecto que la
--    enumeración de tickets que cerró
--    `202607310001_interview_tickets_drop_anon_policies.sql`,
--    por otra vía.
--
-- 2) `public_role_by_token` (`20260601_public_interview_links.sql:24-27`)
--    era `FOR SELECT TO anon USING (public_token IS NOT NULL AND
--    public_token != '')`. El nombre promete una comprobación de
--    token, pero el predicado NO COMPARA EL TOKEN CON NADA: solo
--    exige que la fila tenga alguno. Es decir, daba lectura de
--    toda vacante con enlace público a cualquiera, con token o
--    sin él. Y además era código muerto: la resolución del
--    `public_token` la hace `/api/public-interview` con
--    `SUPABASE_SERVICE_ROLE_KEY`, que ignora RLS y nunca dependió
--    de esta política.
--
-- EL BUG FUNCIONAL QUE ESTO TAMBIÉN CORRIGE
-- ------------------------------------------------------------
-- Las dos políticas de lectura pública (`anon_roles_select` y
-- `public_published_roles_select`) se habían concedido SOLO al rol
-- `anon`. Un usuario CON SESIÓN no es `anon`, es `authenticated`,
-- y para ese rol la única política aplicable a `roles` era
-- `org_isolation_roles` (`00002_fix_rls_and_insert_policies.sql:103`),
-- acotada a su propia organización. Resultado: quien iniciaba
-- sesión veía CERO vacantes en el portal público, porque todas
-- eran de otras organizaciones.
--
-- Verificado en la base antes y después: 0 de 2 vacantes
-- publicadas visibles con sesión antes, 2 después.
--
-- Afectaba a todo lo que lee vacantes publicadas con el cliente
-- de sesión: `src/app/api/jobs/search/route.ts`,
-- `src/app/actions/jobs.ts`, `src/app/sitemap.ts`,
-- `src/app/search/SearchClient.tsx`,
-- `src/components/shared/GlobalSearchBar.tsx` y
-- `src/app/company/[slug]/page.tsx`. Por eso
-- `public_published_roles_select` se recrea `TO anon,
-- authenticated`: el portal es público, y estar autenticado no
-- puede quitar acceso.
--
-- MODELO DE ACCESO QUE QUEDA
-- ------------------------------------------------------------
--   • `anon`          → solo las filas con `is_published = true`,
--                       vía `public_published_roles_select`. Las
--                       vacantes en borrador dejan de ser
--                       visibles.
--   • `authenticated` → esas mismas filas publicadas MÁS todas
--                       las de su organización, vía
--                       `org_isolation_roles` y las políticas
--                       `org_isolation_roles_*`, que NO se tocan
--                       aquí. El panel sigue igual.
--   • `service_role`  → acceso completo, ignora RLS. Es el rol de
--                       `/api/public-interview` (resuelve el
--                       `public_token`) y de
--                       `/api/interview/ticket` (resuelve el
--                       ticket y devuelve solo el subconjunto de
--                       la vacante que la entrevista necesita,
--                       nunca el `public_token`).
--
-- RIESGO RESIDUAL ACEPTADO
-- ------------------------------------------------------------
-- La lectura de una vacante PUBLICADA sigue devolviendo todas sus
-- columnas, incluidos `public_token` y `topics` (los criterios de
-- evaluación). Es decir: para las vacantes publicadas, el enlace
-- público de entrevista sigue siendo obtenible con la clave anon.
--
-- Acotarlo exige dos cosas que no caben en una migración de
-- políticas: privilegios por columna (`REVOKE SELECT (public_token,
-- topics) ... GRANT SELECT (columnas públicas) ...`) y una ruta de
-- servidor para el panel, porque hoy `src/store/adminStore.ts` y
-- `src/hooks/useRoles.ts` leen `public_token` con el cliente de
-- SESIÓN — y `roles` está en la publicación de Realtime
-- (`00003_sync_data_persistence.sql`), que entrega la fila
-- completa. Un `REVOKE` por columna rompería el panel y la
-- suscripción antes de proteger nada. Queda fuera de este tramo.
--
-- IDEMPOTENCIA: cada `CREATE POLICY` va precedido de su
-- `DROP POLICY IF EXISTS`, así que la migración se puede
-- reaplicar sin efecto.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. LECTURA ANON TOTAL — no la sustituye nada, porque ninguna
--    pantalla la necesitaba: el portal público solo muestra
--    vacantes publicadas y las entrevistas se resuelven en
--    rutas de servidor con `service_role`.
-- ============================================================

DROP POLICY IF EXISTS "anon_roles_select" ON public.roles;

-- ============================================================
-- 2. LECTURA ANON «POR TOKEN» QUE NO COMPARABA EL TOKEN — la
--    sustituye `POST /api/public-interview`, que resuelve el
--    `public_token` con `service_role`.
-- ============================================================

DROP POLICY IF EXISTS "public_role_by_token" ON public.roles;

-- ============================================================
-- 3. LECTURA PÚBLICA DE VACANTES PUBLICADAS — se recrea igual
--    que en `20260501_job_search.sql:60-63`, salvo que ahora
--    alcanza también a `authenticated` (ver el bug de arriba).
-- ============================================================

DROP POLICY IF EXISTS "public_published_roles_select" ON public.roles;

CREATE POLICY "public_published_roles_select" ON public.roles
  FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

COMMENT ON TABLE public.roles IS
  'Vacantes. RLS activo. La lectura publica se limita a is_published = true y alcanza a anon y authenticated (public_published_roles_select), porque el portal de vacantes es publico y tener sesion no puede quitar acceso. La organizacion propietaria accede a todas sus vacantes con las politicas org_isolation_roles*. La resolucion de public_token para /interview/public/[publicToken] pasa por /api/public-interview con service_role. Riesgo residual conocido: la fila publicada incluye public_token y topics; acotarlo exige privilegios por columna y mover la lectura del panel a una ruta de servidor.';

COMMIT;

-- ============================================================
-- 4. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- Restaura EXACTAMENTE el estado anterior: las dos políticas
-- eliminadas tal como las declaran
-- `00003_sync_data_persistence.sql:185-187` y
-- `20260601_public_interview_links.sql:24-27`, y
-- `public_published_roles_select` acotada de nuevo a `anon`.
--
-- ADVERTENCIA: ejecutar este bloque vuelve a exponer al rol
-- `anon` todas las vacantes de todas las organizaciones —las no
-- publicadas incluidas— con sus criterios de evaluación y sus
-- `public_token`, y vuelve a dejar el portal público VACÍO para
-- los usuarios con sesión. No hay ningún flujo del producto que
-- lo necesite; solo tiene sentido como reversión de emergencia
-- si el portal público rompiera de una forma no prevista aquí.
--
--   BEGIN;
--
--   CREATE POLICY "anon_roles_select" ON public.roles
--     FOR SELECT TO anon
--     USING (true);
--
--   CREATE POLICY "public_role_by_token" ON public.roles
--     FOR SELECT TO anon
--     USING (public_token IS NOT NULL AND public_token != '');
--
--   DROP POLICY IF EXISTS "public_published_roles_select" ON public.roles;
--
--   CREATE POLICY "public_published_roles_select" ON public.roles
--     FOR SELECT TO anon
--     USING (is_published = true);
--
--   COMMIT;
--
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- 1. Políticas de lectura que quedan sobre la tabla:
--
--      SELECT policyname, cmd, roles, qual
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename = 'roles';
--
--    Resultado esperado: `public_published_roles_select` con
--    `{anon,authenticated}` y `(is_published = true)`, más las
--    `org_isolation_roles*`. NI `anon_roles_select` NI
--    `public_role_by_token`.
--
-- 2. Con la clave anon, esto debe devolver solo vacantes
--    publicadas, y tantas como haya publicadas:
--
--      curl -s "$SUPABASE_URL/rest/v1/roles?select=id,is_published" \
--        -H "apikey: $ANON_KEY"
--
--    Y con filtro por borrador, lista vacía:
--
--      curl -s "$SUPABASE_URL/rest/v1/roles?select=id&is_published=eq.false" \
--        -H "apikey: $ANON_KEY"
--
-- 3. Con la clave anon, pedir los tokens de las vacantes NO
--    publicadas debe devolver lista vacía:
--
--      curl -s "$SUPABASE_URL/rest/v1/roles?select=public_token&is_published=eq.false" \
--        -H "apikey: $ANON_KEY"
--
--    (Para las publicadas sigue devolviendo el token: es el
--    riesgo residual documentado arriba, no un fallo de esta
--    migración.)
--
-- 4. El bug funcional, que es lo que hay que comprobar en la
--    interfaz: iniciar sesión con una cuenta cuya organización
--    NO tenga vacantes publicadas y abrir `/search`. Antes: cero
--    resultados. Ahora: todas las vacantes publicadas de la
--    plataforma. Comprobar lo mismo en `/company/[slug]`, en el
--    buscador global y en `GET /api/jobs/search`.
--
-- 5. Flujos públicos, condición de aceptación de todo el
--    endurecimiento (Requisito 10 del spec):
--      a. `/interview/public/{publicToken}`: abrir el enlace,
--         registrarse y comprobar que la entrevista arranca (esa
--         resolución va por `service_role`, así que no depende de
--         ninguna política de esta tabla).
--      b. `/interview/t/{token}`: abrir un enlace vigente y
--         comprobar que la entrevista arranca.
--      c. Portal público sin sesión: `/search` y
--         `/company/[slug]` siguen listando las vacantes
--         publicadas con el logo y el nombre de su organización.
-- ============================================================
