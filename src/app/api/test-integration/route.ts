import { NextResponse, type NextRequest } from 'next/server';
import * as crypto from 'node:crypto';

import { requireOrgMembership } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { assertSafeOutboundUrl } from '@/lib/api/outbound-url';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { testIntegrationRequestSchema, type TestIntegrationRequest } from '@/lib/schemas/api';

/**
 * POST /api/test-integration — prueba las integraciones del panel del asesor.
 *
 * QUÉ ESTABA MAL
 * --------------
 * La ruta no exigía sesión y su primer caso hacía esto:
 *
 *     const { url, secret } = config;
 *     const response = await fetch(url, { method: 'POST', headers, body });
 *     return { success: response.ok, message: `...Status: ${response.status}`, statusCode: response.status };
 *
 * Es un **SSRF completo, anónimo y con oráculo**. El servidor hacía la petición
 * desde dentro de la red del despliegue y devolvía al llamante el código de
 * estado y el cuerpo del error. Con eso se podía:
 *
 *  - Leer el servicio de metadatos de la plataforma (`169.254.169.254`), que en
 *    varios proveedores entrega credenciales temporales de la instancia.
 *  - Enumerar la red interna usando el estado y la latencia como señal
 *    (`http://10.0.0.5:6379`, `http://localhost:5432`).
 *  - Alcanzar servicios internos que autorizan por origen de red.
 *
 * Los otros tres casos (Google Sheets, HubSpot, Notion) no son SSRF —la URL es
 * fija— pero sí eran **oráculos de credenciales anónimos**: permitían a cualquiera
 * validar contra nuestro servidor si un token de HubSpot o de Notion robado sigue
 * siendo válido, y de paso escribir filas de prueba en la hoja o la base de datos
 * de un tercero.
 *
 * CÓMO SE CIERRA
 * --------------
 *  1. **Sesión de organización obligatoria.** El único llamante real es
 *     `/coach/settings`, una pantalla autenticada.
 *  2. **`assertSafeOutboundUrl`** para el caso `webhook`: exige HTTPS, puerto
 *     estándar y que el nombre no resuelva a ningún rango no enrutable.
 *  3. **Los cuerpos de error de los proveedores ya no se devuelven al cliente.**
 *     Antes se interpolaban tal cual (`Error al escribir en Google Sheets:
 *     ${appendErr}`), lo que convertía la respuesta en un canal de lectura de lo
 *     que dijera el destino. Ahora el detalle va al log y el cliente recibe un
 *     mensaje accionable pero sin contenido ajeno.
 *  4. **Tope de tasa**, para que la ruta no sirva de motor de fuerza bruta.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Resultado que ve el panel. */
interface TestResult {
  success: boolean;
  message: string;
  statusCode?: number;
}

/** Tope de tiempo de cada llamada saliente. */
const OUTBOUND_TIMEOUT_MS = 10_000;

/**
 * Traduce un fallo de red a un mensaje para el panel.
 *
 * El mensaje del error se registra pero no se devuelve: en un `fetch` fallido
 * contiene el host y el puerto del destino, que es justo la información que el
 * oráculo de red buscaba.
 */
