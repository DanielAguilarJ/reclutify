// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  REDACTED_PLACEHOLDER,
  isRedactedPlaceholder,
  mergeIntegrationSecrets,
  redactIntegrationSecrets,
} from '@/lib/coach/integration-secrets';

/**
 * Pruebas de la redacción de secretos de integraciones.
 *
 * QUÉ FIJAN
 * ---------
 * `coach_settings.integrations` guarda credenciales de TERCEROS: el JSON de una cuenta de
 * servicio de Google con su clave privada, el Private App Token de HubSpot, el token de
 * Notion y el secreto de firma del webhook. El store las leía con `select('*')` desde el
 * navegador.
 *
 * Las dos propiedades que hacen que la corrección sea segura Y no destructiva:
 *
 *  1. **Ningún secreto sale.** Ni completo, ni truncado, ni como prefijo. Un secreto
 *     parcial sigue siendo material útil para un atacante.
 *  2. **Guardar sin tocar nada no destruye la credencial.** Como la interfaz recibe un
 *     marcador, al guardar volvería a subirlo; sin la recomposición, el usuario
 *     sobrescribiría su clave real con la cadena `'__SAVED__'` y rompería su propia
 *     integración por pulsar «Guardar».
 */

/** Configuración con las cuatro credenciales reales. */
const storedIntegrations = {
  webhook: {
    enabled: true,
    url: 'https://hooks.example.com/abc',
    secret: 'whsec_secreto_de_firma_ficticio',
    events: ['interview.completed'],
  },
  google_sheets: {
    enabled: true,
    spreadsheet_id: '1AbCdEf',
    credentials: '{"client_email":"svc@proyecto.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----FICTICIA-----END PRIVATE KEY-----"}',
    sheet_name: 'Leads',
  },
  hubspot: { enabled: true, api_key: 'pat-na1-token-ficticio', pipeline_id: 'default' },
  notion: { enabled: false, token: 'secret_token_ficticio', database_id: 'db-1' },
};

describe('redactIntegrationSecrets', () => {
  it('sustituye las cuatro credenciales por el marcador', () => {
    const redacted = redactIntegrationSecrets(storedIntegrations);

    expect((redacted.webhook as Record<string, unknown>).secret).toBe(REDACTED_PLACEHOLDER);
    expect((redacted.google_sheets as Record<string, unknown>).credentials).toBe(REDACTED_PLACEHOLDER);
    expect((redacted.hubspot as Record<string, unknown>).api_key).toBe(REDACTED_PLACEHOLDER);
    expect((redacted.notion as Record<string, unknown>).token).toBe(REDACTED_PLACEHOLDER);
  });

  it('NINGÚN fragmento del secreto sobrevive a la serialización', () => {
    const serialized = JSON.stringify(redactIntegrationSecrets(storedIntegrations));

    // Se comprueba sobre el JSON completo y no campo a campo: es la forma en que el valor
    // viajaría al navegador, así que es donde importa que no esté.
    expect(serialized).not.toContain('whsec_');
    expect(serialized).not.toContain('pat-na1');
    expect(serialized).not.toContain('secret_token');
    expect(serialized).not.toContain('PRIVATE KEY');
    expect(serialized).not.toContain('gserviceaccount');
    // Ni siquiera un prefijo: un secreto parcial sigue siendo material útil.
    expect(serialized).not.toContain('whsec');
  });

  it('conserva la configuración que la interfaz SÍ necesita', () => {
    const redacted = redactIntegrationSecrets(storedIntegrations);

    // Sin esto la pantalla de ajustes se quedaría vacía y el asesor tendría que volver a
    // escribir la URL y los identificadores, que no son secretos.
    expect(redacted.webhook).toMatchObject({
      enabled: true,
      url: 'https://hooks.example.com/abc',
      events: ['interview.completed'],
    });
    expect(redacted.google_sheets).toMatchObject({ spreadsheet_id: '1AbCdEf', sheet_name: 'Leads' });
    expect(redacted.hubspot).toMatchObject({ pipeline_id: 'default' });
    expect(redacted.notion).toMatchObject({ enabled: false, database_id: 'db-1' });
  });

  it('distingue «sin credencial» de «credencial guardada»', () => {
    const redacted = redactIntegrationSecrets({
      hubspot: { enabled: false, api_key: '', pipeline_id: '' },
    });

    // Vacío se queda vacío: la interfaz muestra el formulario en blanco en vez de
    // «Conectado», que sería mentir sobre el estado de la integración.
    expect((redacted.hubspot as Record<string, unknown>).api_key).toBe('');
  });

  it('tolera formas inesperadas sin lanzar', () => {
    expect(redactIntegrationSecrets(null)).toEqual({});
    expect(redactIntegrationSecrets('texto')).toEqual({});
    expect(redactIntegrationSecrets({ hubspot: null })).toEqual({ hubspot: null });
    // Una integración desconocida se deja intacta: no hay lista de secretos para ella y
    // borrar campos a ciegas rompería una integración nueva.
    expect(redactIntegrationSecrets({ zapier: { enabled: true, hook: 'x' } })).toEqual({
      zapier: { enabled: true, hook: 'x' },
    });
  });
});

