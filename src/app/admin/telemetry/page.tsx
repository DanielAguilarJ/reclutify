import { redirect } from 'next/navigation';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

import TelemetryDashboard from './TelemetryDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Filas que se traen al panel. Es depuración, no un informe: con las últimas basta. */
const TELEMETRY_PAGE_SIZE = 200;

/**
 * Panel de telemetría de los turnos de `/api/chat`.
 *
 * POR QUÉ LEE CON EL CLIENTE DE ADMINISTRACIÓN Y COMPRUEBA LA ORGANIZACIÓN A MANO
 * ------------------------------------------------------------------------------
 * `interview_telemetry` tiene RLS activo y NINGUNA política, así que el cliente de sesión no
 * alcanza ni una fila. Es deliberado: la política anterior era
 *
 *     FOR SELECT TO authenticated USING (true)
 *
 * y esta tabla guarda `prompt_text`, que incrusta el CV extraído del candidato —nombre, correo,
 * teléfono e historial laboral—, así que cualquier cuenta con sesión leía los CV de todas las
 * organizaciones. Se cerró en `202608020002`.
 *
 * Esa migración, sin embargo, dejó esta página devolviendo cero filas en silencio, porque seguía
 * consultando con el cliente de sesión: RLS sin políticas no da error, devuelve vacío. Lo encontró
 * una auditoría independiente de las migraciones.
 *
 * La corrección completa fue estructural. La tabla no tenía por dónde filtrar —`session_id` y
 * `role_title` son texto libre— así que `202608030001` le añadió `org_id`, `/api/chat` lo rellena
 * desde la autorización que ya hizo, y aquí se filtra por la organización de quien mira.
 *
 * ANTES TAMPOCO COMPROBABA EL ROL
 * -------------------------------
 * La versión previa solo exigía que hubiera sesión (`if (!user) redirect`). Cualquier cuenta
 * autenticada —incluido un candidato— veía el panel. Ahora hace falta pertenecer a una
 * organización.
 */
export default async function TelemetryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // La organización se resuelve con el cliente de SESIÓN: así RLS sigue garantizando que nadie
  // puede leer el perfil de otra persona, y el cliente de administración solo se usa después,
  // para la tabla que RLS no puede filtrar.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const orgId = profile?.org_id;

  if (!orgId) {
    // Sin organización no hay telemetría que mostrar, y el panel es de empresa. Se manda al
    // panel general en lugar de enseñar una pantalla vacía sin explicación.
    redirect('/admin');
  }

  const admin = createAdminClient();

  const { data: logs, error } = await admin
    .from('interview_telemetry')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(TELEMETRY_PAGE_SIZE);

  if (error) {
    console.error('[telemetry] fetch failed:', error.message);
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">AI Telemetry Dashboard</h1>
        <p className="text-muted text-sm mt-1">
          Real-time logs of AI reasoning, token usage, and latency during interviews. Click any row
          to inspect.
        </p>
      </div>

      <TelemetryDashboard initialLogs={logs ?? []} />
    </div>
  );
}
