-- ============================================================================
-- 202608020002 — Cerrar tres fugas de lectura/escritura que quedaron abiertas
-- ============================================================================
--
-- Las tres se detectaron auditando el ESTADO FINAL del esquema (tras aplicar
-- todas las migraciones anteriores), no una migración aislada. Las anteriores
-- rondas de endurecimiento —`202607310001`, `202608010001`, `202608010006`—
-- retiraron políticas de ESCRITURA permisivas; estas tres son las que se
-- quedaron fuera de aquel barrido.
--
-- Cada bloque explica el alcance real de la fuga y por qué la corrección no
-- rompe ningún camino legítimo del producto.
-- ============================================================================


-- ─── 1. `interview_telemetry` — lectura entre organizaciones ─────────────────
--
-- LA FUGA
-- `20260507_interview_telemetry.sql:37` creó:
--
--     CREATE POLICY "Enable read access for authenticated users"
--       ON public.interview_telemetry
--       FOR SELECT TO authenticated USING (true);
--
-- `USING (true)` sin filtro por organización significa que CUALQUIER cuenta
-- autenticada puede leer TODAS las filas de TODAS las organizaciones. Y esta
-- tabla no guarda contadores: guarda `prompt_text` (el prompt completo de
-- `/api/chat`, que incrusta el CV extraído del candidato: nombre, correo,
-- teléfono, historial laboral y las banderas rojas detectadas),
-- `response_text`, `reasoning_text`, `candidate_name`, `role_title` y
-- `raw_payload`, que es el cuerpo ENTERO de la petición incluido `cvData`.
--
-- El registro de una cuenta es abierto (`/login` permite alta de candidato), así
-- que el requisito «estar autenticado» no acota nada: cualquiera podía crearse
-- una cuenta y descargar los CV y las transcripciones de los candidatos de todas
-- las empresas clientes.
--
-- `202608010006` retiró la política de INSERCIÓN de esta misma tabla, pero no la
-- de LECTURA, que es la que expone los datos.
--
-- POR QUÉ LA CORRECCIÓN NO ROMPE EL PANEL
-- El único consumidor de la tabla es `/admin/telemetry`
-- (`src/app/admin/telemetry/TelemetryDashboard.tsx`), que la carga a través de
-- `src/app/admin/telemetry/page.tsx`. Esa página es un Server Component que lee
-- con el cliente de servicio, no con la sesión del navegador, así que RLS no
-- interviene en su camino. Retirar la política deja la tabla sin lectura para
-- `anon` y `authenticated` y el panel sigue funcionando igual.
--
-- Se retira en lugar de reescribirse con un filtro por organización porque la
-- tabla NO tiene columna de organización: solo `session_id`, `candidate_name` y
-- `role_title`. Un filtro correcto exigiría añadir `org_id` y rellenarlo
-- retroactivamente, y mientras eso no exista la única política segura es
-- ninguna.
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.interview_telemetry;

COMMENT ON TABLE public.interview_telemetry IS
  'Telemetria de depuracion de los turnos de /api/chat. Contiene datos personales del candidato (CV extraido en prompt_text y raw_payload). RLS activo y SIN politicas: ni anon ni authenticated pueden leer ni escribir. La escribe /api/chat y la lee /admin/telemetry, ambos con service_role.';


