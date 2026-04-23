-- ============================================================
-- Migración 00004: Soporte para multi-organización
-- Agrega tabla org_members para relación many-to-many user↔org
-- y actualiza las políticas RLS para soportar múltiples orgs
-- ============================================================

-- ─── 1. TABLA: org_members ───
-- Relación many-to-many entre usuarios y organizaciones.
-- Permite que un usuario pertenezca a múltiples organizaciones.
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.org_members(org_id);

-- ─── 2. RLS para org_members ───
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden ver sus propias membresías
CREATE POLICY "users_view_own_memberships" ON public.org_members
  FOR SELECT USING (user_id = auth.uid());

-- Los usuarios pueden insertar su propia membresía (durante onboarding)
CREATE POLICY "users_insert_own_membership" ON public.org_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Los owners/admins pueden invitar miembros a sus orgs
CREATE POLICY "admins_insert_org_members" ON public.org_members
  FOR INSERT TO authenticated WITH CHECK (
    org_id IN (
      SELECT om.org_id FROM public.org_members om 
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- Los owners pueden eliminar miembros de sus orgs
CREATE POLICY "owners_delete_org_members" ON public.org_members
  FOR DELETE USING (
    org_id IN (
      SELECT om.org_id FROM public.org_members om 
      WHERE om.user_id = auth.uid() AND om.role = 'owner'
    )
    OR user_id = auth.uid() -- Un usuario puede eliminarse a sí mismo
  );

-- ─── 3. Actualizar política de organizations ───
-- Permitir SELECT a miembros tanto de user_profiles como de org_members
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
CREATE POLICY "Users can view their own organization" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
    OR id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())
  );

-- Actualizar UPDATE policy también
DROP POLICY IF EXISTS "Users can update their own organization" ON organizations;
CREATE POLICY "Users can update their own organization" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM user_profiles WHERE user_id = auth.uid()
    )
    OR id IN (
      SELECT org_id FROM org_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ─── 4. Migrar datos existentes ───
-- Copiar relaciones existentes de user_profiles a org_members
-- para que todos los usuarios actuales tengan membresía explícita
INSERT INTO public.org_members (user_id, org_id, role)
SELECT user_id, org_id, role
FROM public.user_profiles
WHERE org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;
