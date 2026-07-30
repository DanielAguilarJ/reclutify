// @vitest-environment node

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  chatRequestSchema,
  evaluateRequestSchema,
  ttsRequestSchema,
  uploadVideoRequestSchema,
  MAX_RECENT_MESSAGES,
  MAX_TTS_TEXT_LENGTH,
} from '@/lib/schemas/interview';
import {
  sendEmailRequestSchema,
  testIntegrationRequestSchema,
  publicInterviewRegisterSchema,
} from '@/lib/schemas/api';

/**
 * Pruebas de la validación de entrada.
 *
 * POR QUÉ IMPORTA CADA TOPE
 * -------------------------
 * Estos esquemas no son cortesía: los campos que validan se interpolan en el prompt
 * que se envía a OpenRouter, que factura por token. Sin topes, el cuerpo de la
 * petición ES el presupuesto de la cuenta.
 *
 * Y fijan la corrección de un fallo concreto: `POST {}` a `/api/chat` devolvía `500`
 * porque el manejador hacía `Math.min(topicStartIndex, recentMessages.length)` sobre
 * `undefined`. Ahora es un `400` con el campo que falta.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chatRequestSchema', () => {
  /** Cuerpo mínimo aceptable. */
  const minimal = { roleId: 'rol-1' };

  it('acepta el cuerpo mínimo y aplica los valores por defecto de la ruta anterior', () => {
    const parsed = chatRequestSchema.parse(minimal);

    // Los defectos reproducen los que la ruta aplicaba en la desestructuración
    // (`= 0`, `= false`, `= 'restricted'`), así que un cliente que hoy funciona
    // sigue funcionando.
    expect(parsed.recentMessages).toEqual([]);
    expect(parsed.timerSeconds).toBe(0);
    expect(parsed.currentTopicIndex).toBe(0);
    expect(parsed.topicStartIndex).toBe(0);
    expect(parsed.isClosingPhase).toBe(false);
    expect(parsed.isGracePeriod).toBe(false);
    expect(parsed.isOpeningPhase).toBe(false);
    expect(parsed.interviewMode).toBe('restricted');
    expect(parsed.interviewDuration).toBe(30);
  });

  it('rechaza un cuerpo vacío en vez de reventar con 500', () => {
    // Este es el fallo concreto que se corrige: antes, `POST {}` llegaba al
    // manejador y moría en `recentMessages.length`.
    const result = chatRequestSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes('roleId'))).toBe(true);
  });

  it('rechaza un historial por encima del tope', () => {
    const tooMany = Array.from({ length: MAX_RECENT_MESSAGES + 1 }, () => ({
      role: 'user' as const,
      content: 'hola',
    }));

    // Un array de cien mil entradas es una factura, no una entrevista.
    expect(chatRequestSchema.safeParse({ ...minimal, recentMessages: tooMany }).success).toBe(false);
  });

  it('rechaza un mensaje individual desmedido', () => {
    const huge = { role: 'user' as const, content: 'x'.repeat(9_000) };

    expect(chatRequestSchema.safeParse({ ...minimal, recentMessages: [huge] }).success).toBe(false);
  });

  it('acota la descripción del puesto, que se interpola en el prompt de sistema', () => {
    const parsed = chatRequestSchema.parse({
      ...minimal,
      roleDescription: 'x'.repeat(20_001),
    });

    // Degrada a cadena vacía en vez de rechazar la petición: la descripción es
    // accesoria para conducir el turno, así que una entrevista en curso no debe
    // caerse por ella. Lo que importa es que el valor desmedido NO llega al prompt.
    expect(parsed.roleDescription).toBe('');
  });

  it('descarta los campos no declarados en lugar de rechazar la petición', () => {
    // `looseObject` y no `strictObject`: los clientes actuales envían campos que la
    // ruta ignora, y rechazarlos rompería la entrevista durante el despliegue.
    const parsed = chatRequestSchema.parse({ ...minimal, campoQueLaRutaIgnora: 'x' });

    expect(parsed).not.toHaveProperty('campoQueLaRutaIgnora');
    expect(parsed.roleId).toBe('rol-1');
  });

  it('degrada un valor corrupto a su defecto en vez de tirar la petición', () => {
    // `.catch()` en los campos accesorios: una entrevista en curso no debe caerse
    // porque el cliente mande `timerSeconds: 'abc'`.
    const parsed = chatRequestSchema.parse({ ...minimal, timerSeconds: 'no-es-un-numero' });

    expect(parsed.timerSeconds).toBe(0);
  });

  it('acota la duración de la entrevista', () => {
    // Una duración absurda haría que el motor de tiempos reparta un presupuesto de
    // preguntas desmedido.
    expect(chatRequestSchema.parse({ ...minimal, interviewDuration: 100_000 }).interviewDuration).toBe(30);
    expect(chatRequestSchema.parse({ ...minimal, interviewDuration: 0 }).interviewDuration).toBe(30);
    expect(chatRequestSchema.parse({ ...minimal, interviewDuration: 45 }).interviewDuration).toBe(45);
  });

  it('acota el CV, que se vuelca completo en el prompt', () => {
    const parsed = chatRequestSchema.parse({
      ...minimal,
      cvData: {
        name: 'Candidata',
        skills: Array.from({ length: 500 }, (_, i) => `skill-${i}`),
      },
    });

    // Se degrada el array que excede en lugar de rechazar el CV entero: el
    // candidato no debe perder su entrevista por un CV con demasiadas habilidades.
    expect(parsed.cvData?.skills).toEqual([]);
  });
});