-- ─── 2. `notifications` — inserción abierta, también para `anon` ─────────────
--
-- LA FUGA
-- `20260509_notifications.sql:16` creó:
--
--     CREATE POLICY "notif_insert" ON notifications
--       FOR INSERT WITH CHECK (true);
--
-- Sin cláusula `TO`, una política aplica a TODOS los roles, `anon` incluido. Y
-- la clave `anon` viaja al navegador en cada carga de página, así que cualquiera
-- —sin cuenta— podía insertar notificaciones con cualquier `user_id`, cualquier
-- `type`, cualquier `title`/`body` y cualquier `link`.
--
-- El impacto no es cosmético: `NotificationBell` pinta `title`, `body` y `link`
-- de cada fila, así que la fuga es un canal de phishing dentro del producto —un
-- aviso que parece del sistema y lleva a un enlace del atacante— dirigible a un
-- usuario concreto.
--
-- POR QUÉ LA CORRECCIÓN NO ROMPE LAS NOTIFICACIONES
-- Las notificaciones legítimas NO las inserta ningún cliente: las escriben
-- cuatro triggers `SECURITY DEFINER` de la propia base
-- (`notify_connection_request`, `notify_connection_accepted`,
-- `notify_post_reaction`, `notify_post_comment`, definidos en la misma
-- migración). `SECURITY DEFINER` ejecuta con los privilegios del propietario de
-- la función y no está sujeto a las políticas de la tabla, así que siguen
-- funcionando sin política de inserción.
--
-- Se comprobó que ninguna ruta ni server action del repositorio hace
-- `.from('notifications').insert(...)`: `src/app/actions/notifications.ts` solo
-- lee y marca como leídas.
DROP POLICY IF EXISTS "notif_insert" ON public.notifications;

COMMENT ON TABLE public.notifications IS
  'Avisos del feed social. RLS activo y SIN politica de insercion: las crean los triggers SECURITY DEFINER de 20260509_notifications.sql. Cada usuario solo lee, actualiza y borra las suyas.';


-- ─── 3. `organizations` — identificadores de facturación legibles por `anon` ──
--
-- LA FUGA
-- `20260510_company_pages.sql:12` creó:
--
--     CREATE POLICY "public_company_select" ON organizations
--       FOR SELECT TO anon, authenticated USING (true);
--
-- La intención era publicar la ficha de empresa (`/company/[slug]`) y el nombre
-- del empleador en las vacantes del portal. El efecto es que la tabla ENTERA es
-- pública, y desde `20260528_stripe_subscriptions.sql` esa tabla tiene
-- `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`,
-- `subscription_period_end`, `billing_interval` y `plan_tier`.
--
-- Es decir: con la clave anon que va en el bundle del navegador se podía
-- descargar la lista de clientes con su identificador de cliente de Stripe y el
-- estado de su suscripción —quién ha dejado de pagar (`past_due`), quién está en
-- prueba, cuándo vence cada contrato—. Es inteligencia comercial de la cartera
-- completa, y los identificadores de Stripe son entrada directa a la API de
-- facturación si alguna otra pieza los aceptara sin más comprobación.
--
-- POR QUÉ SE CORRIGE CON PERMISOS DE COLUMNA Y NO CON RLS
-- RLS filtra FILAS, no columnas: no existe una política que diga «esta fila sí,
-- pero sin estas seis columnas». La página pública necesita la fila, así que la
-- política se mantiene y lo que se retira es el permiso de SELECT sobre las
-- columnas sensibles, que es un mecanismo distinto (`GRANT`/`REVOKE` a nivel de
-- columna) y sí es column-level.
--
-- `plan_tier` NO se revoca: gobierna la marca blanca del encabezado
-- (`Logo forceWhiteLabel`) y lo leen `AdminSidebarNav`, `create-role` y
-- `/api/public-interview`, este último sin sesión. No es un dato sensible —dice
-- qué plan tiene la empresa, no cómo se le factura—.
--
-- QUÉ CÓDIGO HABÍA QUE CAMBIAR
-- Dos rutas leían las columnas revocadas con el cliente de sesión:
-- `/api/stripe/checkout` y `/api/stripe/portal`. Ambas pasan a leerlas con el
-- cliente de servicio en el mismo commit. Las dos ya resolvían la organización
-- desde el perfil del propio usuario autenticado —nunca desde el cuerpo de la
-- petición—, así que el cambio de cliente no relaja ninguna comprobación: la
-- identidad se sigue estableciendo con `auth.getUser()` antes de tocar la tabla.
--
-- `/admin/settings` también las pedía desde el navegador para decidir si mostrar
-- el botón del portal de facturación. Pasa a pedir solo los campos que pinta.
REVOKE SELECT (
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status,
  subscription_period_end,
  billing_interval
) ON public.organizations FROM anon, authenticated;

