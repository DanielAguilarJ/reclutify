// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar el módulo.
vi.mock('server-only', () => ({}));

import { authorizeInviteRequest } from '@/lib/invites/authorization';

/**
 * Pruebas de la decisión de autenticación de `/api/invite-candidates`.
 *
 * La función es pura y se ejecuta antes de leer el cuerpo de la petición, así
 * que fijarla aquí cubre el invariante que el fallo original rompía: no existe
 * ninguna entrada que produzca "aceptar" sin un secreto configurado y una
 * cabecera que coincida con él.
 */

const SECRET = 'secreto-ficticio-de-prueba-0123456789';

describe('authorizeInviteRequest — secreto no configurado', () => {
  it('responde 503 cuando MAKE_WEBHOOK_SECRET no está definida', () => {
    const result = authorizeInviteRequest('lo-que-sea', undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.reason).toBe('secret-not-configured');
      expect(result.message).toContain('misconfigured');
    }
  });

  it('trata la cadena vacía y los espacios como no configurada', () => {
    for (const configured of ['', '   ', '\n', '\t ']) {
      const result = authorizeInviteRequest('lo-que-sea', configured);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(503);
    }
  });

  it('no acepta ninguna cabecera mientras no haya secreto configurado', () => {
    for (const provided of [null, '', 'x', SECRET]) {
      const result = authorizeInviteRequest(provided, undefined);
      expect(result.ok, `no debería aceptar ${JSON.stringify(provided)}`).toBe(false);
    }
  });
});

describe('authorizeInviteRequest — cabecera ausente', () => {
  it('responde 401 cuando la cabecera no viene', () => {
    const result = authorizeInviteRequest(null, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toBe('missing-api-key');
      expect(result.message).toBe('Unauthorized');
    }
  });

  it('responde 401 cuando la cabecera viene vacía', () => {
    const result = authorizeInviteRequest('', SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});

describe('authorizeInviteRequest — cabecera incorrecta', () => {
  it('responde 401 con un valor distinto de la misma longitud', () => {
    const sameLength = `${'x'.repeat(SECRET.length - 1)}y`;
    expect(sameLength).toHaveLength(SECRET.length);

    const result = authorizeInviteRequest(sameLength, SECRET);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.reason).toBe('api-key-mismatch');
    }
  });

  it('responde 401 con valores de otra longitud, incluido un prefijo válido', () => {
    for (const provided of [
      SECRET.slice(0, -1),
      `${SECRET}x`,
      SECRET.toUpperCase(),
      ' ',
    ]) {
      const result = authorizeInviteRequest(provided, SECRET);
      expect(result.ok, `no debería aceptar ${JSON.stringify(provided)}`).toBe(false);
      if (!result.ok) expect(result.status).toBe(401);
    }
  });

  it('no distingue en el mensaje entre cabecera ausente e incorrecta', () => {
    const missing = authorizeInviteRequest(null, SECRET);
    const wrong = authorizeInviteRequest('otro-valor', SECRET);

    expect(missing.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (!missing.ok && !wrong.ok) {
      expect(missing.message).toBe(wrong.message);
      expect(missing.status).toBe(wrong.status);
    }
  });
});

describe('authorizeInviteRequest — cabecera correcta', () => {
  it('acepta el valor exacto', () => {
    expect(authorizeInviteRequest(SECRET, SECRET)).toEqual({ ok: true });
  });

  it('acepta cuando el secreto configurado trae espacios de sobra', () => {
    // Un salto de línea al pegar el valor en el panel de despliegue no debe
    // tumbar todas las llamadas legítimas.
    expect(authorizeInviteRequest(SECRET, `  ${SECRET}\n`)).toEqual({ ok: true });
  });
});