describe('evaluateRequestSchema', () => {
  it('exige roleId', () => {
    expect(evaluateRequestSchema.safeParse({ transcript: [], topics: [] }).success).toBe(false);
  });

  it('acepta transcript y topics vacíos', () => {
    const parsed = evaluateRequestSchema.parse({ roleId: 'rol-1' });

    expect(parsed.transcript).toEqual([]);
    expect(parsed.topics).toEqual([]);
  });
});

describe('ttsRequestSchema', () => {
  it('exige texto no vacío', () => {
    expect(ttsRequestSchema.safeParse({}).success).toBe(false);
    expect(ttsRequestSchema.safeParse({ text: '   ' }).success).toBe(false);
  });

  it('acota la longitud del texto', () => {
    // Sin tope, el endpoint sirve de sintetizador de audiolibros a cuenta del saldo
    // ajeno: el proveedor factura por carácter.
    expect(ttsRequestSchema.safeParse({ text: 'x'.repeat(MAX_TTS_TEXT_LENGTH + 1) }).success).toBe(false);
    expect(ttsRequestSchema.safeParse({ text: 'x'.repeat(MAX_TTS_TEXT_LENGTH) }).success).toBe(true);
  });

  it('cae a inglés ante un idioma desconocido', () => {
    expect(ttsRequestSchema.parse({ text: 'hola', language: 'klingon' }).language).toBe('en');
  });
});

describe('uploadVideoRequestSchema', () => {
  const valid = { roleId: 'rol-1', resultId: 'cr-1' };

  it('ya NO acepta filename', () => {
    // Era el campo con el que se construía la clave del objeto en R2 sin
    // comprobación: escritura arbitraria en el bucket.
    const parsed = uploadVideoRequestSchema.parse({ ...valid, filename: '../../otro-tenant/x.webm' });

    expect(parsed).not.toHaveProperty('filename');
  });

  it('solo admite extensiones y tipos MIME de la lista blanca', () => {
    expect(uploadVideoRequestSchema.safeParse({ ...valid, extension: 'html' }).success).toBe(false);
    expect(uploadVideoRequestSchema.safeParse({ ...valid, contentType: 'text/html' }).success).toBe(false);

    // Lista blanca y no negra: el bucket se sirve públicamente, así que un
    // `text/html` ahí sería XSS almacenado en un dominio de la empresa.
    expect(uploadVideoRequestSchema.safeParse({ ...valid, extension: 'webm' }).success).toBe(true);
    expect(uploadVideoRequestSchema.safeParse({ ...valid, extension: 'mp4' }).success).toBe(true);
  });

  it('exige roleId y resultId', () => {
    expect(uploadVideoRequestSchema.safeParse({ roleId: 'rol-1' }).success).toBe(false);
    expect(uploadVideoRequestSchema.safeParse({ resultId: 'cr-1' }).success).toBe(false);
  });
});

describe('sendEmailRequestSchema', () => {
  const valid = {
    email: 'candidata@example.com',
    candidateName: 'Candidata',
    link: 'https://www.reclutify.com/interview/t/abc',
  };

  it('exige un correo con formato válido', () => {
    expect(sendEmailRequestSchema.safeParse({ ...valid, email: 'no-es-un-correo' }).success).toBe(false);
  });

  it('exige que el enlace sea una URL absoluta', () => {
    expect(sendEmailRequestSchema.safeParse({ ...valid, link: '/interview/t/abc' }).success).toBe(false);
  });

  it('normaliza el correo a minúsculas', () => {
    expect(sendEmailRequestSchema.parse({ ...valid, email: 'Candidata@Example.COM' }).email).toBe(
      'candidata@example.com',
    );
  });
});

describe('testIntegrationRequestSchema', () => {
  it('rechaza un tipo de integración desconocido', () => {
    // La unión discriminada lo rechaza en la validación, así que la ruta ya no
    // necesita un `default` en el `switch` que confirme qué tipos existen.
    expect(testIntegrationRequestSchema.safeParse({ type: 'ftp', config: {} }).success).toBe(false);
  });

  it('exige la URL del webhook como URL absoluta', () => {
    expect(
      testIntegrationRequestSchema.safeParse({ type: 'webhook', config: { url: 'localhost' } }).success,
    ).toBe(false);

    expect(
      testIntegrationRequestSchema.safeParse({
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      }).success,
    ).toBe(true);
  });

  it('exige las credenciales de cada integración', () => {
    expect(testIntegrationRequestSchema.safeParse({ type: 'hubspot', config: {} }).success).toBe(false);
    expect(
      testIntegrationRequestSchema.safeParse({ type: 'notion', config: { token: 'x' } }).success,
    ).toBe(false);
  });
});

describe('publicInterviewRegisterSchema', () => {
  it('exige token, nombre y correo válidos', () => {
    expect(publicInterviewRegisterSchema.safeParse({ token: 'x' }).success).toBe(false);
    expect(
      publicInterviewRegisterSchema.safeParse({
        token: 'x',
        candidateName: 'A',
        candidateEmail: 'roto',
      }).success,
    ).toBe(false);
  });

  it('acota la longitud del nombre', () => {
    // Antes se insertaba en `candidate_results` con cualquier tamaño.
    expect(
      publicInterviewRegisterSchema.safeParse({
        token: 'x',
        candidateName: 'x'.repeat(201),
        candidateEmail: 'a@b.com',
      }).success,
    ).toBe(false);
  });
});
