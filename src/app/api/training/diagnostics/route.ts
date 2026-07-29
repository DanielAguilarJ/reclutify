import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  requireAuthenticatedUser,
  requireOrgAdmin,
} from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import {
  buildTrainingDiagnostics,
  collectTrainingEnvironment,
} from '@/lib/training/diagnostics';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

/**
 * GET /api/training/diagnostics
 * GET /api/training/diagnostics?orgId={uuid}
 *
 * Reporte del estado del entorno de capacitación: tablas, nulabilidad de
 * columnas, funciones, bucket de storage, índices y variables de entorno.
 *
 * La respuesta revela estructura interna de la base de datos, así que la ruta
 * exige un usuario autenticado con rol `owner` o `admin` en la organización
 * consultada. No hay ningún camino que rodee esa comprobación:
 * `requireOrgAdmin` se ejecuta antes de cualquier recolección.
 */

const orgIdSchema = z.string().uuid();

type OrgIdResolution =
  | { ok: true; orgId: string }
  | { ok: false; response: NextResponse };

/**
 * `orgId` es opcional para que la interfaz pueda diagnosticar sin conocer el
 * identificador. Cuando falta, se resuelve desde `user_profiles.org_id` del
 * usuario autenticado. La autorización posterior no cambia.
 */
async function resolveOrgId(
  requestedOrgId: string | null,
): Promise<OrgIdResolution> {
  if (requestedOrgId !== null) {
    const parsed = orgIdSchema.safeParse(requestedOrgId);

    if (!parsed.success) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Invalid orgId' },
          { status: 400 },
        ),
      };
    }

    return { ok: true, orgId: parsed.data };
  }

  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();

  const { data: profile, error } = await admin
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error(
      '[training/diagnostics] Profile organization query failed:',
      error,
    );

    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Could not resolve the active organization' },
        { status: 500 },
      ),
    };
  }

  const orgId = profile?.org_id;

  if (typeof orgId !== 'string' || orgId.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'No organization is associated with this account. Pass orgId as a query parameter or complete the organization setup.',
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, orgId };
}

export async function GET(req: NextRequest) {
  try {
    const resolution = await resolveOrgId(
      req.nextUrl.searchParams.get('orgId'),
    );

    if (!resolution.ok) {
      return resolution.response;
    }

    // Lanza TrainingAuthError: 401 sin sesión, 403 sin rol owner/admin.
    const { membership, admin } = await requireOrgAdmin(resolution.orgId);

    // RPC preferente, con respaldo al sondeo cuando la función de reporte aún
    // no existe. `source` indica cuál de las dos estrategias se usó.
    const collection = await collectTrainingEnvironment(admin);
    const diagnostics = buildTrainingDiagnostics(collection);

    return NextResponse.json({
      ok: diagnostics.ok,
      source: diagnostics.source,
      env: diagnostics.env,
      // Hace explicable un 403 en el resto del módulo: el reporte incluye la
      // membresía real del usuario que consulta.
      membership: { role: membership.role },
      checks: diagnostics.checks,
      summary: diagnostics.summary,
    });
  } catch (error: unknown) {
    return trainingApiErrorResponse(
      error,
      '[training/diagnostics] Unexpected failure',
    );
  }
}
