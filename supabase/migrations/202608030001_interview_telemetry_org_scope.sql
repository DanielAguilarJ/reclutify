-- ============================================================================
-- interview_telemetry: ámbito de organización
-- ============================================================================
--
-- POR QUÉ EXISTE ESTA MIGRACIÓN
--
-- `202608020002_close_permissive_read_policies.sql` eliminó la única política de
-- lectura de `interview_telemetry`, y con razón: era
--
--     FOR SELECT TO authenticated USING (true)
--
-- así que cualquier cuenta con sesión leía las filas de TODAS las
-- organizaciones, y esta tabla guarda `prompt_text`, que incrusta el CV
-- extraído del candidato — nombre, correo, teléfono e historial laboral.
--
-- Pero ese cierre dejó `/admin/telemetry` devolviendo cero filas, porque la
-- página consulta con el cliente de SESIÓN. El comentario que escribí en esa
-- migración afirmaba que leía con `service_role`, y era falso. Lo encontró una
-- auditoría independiente de las migraciones.
--
-- No se puede arreglar con una política y punto: la tabla NO TENÍA por dónde
-- filtrar. `session_id` y `role_title` son texto libre, no identificadores. Sin
-- una columna de organización, «leer solo lo mío» no era expresable, que es
-- exactamente lo que decía el comentario original al justificar que la única
-- política segura fuera ninguna.
--
-- Esta migración añade esa columna. El escritor es `/api/chat`, que ya
-- autoriza la petición y por tanto conoce la organización.
--
-- LAS FILAS ANTIGUAS SE QUEDAN EN `NULL` A PROPÓSITO
--
-- No hay de dónde deducir su organización sin adivinar por `role_title`, que es
-- texto que el reclutador escribió y puede repetirse entre organizaciones.
-- Adivinar aquí significaría enseñar el CV de un candidato a la empresa
-- equivocada, así que se quedan invisibles: son registros de depuración, no
-- datos de negocio.
--
-- SIGUE SIN HABER POLÍTICAS
--
-- El acceso pasa por `service_role` desde la página, que comprueba la
-- pertenencia a la organización en código antes de filtrar. Es el mismo
-- patrón que el resto de los endpoints que usan el cliente de administración, y
-- la razón es la misma: la comprobación tiene que poder distinguir «miembro con
-- rol suficiente» de «miembro», y eso no se expresa en una política sin
-- consultar `org_members` desde dentro de la propia política.
-- ============================================================================

ALTER TABLE public.interview_telemetry
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- El panel pide las últimas N filas de UNA organización, así que el índice lleva
-- las dos columnas en ese orden y `created_at` descendente para que el
-- `ORDER BY ... LIMIT` no ordene nada en tiempo de consulta.
CREATE INDEX IF NOT EXISTS idx_interview_telemetry_org_created
  ON public.interview_telemetry (org_id, created_at DESC);

COMMENT ON COLUMN public.interview_telemetry.org_id IS
  'Organizacion propietaria del turno. La rellena /api/chat, que ya resolvio la autorizacion. NULL en las filas anteriores a esta columna: no hay forma de deducirla sin adivinar, y adivinar mostraria el CV de un candidato a otra empresa, asi que quedan invisibles.';

COMMENT ON TABLE public.interview_telemetry IS
  'Telemetria de depuracion de los turnos de /api/chat. Contiene datos personales del candidato (CV extraido en prompt_text). RLS activo y SIN politicas: ni anon ni authenticated pueden leer ni escribir. La escribe /api/chat y la lee /admin/telemetry, ambos con service_role, y la lectura filtra por org_id tras comprobar la pertenencia en codigo.';

-- ============================================================================
-- VERIFICACIÓN MANUAL
-- ============================================================================
--
-- 1. La columna y el índice existen:
--
--      SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--      WHERE table_name = 'interview_telemetry' AND column_name = 'org_id';
--
--      SELECT indexname FROM pg_indexes
--      WHERE tablename = 'interview_telemetry';
--
-- 2. Sigue sin políticas, así que ni `anon` ni `authenticated` alcanzan la
--    tabla ni con la columna nueva:
--
--      SELECT policyname FROM pg_policies
--      WHERE schemaname = 'public' AND tablename = 'interview_telemetry';
--
--    Esperado: ninguna fila.
--
-- 3. Tras un turno de entrevista, la fila nueva trae organización:
--
--      SELECT org_id IS NOT NULL AS tiene_org, count(*)
--      FROM public.interview_telemetry
--      GROUP BY 1;
--
--    Esperado: `true` para lo insertado desde esta migración.
-- ============================================================================