describe('mergeIntegrationSecrets', () => {
  it('conserva el secreto guardado cuando el cliente devuelve el marcador', () => {
    const incoming = redactIntegrationSecrets(storedIntegrations);

    const merged = mergeIntegrationSecrets(incoming, storedIntegrations);

    // ESTA es la propiedad que evita que el usuario destruya su propia integración al
    // pulsar «Guardar» sin haber tocado nada.
    expect((merged.hubspot as Record<string, unknown>).api_key).toBe('pat-na1-token-ficticio');
    expect((merged.webhook as Record<string, unknown>).secret).toBe('whsec_secreto_de_firma_ficticio');
    expect((merged.notion as Record<string, unknown>).token).toBe('secret_token_ficticio');
  });

  it('sustituye el secreto cuando el cliente envía uno nuevo', () => {
    const incoming = {
      ...redactIntegrationSecrets(storedIntegrations),
      hubspot: { enabled: true, api_key: 'pat-na1-token-NUEVO', pipeline_id: 'default' },
    };

    const merged = mergeIntegrationSecrets(incoming, storedIntegrations);

    expect((merged.hubspot as Record<string, unknown>).api_key).toBe('pat-na1-token-NUEVO');
  });

  it('permite BORRAR un secreto enviando la cadena vacía', () => {
    const incoming = {
      ...redactIntegrationSecrets(storedIntegrations),
      notion: { enabled: false, token: '', database_id: 'db-1' },
    };

    const merged = mergeIntegrationSecrets(incoming, storedIntegrations);

    // Desconectar una integración tiene que ser posible: si el marcador fuera la única
    // forma de no cambiar nada, la cadena vacía debe significar «quítalo».
    expect((merged.notion as Record<string, unknown>).token).toBe('');
  });

  it('deja el secreto vacío si el marcador llega y no hay nada guardado', () => {
    const merged = mergeIntegrationSecrets(
      { hubspot: { enabled: true, api_key: REDACTED_PLACEHOLDER, pipeline_id: '' } },
      {},
    );

    // Nunca se guarda el marcador como si fuera una credencial.
    expect((merged.hubspot as Record<string, unknown>).api_key).toBe('');
  });

  it('conserva los campos no secretos que llegan', () => {
    const merged = mergeIntegrationSecrets(
      { webhook: { enabled: false, url: 'https://nuevo.example.com', secret: REDACTED_PLACEHOLDER, events: [] } },
      storedIntegrations,
    );

    expect(merged.webhook).toMatchObject({ enabled: false, url: 'https://nuevo.example.com' });
    expect((merged.webhook as Record<string, unknown>).secret).toBe('whsec_secreto_de_firma_ficticio');
  });

  it('tolera formas inesperadas', () => {
    expect(mergeIntegrationSecrets(null, storedIntegrations)).toEqual({});
    expect(mergeIntegrationSecrets({ hubspot: null }, storedIntegrations)).toEqual({ hubspot: null });
  });
});

describe('isRedactedPlaceholder', () => {
  it('solo reconoce el marcador exacto', () => {
    expect(isRedactedPlaceholder(REDACTED_PLACEHOLDER)).toBe(true);
    // Un secreto real que casualmente contuviera el marcador no debe tratarse como tal.
    expect(isRedactedPlaceholder(`${REDACTED_PLACEHOLDER}x`)).toBe(false);
    expect(isRedactedPlaceholder('')).toBe(false);
    expect(isRedactedPlaceholder(undefined)).toBe(false);
  });
});