function describeNetworkFailure(error: unknown, context: string): TestResult {
  console.warn(`${context} outbound request failed:`, error);

  const name = error instanceof Error ? error.name : '';

  if (name === 'AbortError' || name === 'TimeoutError') {
    return { success: false, message: 'Timeout: el destino no respondió en 10 segundos.' };
  }

  return {
    success: false,
    message: 'No se pudo conectar con el destino. Verifica la configuración e inténtalo de nuevo.',
  };
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

async function testWebhook(
  config: Extract<TestIntegrationRequest, { type: 'webhook' }>['config'],
): Promise<TestResult> {
  // Se valida el destino ANTES de construir nada: un destino no permitido se
  // rechaza sin firmar ninguna carga ni abrir ninguna conexión.
  const { url } = await assertSafeOutboundUrl(config.url, '[test-integration/webhook]');

  const samplePayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: {
      lead_id: 'test-lead-001',
      name: 'Test Lead',
      email: 'test@reclutify.com',
      phone: '+52 555 000 0000',
      course: 'Curso de Prueba',
      status: 'new',
      score: 85,
    },
  };

  const body = JSON.stringify(samplePayload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Reclutify-Webhook/1.0',
  };

  if (config.secret) {
    headers['X-Webhook-Signature'] = `sha256=${crypto
      .createHmac('sha256', config.secret)
      .update(body)
      .digest('hex')}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      // Sin seguir redirecciones: un `302` hacia `http://169.254.169.254`
      // eludiría la validación del destino, que solo se hizo sobre la URL inicial.
      redirect: 'manual',
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });

    if (response.ok) {
      return {
        success: true,
        message: `Webhook enviado exitosamente. Status: ${response.status}`,
        statusCode: response.status,
      };
    }

    return {
      success: false,
      message: `El destino respondió con status ${response.status}.`,
      statusCode: response.status,
    };
  } catch (error) {
    return describeNetworkFailure(error, '[test-integration/webhook]');
  }
}

// ─── Google Sheets ───────────────────────────────────────────────────────────

async function testGoogleSheets(
  config: Extract<TestIntegrationRequest, { type: 'google_sheets' }>['config'],
): Promise<TestResult> {
  let serviceAccount: { client_email?: unknown; private_key?: unknown };

  try {
    serviceAccount = JSON.parse(config.credentials) as typeof serviceAccount;
  } catch {
    return { success: false, message: 'Las credenciales no son un JSON válido.' };
  }

  const clientEmail = typeof serviceAccount.client_email === 'string' ? serviceAccount.client_email : '';
  const privateKey = typeof serviceAccount.private_key === 'string' ? serviceAccount.private_key : '';

  if (!clientEmail || !privateKey) {
    return {
      success: false,
      message: 'Las credenciales deben incluir client_email y private_key.',
    };
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      }),
    ).toString('base64url');

    const signInput = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const jwt = `${signInput}.${sign.sign(privateKey, 'base64url')}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });

    if (!tokenRes.ok) {
      // El cuerpo de Google va al log: puede nombrar el proyecto y la cuenta de
      // servicio, que no son datos que el panel necesite mostrar.
      console.warn(
        '[test-integration/google_sheets] token exchange failed:',
        tokenRes.status,
        await tokenRes.text().catch(() => '(unreadable)'),
      );

      return {
        success: false,
        message:
          'Google rechazó las credenciales. Verifica que la cuenta de servicio sea válida y tenga la API de Sheets habilitada.',
        statusCode: tokenRes.status,
      };
    }

    const tokenData = (await tokenRes.json()) as { access_token?: unknown };
    const accessToken = typeof tokenData.access_token === 'string' ? tokenData.access_token : '';

    if (!accessToken) {
      return { success: false, message: 'Google no devolvió un token de acceso utilizable.' };
    }

    const sheetName = config.sheet_name || 'Leads';
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      config.spreadsheet_id,
    )}/values/${encodeURIComponent(`${sheetName}!A:E`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [
          [
            new Date().toISOString(),
            'Test Lead (Reclutify)',
            'test@reclutify.com',
            '+52 555 000 0000',
            'PRUEBA - Puede eliminar esta fila',
          ],
        ],
      }),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });

    if (appendRes.ok) {
      return {
        success: true,
        message: `Fila de prueba agregada exitosamente a "${sheetName}".`,
        statusCode: appendRes.status,
      };
    }

    console.warn(
      '[test-integration/google_sheets] append failed:',
      appendRes.status,
      await appendRes.text().catch(() => '(unreadable)'),
    );

    return {
      success: false,
      message:
        'No se pudo escribir en la hoja. Verifica el ID del documento, el nombre de la pestaña y que la cuenta de servicio tenga permiso de edición.',
      statusCode: appendRes.status,
    };
  } catch (error) {
    return describeNetworkFailure(error, '[test-integration/google_sheets]');
  }
}

// ─── HubSpot ─────────────────────────────────────────────────────────────────

async function testHubspot(
  config: Extract<TestIntegrationRequest, { type: 'hubspot' }>['config'],
): Promise<TestResult> {
  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          email: 'test@reclutify.com',
          firstname: 'Reclutify',
          lastname: 'Test Contact',
          company: 'Reclutify (Test)',
          phone: '+52 555 000 0000',
        },
      }),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });

    if (response.ok) {
      const data = (await response.json()) as { id?: unknown };

      // Limpieza del contacto de prueba. Su fallo no cambia el veredicto: la
      // conexión ya quedó demostrada.
      if (typeof data.id === 'string') {
        try {
          await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(data.id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${config.api_key}` },
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          console.warn('[test-integration/hubspot] test contact cleanup failed');
        }
      }

      return {
        success: true,
        message: 'Conexión con HubSpot exitosa. Contacto de prueba creado y eliminado.',
        statusCode: response.status,
      };
    }

    if (response.status === 409) {
      return {
        success: true,
        message: 'Conexión con HubSpot exitosa. El contacto de prueba ya existía (esto es normal).',
        statusCode: 409,
      };
    }

    console.warn(
      '[test-integration/hubspot] request failed:',
      response.status,
      await response.text().catch(() => '(unreadable)'),
    );

    return {
      success: false,
      message: `HubSpot rechazó la petición (status ${response.status}). Verifica el Private App Token y sus permisos.`,
      statusCode: response.status,
    };
  } catch (error) {
    return describeNetworkFailure(error, '[test-integration/hubspot]');
  }
}

