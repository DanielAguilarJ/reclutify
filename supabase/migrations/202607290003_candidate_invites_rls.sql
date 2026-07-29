-- ============================================================
-- candidate_invites — Activar RLS y cerrar la fuga de datos
--
-- ATENCIÓN — PRECONDICIÓN DE DESPLIEGUE
--     ESTA MIGRACIÓN REQUIERE QUE EL CAMBIO DE
--     `src/app/api/invite-candidates/route.ts` YA ESTÉ DESPLEGADO.
--
--     Esa ruta insertaba en `candidate_invites` con el cliente de
--     `@/utils/supabase/server` (clave anon + sesión del usuario).
--     Ahora la inserción usa `createAdminClient()`
--     (`service_role`), que ignora RLS. Como aquí NO se crean
--     políticas de `INSERT`/`UPDATE` para `anon` ni
--     `authenticated`, aplicar esta migración contra un despliegue
--     que siga insertando con la clave anon deja el flujo de
--     invitaciones sin escribir: la inserción fallará en silencio
--     (el handler solo registra `Supabase invite insert error`) y
--     el registro de seguimiento de la invitación se perderá.
--     El ticket de entrevista sí se seguiría creando, así que el
--     fallo no es evidente desde la interfaz.
--
--     Orden correcto: desplegar la aplicación primero, aplicar
--     esta migración después.
--
-- PROBLEMA QUE CORRIGE
-- ------------------------------------------------------------
-- `20260416_candidates_invites.sql` creó la tabla sin activar
-- RLS. PostgREST la expone, así que el rol `anon` —cualquiera con
-- la clave pública del proyecto— podía leer todas las filas:
-- `candidate_email`, `candidate_name`, `interview_link` y
-- `evaluation`. Es una fuga de PII y de evaluaciones de
-- entrevista, y además los enlaces de entrevista permitían
-- suplantar a un candidato.
--
-- MODELO DE ACCESO QUE QUEDA
-- ------------------------------------------------------------
--   • `anon`          → sin acceso (ninguna política le aplica).
--   • `authenticated` → SELECT de una invitación si:
--                         a) el email del token coincide con
--                            `candidate_email` (el propio
--                            candidato), o
--                         b) es miembro de la organización dueña
--                            de la vacante (`roles.org_id` →
--                            `org_members.org_id`).
--   • `service_role`  → acceso completo, ignora RLS. Es el rol
--                       que usa `api/invite-candidates` para
--                       escribir.
--
-- IDEMPOTENCIA: `ENABLE ROW LEVEL SECURITY` sobre una tabla que ya
-- lo tiene es un no-op, y cada política va precedida de
-- `DROP POLICY IF EXISTS`. La migración se puede reaplicar.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ACTIVAR RLS
-- ============================================================

ALTER TABLE public.candidate_invites ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. POLÍTICA DE LECTURA
-- ============================================================
-- El email del token JWT es la única forma de identificar al
-- candidato: la tabla no tiene ninguna columna que referencie a
-- `auth.users` (no existe `candidate_id`).
--
-- La comparación va en minúsculas por los dos lados:
-- `auth.jwt() ->> 'email'` viene normalizado por GoTrue, pero
-- `candidate_email` lo escribe el llamante de
-- `api/invite-candidates` tal cual, así que una invitación
-- guardada como `Nombre@Empresa.com` no coincidiría nunca con un
-- comparador sensible a mayúsculas.
--
-- `role_id` es TEXT en las dos tablas (`roles.id` pasó a TEXT en
-- `00003_sync_data_persistence.sql`), así que la unión es directa.

DROP POLICY IF EXISTS "candidate_invites_select_own_or_org"
  ON public.candidate_invites;

CREATE POLICY "candidate_invites_select_own_or_org"
ON public.candidate_invites
FOR SELECT
TO authenticated
USING (
  -- a) El candidato invitado, identificado por el email del token.
  lower(candidate_invites.candidate_email) = lower(auth.jwt() ->> 'email')
  -- b) Cualquier miembro de la organización dueña de la vacante.
  OR EXISTS (
    SELECT 1
    FROM public.roles r
    JOIN public.org_members om
      ON om.org_id = r.org_id
    WHERE r.id = candidate_invites.role_id
      AND om.user_id = auth.uid()
  )
);

COMMENT ON TABLE public.candidate_invites IS
  'Seguimiento de invitaciones a entrevista. RLS activo: lectura solo para el candidato (email del token) o para miembros de la organización dueña de la vacante. Las escrituras van con service_role desde /api/invite-candidates.';

-- ============================================================
-- 3. SIN POLÍTICAS DE ESCRITURA — ES DELIBERADO
-- ============================================================
-- No se añaden políticas de INSERT/UPDATE/DELETE. La única
-- escritura del producto es la de `api/invite-candidates`, que ya
-- usa `service_role` y por tanto ignora RLS. Añadir una política
-- de INSERT para `anon` reabriría el agujero: permitiría a
-- cualquiera fabricar invitaciones.

COMMIT;

-- ============================================================
-- 4. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- CÓMO VERIFICAR (tras aplicar)
-- ============================================================
-- Con la clave anon, esto debe devolver una lista vacía, no filas:
--
--   curl -s "$SUPABASE_URL/rest/v1/candidate_invites?select=candidate_email" \
--     -H "apikey: $ANON_KEY"
--
-- Y el estado de RLS:
--
--   SELECT relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE oid = 'public.candidate_invites'::regclass;
-- ============================================================
