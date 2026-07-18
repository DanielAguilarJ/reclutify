-- ============================================================
-- Training Center V2 — correcciones de acceso detectadas en QA
--
-- 1. El dashboard admin (navegador, rol authenticated) embebe
--    training_module_documents al cargar módulos, pero la migración
--    202607180001 revocó TODO el acceso a esa tabla sin crear una
--    política de lectura. Resultado: 42501 permission denied y la
--    página /admin/training cae al estado de error en cuanto la
--    organización tiene un programa. Se restaura lectura solo para
--    admins de la organización dueña del módulo.
--
-- 2. /training/center/layout.tsx permite que un empleado autenticado
--    lea su propia fila de training_employees; la política V1 que lo
--    permitía (user_id = auth.uid()) se eliminó en la 202607180001
--    sin reemplazo, expulsando a empleados legítimos. Se restaura la
--    lectura de la propia fila (solo SELECT; las escrituras siguen
--    pasando por APIs server-side).
--
-- 3. El backfill de 00004_multi_org_support copió org_members.role
--    desde user_profiles.role (default 'member'), dejando a dueños
--    de organizaciones pre-multi-org sin rol owner/admin y por tanto
--    bloqueados (403) en todas las APIs de training. Se promueve a
--    'owner' al empleador de cada organización que no tenga ningún
--    owner/admin.
-- ============================================================

BEGIN;

-- 1. Lectura de vínculos módulo-documento para admins
GRANT SELECT ON TABLE public.training_module_documents TO authenticated;

DROP POLICY IF EXISTS "Training admins can read module documents"
  ON public.training_module_documents;

CREATE POLICY "Training admins can read module documents"
ON public.training_module_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.training_modules module
    JOIN public.training_programs program
      ON program.id = module.program_id
    WHERE module.id = training_module_documents.module_id
      AND public.is_training_admin(program.org_id)
  )
);

-- 2. Lectura de la propia fila de empleado
DROP POLICY IF EXISTS "Employees can read own training record"
  ON public.training_employees;

CREATE POLICY "Employees can read own training record"
ON public.training_employees
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. Rescate de dueños de organizaciones sin owner/admin
UPDATE public.org_members membership
SET role = 'owner'
FROM public.user_profiles profile
WHERE membership.user_id = profile.user_id
  AND membership.org_id = profile.org_id
  AND membership.role = 'member'
  AND profile.user_type = 'employer'
  AND NOT EXISTS (
    SELECT 1
    FROM public.org_members other
    WHERE other.org_id = membership.org_id
      AND other.role IN ('owner', 'admin')
  );

COMMIT;
