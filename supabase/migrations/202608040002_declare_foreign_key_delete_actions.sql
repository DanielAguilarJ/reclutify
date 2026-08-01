-- ============================================================================
-- 202608040002 — Declarar ON DELETE en las claves foráneas que no lo tenían
-- ============================================================================
--
-- QUÉ PROBLEMA RESUELVE
-- ---------------------
-- Nueve claves foráneas del esquema fundacional no declaraban ninguna acción
-- de borrado, así que Postgres usa `NO ACTION` por defecto — funcionalmente
-- casi idéntico a `RESTRICT`, pero SIN intención declarada: nadie que lea el
-- esquema puede distinguir «se decidió bloquear el borrado» de «nadie lo
-- pensó». Verificado con `pg_constraint` contra el proyecto de producción
-- real antes de escribir esta migración, no asumido por el nombre de archivo.
--
-- NINGUNA CAMBIA A CASCADE
-- -------------------------
-- Se consideró y se descartó para las cinco columnas que apuntan a
-- `organizations`: `roles.org_id`, `candidates.org_id`, `interviews.org_id`,
-- `user_profiles.org_id`, `job_applications.org_id`. `organizations` es la
-- raíz del tenant. Un `CASCADE` ahí significa que borrar una fila de
-- `organizations` borra en cadena todos los roles, candidatos, entrevistas y
-- perfiles de esa empresa sin ninguna confirmación intermedia — el tipo de
-- operación que, hecha por error o por una consulta mal filtrada, no tiene
-- vuelta atrás. Se declaran `RESTRICT` explícito: la intención de bloquear el
-- borrado queda escrita, no es un accidente de no haber puesto nada.
--
-- Comprobado en el código: HOY no existe ninguna función que borre una
-- organización con datos reales. Los tres `.from('organizations').delete()`
-- del repositorio (`onboarding.ts` × 2, `organizations.ts` × 1) son rollback
-- de una organización que se acaba de crear en la misma petición, antes de
-- que exista una sola fila dependiente. `RESTRICT` no cambia su
-- comportamiento: esas organizaciones no tienen roles ni candidatos que
-- bloqueen el borrado.
--
-- POR QUÉ `candidates.role_id` Y `interviews.candidate_id` VAN A `RESTRICT`
-- ---------------------------------------------------------------------------
-- Mismo razonamiento que ya se aplicó a `training_documents.role_id` y
-- `training_employees.role_id` en el esquema existente: un candidato y su
-- entrevista son historial de contratación, no un dato desechable al borrar
-- la vacante. Se prefiere que el borrado falle con un mensaje claro a que
-- desaparezca en cascada un registro que podría necesitarse para auditoría.
--
-- El único borrador de `roles` en todo el código es `removeRole` en
-- `adminStore.ts`, que ya revierte el estado local y muestra un error si la
-- escritura a Supabase falla — este cambio hace que ese camino de error se
-- dispare también cuando el puesto tiene candidatos, en vez de fallar con
-- «NO ACTION» sin más contexto. Se mejora el mensaje en el mismo commit de
-- código que acompaña a esta migración.
--
-- POR QUÉ `team_invitations.invited_by` VA A `SET NULL`
-- --------------------------------------------------------
-- Es la única de las nueve donde bloquear el borrado sería el error: si un
-- administrador que invitó a alguien borra su cuenta (o se la borran), la
-- invitación pendiente no tiene por qué impedirlo. La columna ya admite NULL.
--
-- POR QUÉ `groups.creator_id` SE QUEDA EN `RESTRICT` Y NO EN `SET NULL`
-- -------------------------------------------------------------------------
-- `creator_id` es `NOT NULL` en la definición de la tabla. Poner `SET NULL`
-- en la acción de borrado sin relajar esa restricción produciría un error en
-- tiempo de borrado en lugar de en tiempo de definición, que es peor: el
-- fallo aparecería solo cuando alguien intentara borrar la cuenta, no al
-- aplicar esta migración. Relajar `NOT NULL` en una tabla del feed social es
-- un cambio de otro alcance (afecta a qué puede mostrar la interfaz de un
-- grupo sin creador), así que se deja fuera de esta migración y se documenta
-- como deuda en el reporte.
-- ============================================================================

-- ─── organizations como raíz del tenant: RESTRICT explícito ───
ALTER TABLE public.roles
  DROP CONSTRAINT roles_org_id_fkey,
  ADD CONSTRAINT roles_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.candidates
  DROP CONSTRAINT candidates_org_id_fkey,
  ADD CONSTRAINT candidates_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.interviews
  DROP CONSTRAINT interviews_org_id_fkey,
  ADD CONSTRAINT interviews_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT user_profiles_org_id_fkey,
  ADD CONSTRAINT user_profiles_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.job_applications
  DROP CONSTRAINT job_applications_org_id_fkey,
  ADD CONSTRAINT job_applications_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

-- ─── user_profiles.user_id → auth.users: historial de la cuenta, RESTRICT ───
--
-- Distinto del resto de tablas que apuntan a auth.users (posts, connections,
-- messages, etc.), que ya usan CASCADE porque son contenido social del propio
-- usuario. `user_profiles` es el enrutamiento organización↔persona: si se
-- permite CASCADE aquí, borrar una cuenta de Supabase Auth borraría en
-- silencio la membresía de organización sin que ningún flujo de la
-- aplicación lo decida. El borrado de cuenta, si se implementa, debe pasar
-- primero por quitar a la persona de la organización explícitamente.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT user_profiles_user_id_fkey,
  ADD CONSTRAINT user_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ─── historial de contratación: RESTRICT, coherente con training_* ───
ALTER TABLE public.candidates
  DROP CONSTRAINT candidates_role_id_fkey,
  ADD CONSTRAINT candidates_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;

ALTER TABLE public.interviews
  DROP CONSTRAINT interviews_candidate_id_fkey,
  ADD CONSTRAINT interviews_candidate_id_fkey
    FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE RESTRICT;

-- ─── invitación pendiente no debe bloquear el borrado de quien invitó ───
ALTER TABLE public.team_invitations
  DROP CONSTRAINT team_invitations_invited_by_fkey,
  ADD CONSTRAINT team_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── groups.creator_id: RESTRICT documentado, ver razonamiento arriba ───
ALTER TABLE public.groups
  DROP CONSTRAINT groups_creator_id_fkey,
  ADD CONSTRAINT groups_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ============================================================================
-- VERIFICACIÓN MANUAL
-- ============================================================================
--
--   SELECT conrelid::regclass AS tabla, confdeltype, conname
--   FROM pg_constraint
--   WHERE contype = 'f' AND connamespace = 'public'::regnamespace
--     AND conname IN (
--       'roles_org_id_fkey', 'candidates_org_id_fkey', 'interviews_org_id_fkey',
--       'user_profiles_org_id_fkey', 'job_applications_org_id_fkey',
--       'user_profiles_user_id_fkey', 'candidates_role_id_fkey',
--       'interviews_candidate_id_fkey', 'team_invitations_invited_by_fkey',
--       'groups_creator_id_fkey'
--     );
--
-- Esperado: `confdeltype = 'r'` (RESTRICT) en las ocho primeras,
-- `confdeltype = 'n'` (SET NULL) en `team_invitations_invited_by_fkey`.
-- ============================================================================
