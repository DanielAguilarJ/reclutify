// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  MAX_INFO_SESSION_TOKEN_LENGTH,
  infoSessionCreateRequestSchema,
  infoSessionPatchSchema,
  infoSessionStateRequestSchema,
  infoSessionUpdateRequestSchema,
} from '@/lib/info-sessions/contracts';

/**
 * Pruebas de `src/lib/info-sessions/contracts.ts`.
 *
 * La lista blanca de columnas que el cliente público puede tocar NO es un `if`
 * de las rutas: es la forma del esquema. Por eso se prueba aquí y no solo a
 * través de la ruta — si `strictObject` se relajara a un objeto normal, las
 * rutas seguirían respondiendo `200` y las columnas prohibidas empezarían a
 * llegar a la base.
 *
 * Lo que se fija:
 *
 *  - `conversion_result` y `coach_notified` (la valoración y la confirmación del
 *    asesor), `org_id` y `course_id` (la pertenencia de la fila) y
 *    `status: 'completed'` (el estado que el cliente no puede fabricar) no tienen
 *    camino hasta la base;
 *  - `closingMode: null` y `clientEmail: ''` sí lo tienen: son valores que el
 *    formulario envía a propósito;
 *  - el `patch` vacío se rechaza, para que la ruta no tenga que distinguir "no
 *    había nada que escribir" de "no se pudo escribir";
 *  - la creación no acepta `orgId`: lo resuelve el servidor desde el curso.
 */

const COURSE_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const ACCESS_TOKEN = 'token-de-la-sesion';

describe('infoSessionPatchSchema — columnas que el cliente no puede tocar', () => {
  it('rechaza conversion_result: es la valoración comercial del asesor', () => {
    const parsed = infoSessionPatchSchema.safeParse({
      status: 'closed_remote',
      conversion_result: 'converted',
    });

    expect(parsed.success).toBe(false);
  });

  it('rechaza coach_notified: es la confirmación de que el asesor atendió', () => {
    const parsed = infoSessionPatchSchema.safeParse({
      status: 'closed_remote',
      coach_notified: true,
    });

    expect(parsed.success).toBe(false);
  });

  it('rechaza org_id: la pertenencia de la fila la fija el servidor', () => {
    const parsed = infoSessionPatchSchema.safeParse({
      status: 'closed_remote',
      org_id: '11111111-1111-4111-8111-111111111111',
    });

    expect(parsed.success).toBe(false);
  });

  it('rechaza course_id: mover la sesión de curso movería su organización', () => {
    const parsed = infoSessionPatchSchema.safeParse({
      status: 'closed_remote',
      course_id: COURSE_ID,
    });

    expect(parsed.success).toBe(false);
  });

  it('rechaza status: completed, que es el estado que fija el asesor', () => {
    const parsed = infoSessionPatchSchema.safeParse({ status: 'completed' });

    expect(parsed.success).toBe(false);
  });

  it('acepta los tres estados que el flujo del cliente sí fija', () => {
    for (const status of ['active', 'closed_presential', 'closed_remote']) {
      expect(infoSessionPatchSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rechaza las claves en snake_case de las columnas permitidas', () => {
    // El contrato habla en camelCase; la traducción a columnas vive en el
    // servicio. Aceptar los dos nombres duplicaría la superficie.
    for (const patch of [
      { objections_detected: [] },
      { closing_mode: 'remote' },
      { client_email: 'cliente@ejemplo.test' },
    ]) {
      expect(infoSessionPatchSchema.safeParse(patch).success).toBe(false);
    }
  });
});

describe('infoSessionPatchSchema — valores que el flujo sí envía', () => {
  it('acepta closingMode null, que es el valor previo a elegir el cierre', () => {
    const parsed = infoSessionPatchSchema.safeParse({ closingMode: null });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.closingMode).toBeNull();
  });

  it('acepta clientEmail vacío, que es lo que envía un formulario sin correo', () => {
    const parsed = infoSessionPatchSchema.safeParse({ clientEmail: '' });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.clientEmail).toBe('');
  });

  it('rechaza el patch vacío: sería un UPDATE sin intención detrás', () => {
    expect(infoSessionPatchSchema.safeParse({}).success).toBe(false);
  });

  it('conserva los campos de la transcripción que el modelo pueda añadir', () => {
    const parsed = infoSessionPatchSchema.safeParse({
      transcript: [
        { role: 'assistant', content: 'Hola', timestamp: 1, phase: 'intro', extra: 'x' },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

describe('infoSessionCreateRequestSchema', () => {
  it('rechaza orgId: el servidor lo deriva del curso', () => {
    const parsed = infoSessionCreateRequestSchema.safeParse({
      courseId: COURSE_ID,
      clientName: 'Cliente Ficticio',
      orgId: '11111111-1111-4111-8111-111111111111',
    });

    expect(parsed.success).toBe(false);
  });

  it('acepta la petición mínima: curso y nombre', () => {
    const parsed = infoSessionCreateRequestSchema.safeParse({
      courseId: COURSE_ID,
      clientName: 'Cliente Ficticio',
    });

    expect(parsed.success).toBe(true);
  });

  it('exige un courseId con forma de uuid y un nombre no vacío', () => {
    for (const body of [
      { courseId: 'no-es-uuid', clientName: 'Cliente Ficticio' },
      { courseId: COURSE_ID, clientName: '   ' },
      { courseId: COURSE_ID },
    ]) {
      expect(infoSessionCreateRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('acepta clientAge null, que es lo que envía el formulario sin edad', () => {
    const parsed = infoSessionCreateRequestSchema.safeParse({
      courseId: COURSE_ID,
      clientName: 'Cliente Ficticio',
      clientAge: null,
    });

    expect(parsed.success).toBe(true);
  });
});

describe('esquemas de escritura y de estado', () => {
  it('la escritura exige el par sessionId + accessToken', () => {
    for (const body of [
      { sessionId: SESSION_ID, patch: { status: 'active' } },
      { accessToken: ACCESS_TOKEN, patch: { status: 'active' } },
      { sessionId: SESSION_ID, accessToken: '', patch: { status: 'active' } },
      { sessionId: SESSION_ID, accessToken: ACCESS_TOKEN },
    ]) {
      expect(infoSessionUpdateRequestSchema.safeParse(body).success).toBe(false);
    }

    expect(
      infoSessionUpdateRequestSchema.safeParse({
        sessionId: SESSION_ID,
        accessToken: ACCESS_TOKEN,
        patch: { status: 'active' },
      }).success,
    ).toBe(true);
  });

  it('acota la longitud del accessToken aceptado', () => {
    const parsed = infoSessionUpdateRequestSchema.safeParse({
      sessionId: SESSION_ID,
      accessToken: 'x'.repeat(MAX_INFO_SESSION_TOKEN_LENGTH + 1),
      patch: { status: 'active' },
    });

    expect(parsed.success).toBe(false);
  });

  it('la lectura de estado exige la misma credencial que la escritura', () => {
    expect(
      infoSessionStateRequestSchema.safeParse({ sessionId: SESSION_ID }).success,
    ).toBe(false);
    expect(
      infoSessionStateRequestSchema.safeParse({
        sessionId: SESSION_ID,
        accessToken: ACCESS_TOKEN,
      }).success,
    ).toBe(true);
  });
});