// ─── Notion ──────────────────────────────────────────────────────────────────

async function testNotion(
  config: Extract<TestIntegrationRequest, { type: 'notion' }>['config'],
): Promise<TestResult> {
  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: config.database_id },
        properties: {
          Name: {
            title: [{ text: { content: `[TEST] Reclutify - ${new Date().toISOString()}` } }],
          },
        },
      }),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    });

    if (response.ok) {
      const data = (await response.json()) as { id?: unknown };

      if (typeof data.id === 'string') {
        try {
          await fetch(`https://api.notion.com/v1/pages/${encodeURIComponent(data.id)}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${config.token}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({ archived: true }),
            signal: AbortSignal.timeout(5_000),
          });
        } catch {
          console.warn('[test-integration/notion] test page cleanup failed');
        }
      }

      return {
        success: true,
        message: 'Conexión con Notion exitosa. Página de prueba creada y archivada.',
        statusCode: response.status,
      };
    }

    console.warn(
      '[test-integration/notion] request failed:',
      response.status,
      await response.text().catch(() => '(unreadable)'),
    );

    return {
      success: false,
      message: `Notion rechazó la petición (status ${response.status}). Verifica el token y que la base de datos esté compartida con la integración.`,
      statusCode: response.status,
    };
  } catch (error) {
    return describeNetworkFailure(error, '[test-integration/notion]');
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await requireOrgMembership();

    await enforceRateLimit(req, RATE_LIMITS.AI_GENERATE, orgId);

    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    // La unión discriminada rechaza un `type` desconocido en la validación, así
    // que ya no hace falta el `default` del `switch` que confirmaba qué tipos
    // existen.
    const body = testIntegrationRequestSchema.parse(rawBody);

    const result: TestResult =
      body.type === 'webhook'
        ? await testWebhook(body.config)
        : body.type === 'google_sheets'
          ? await testGoogleSheets(body.config)
          : body.type === 'hubspot'
            ? await testHubspot(body.config)
            : await testNotion(body.config);

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    return handleApiError(error, '[test-integration]');
  }
}