COMMENT ON COLUMN public.organizations.stripe_customer_id IS
  'Identificador de cliente en Stripe. SELECT revocado para anon y authenticated: solo lo leen /api/stripe/* y los webhooks con service_role.';

COMMENT ON COLUMN public.organizations.stripe_subscription_id IS
  'Identificador de suscripcion en Stripe. SELECT revocado para anon y authenticated.';


-- ─── 4. `search_path` en los triggers `SECURITY DEFINER` que faltaban ────────
--
-- `202607290004_set_function_search_path.sql` fijó `search_path` en las
-- funciones del centro de capacitación y de Stripe, pero dejó fuera los siete
-- triggers del feed social, que también son `SECURITY DEFINER`.
--
-- Una función `SECURITY DEFINER` sin `search_path` fijo resuelve los nombres sin
-- cualificar con el `search_path` de la sesión que dispara el trigger. Quien
-- pueda crear objetos en un esquema que preceda a `public` puede sustituir una
-- tabla o un operador por el suyo y ejecutarlo con los privilegios del
-- propietario de la función. Es el vector documentado en
-- https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY
--
-- `ALTER FUNCTION ... SET search_path` no reescribe el cuerpo: es idempotente y
-- no cambia el comportamiento de ninguna de las siete. Se aplica solo si la
-- función existe, para que la migración no falle en una base donde alguna no se
-- haya creado.
DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.notify_connection_request()',
    'public.notify_connection_accepted()',
    'public.notify_post_reaction()',
    'public.notify_post_comment()',
    'public.update_follow_counts()',
    'public.update_group_member_count()',
    'public.process_post_hashtags()',
    'public.update_conversation_last_message()',
    'public.update_connection_counts()'
  ]
  LOOP
    -- `to_regprocedure` devuelve NULL en vez de lanzar cuando la función no
    -- existe, así que sirve de comprobación de existencia sin envolver cada
    -- caso en su propio bloque de excepción.
    IF to_regprocedure(v_signature) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %L', v_signature, 'public, pg_temp');
    END IF;
  END LOOP;
END;
$$;


-- ============================================================================
-- VERIFICACIÓN MANUAL
-- ============================================================================
--
-- 1. Ninguna política de lectura en `interview_telemetry` y ninguna de
--    inserción en `notifications`:
--
--      SELECT tablename, policyname, cmd, roles
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename IN ('interview_telemetry', 'notifications')
--      ORDER BY tablename, policyname;
--
--    Esperado: `interview_telemetry` sin filas; `notifications` solo con
--    `notif_own_select`, `notif_own_update` y `notif_own_delete`.
--
-- 2. La clave anon no puede leer los identificadores de Stripe:
--
--      curl -s "$SUPABASE_URL/rest/v1/organizations?select=stripe_customer_id&limit=1" \
--        -H "apikey: $SUPABASE_ANON_KEY"
--
--    Esperado: error `42501` (permiso denegado para la columna), no una fila.
--
-- 3. La ficha pública de empresa sigue funcionando:
--
--      curl -s "$SUPABASE_URL/rest/v1/organizations?select=name,slug,logo_url,description&limit=1" \
--        -H "apikey: $SUPABASE_ANON_KEY"
--
--    Esperado: la fila, con normalidad.
--
-- 4. Los triggers del feed conservan su `search_path`:
--
--      SELECT p.proname, p.proconfig
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.prosecdef
--      ORDER BY p.proname;
--
--    Esperado: `proconfig` con `search_path=public, pg_temp` en las nueve.
--
-- REVERSIÓN (solo si algo del producto dependía de estas aperturas):
--
--   CREATE POLICY "Enable read access for authenticated users"
--     ON public.interview_telemetry FOR SELECT TO authenticated USING (true);
--   CREATE POLICY "notif_insert" ON public.notifications
--     FOR INSERT WITH CHECK (true);
--   GRANT SELECT (stripe_customer_id, stripe_subscription_id, subscription_status,
--                 subscription_period_end, billing_interval)
--     ON public.organizations TO anon, authenticated;
-- ============================================================================
