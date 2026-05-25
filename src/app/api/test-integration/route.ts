import { NextResponse } from 'next/server';
import * as crypto from 'crypto';

interface TestIntegrationRequest {
  type: 'webhook' | 'google_sheets' | 'hubspot' | 'notion';
  config: Record<string, unknown>;
}

interface TestResult {
  success: boolean;
  message: string;
  statusCode?: number;
}

// ─── Webhook Test ───

async function testWebhook(config: {
  url: string;
  secret: string;
  events: string[];
}): Promise<TestResult> {
  const { url, secret } = config;

  if (!url) {
    return { success: false, message: 'URL del webhook es requerida.' };
  }

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

  if (secret) {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
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
      message: `El servidor respondió con status ${response.status}: ${response.statusText}`,
      statusCode: response.status,
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { success: false, message: 'Timeout: El servidor no respondió en 10 segundos.' };
    }
    return { success: false, message: `Error de conexión: ${error.message}` };
  }
}

// ─── Google Sheets Test ───

async function testGoogleSheets(config: {
  spreadsheet_id: string;
  credentials: string;
  sheet_name: string;
}): Promise<TestResult> {
  const { spreadsheet_id, credentials, sheet_name } = config;

  if (!spreadsheet_id || !credentials) {
    return { success: false, message: 'Spreadsheet ID y credenciales son requeridos.' };
  }

  let serviceAccount: { client_email: string; private_key: string };
  try {
    serviceAccount = JSON.parse(credentials);
  } catch {
    return { success: false, message: 'Las credenciales no son un JSON válido.' };
  }

  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    return { success: false, message: 'Las credenciales deben incluir client_email y private_key.' };
  }

  // Generate JWT for Google API authentication
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' })
    ).toString('base64url');

    const payload = Buffer.from(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })
    ).toString('base64url');

    const signInput = `${header}.${payload}`;

    // Sign with private key
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');

    const jwt = `${signInput}.${signature}`;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return {
        success: false,
        message: `Error de autenticación con Google: ${errText}`,
        statusCode: tokenRes.status,
      };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Append test row
    const sheetName = sheet_name || 'Leads';
    const range = `${sheetName}!A:E`;
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const testRow = {
      values: [
        [
          new Date().toISOString(),
          'Test Lead (Reclutify)',
          'test@reclutify.com',
          '+52 555 000 0000',
          'PRUEBA - Puede eliminar esta fila',
        ],
      ],
    };

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testRow),
      signal: AbortSignal.timeout(10000),
    });

    if (appendRes.ok) {
      return {
        success: true,
        message: `Fila de prueba agregada exitosamente a "${sheetName}".`,
        statusCode: appendRes.status,
      };
    }

    const appendErr = await appendRes.text();
    return {
      success: false,
      message: `Error al escribir en Google Sheets: ${appendErr}`,
      statusCode: appendRes.status,
    };
  } catch (err) {
    const error = err as Error;
    return { success: false, message: `Error: ${error.message}` };
  }
}

// ─── HubSpot Test ───

async function testHubspot(config: {
  api_key: string;
  pipeline_id: string;
}): Promise<TestResult> {
  const { api_key } = config;

  if (!api_key) {
    return { success: false, message: 'Private App Token es requerido.' };
  }

  try {
    // Create a test contact
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${api_key}`,
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
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      // Try to delete the test contact to keep things clean
      try {
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${data.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${api_key}` },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Non-critical: test contact may remain
      }
      return {
        success: true,
        message: 'Conexión con HubSpot exitosa. Contacto de prueba creado y eliminado.',
        statusCode: response.status,
      };
    }

    // Handle 409 conflict (contact already exists) as partial success
    if (response.status === 409) {
      return {
        success: true,
        message: 'Conexión con HubSpot exitosa. El contacto de prueba ya existía (esto es normal).',
        statusCode: 409,
      };
    }

    const errText = await response.text();
    return {
      success: false,
      message: `HubSpot respondió con error ${response.status}: ${errText}`,
      statusCode: response.status,
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { success: false, message: 'Timeout: HubSpot no respondió en 10 segundos.' };
    }
    return { success: false, message: `Error de conexión: ${error.message}` };
  }
}

// ─── Notion Test ───

async function testNotion(config: {
  token: string;
  database_id: string;
}): Promise<TestResult> {
  const { token, database_id } = config;

  if (!token || !database_id) {
    return { success: false, message: 'Integration Token y Database ID son requeridos.' };
  }

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id },
        properties: {
          Name: {
            title: [
              {
                text: {
                  content: `[TEST] Reclutify - ${new Date().toISOString()}`,
                },
              },
            ],
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json();
      // Try to archive the test page
      try {
        await fetch(`https://api.notion.com/v1/pages/${data.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({ archived: true }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Non-critical: test page may remain
      }
      return {
        success: true,
        message: 'Conexión con Notion exitosa. Página de prueba creada y archivada.',
        statusCode: response.status,
      };
    }

    const errText = await response.text();
    return {
      success: false,
      message: `Notion respondió con error ${response.status}: ${errText}`,
      statusCode: response.status,
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { success: false, message: 'Timeout: Notion no respondió en 10 segundos.' };
    }
    return { success: false, message: `Error de conexión: ${error.message}` };
  }
}

// ─── Route Handler ───

export async function POST(req: Request) {
  try {
    const body: TestIntegrationRequest = await req.json();
    const { type, config } = body;

    if (!type || !config) {
      return NextResponse.json(
        { success: false, message: 'Tipo de integración y configuración son requeridos.' },
        { status: 400 }
      );
    }

    let result: TestResult;

    switch (type) {
      case 'webhook':
        result = await testWebhook(config as Parameters<typeof testWebhook>[0]);
        break;
      case 'google_sheets':
        result = await testGoogleSheets(config as Parameters<typeof testGoogleSheets>[0]);
        break;
      case 'hubspot':
        result = await testHubspot(config as Parameters<typeof testHubspot>[0]);
        break;
      case 'notion':
        result = await testNotion(config as Parameters<typeof testNotion>[0]);
        break;
      default:
        result = { success: false, message: `Tipo de integración desconocido: ${type}` };
    }

    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err) {
    const error = err as Error;
    return NextResponse.json(
      { success: false, message: `Error interno: ${error.message}` },
      { status: 500 }
    );
  }
}
