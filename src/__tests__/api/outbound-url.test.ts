// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Pruebas de la guardia de URLs salientes.
 *
 * QUÉ PROTEGEN
 * ------------
 * `/api/test-integration` y `/api/webhooks/candidate-completed` hacen una petición
 * HTTP a una dirección que elige el cliente. Sin sesión y sin validación, las dos
 * eran un SSRF completo con oráculo: el servidor conectaba desde dentro de la red
 * del despliegue y devolvía el código de estado del destino.
 *
 * Estas pruebas fijan que la validación cubre los cuatro caminos reales de evasión:
 *
 *  1. Literal IP en un rango no enrutable (`127.0.0.1`, `10.x`, `169.254.169.254`).
 *  2. Nombre de dominio PÚBLICO cuyo registro A apunta a un rango no enrutable —el
 *     truco habitual contra un validador que solo mira el texto de la URL—.
 *  3. Esquema o puerto no estándar, que es la herramienta del escaneo interno.
 *  4. Nombres reservados (`localhost`, `metadata.google.internal`, sufijos
 *     `.internal` y `.local`).
 *
 * Y fijan que el mensaje devuelto al cliente NO dice por qué se rechazó: decirlo
 * convertiría al propio validador en el oráculo de red que trata de evitar.
 */

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

/** Resuelve el nombre a una dirección pública. */
function resolvesPublic() {
  lookupMock.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
}

/** Resuelve el nombre a la dirección indicada. */
function resolvesTo(address: string, family = 4) {
  lookupMock.mockResolvedValue([{ address, family }]);
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  lookupMock.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // `vi.unstubAllEnvs` y no `Object.defineProperty`: en Node, `process.env` rechaza
  // un descriptor de propiedad y lanza `ERR_INVALID_OBJECT_DEFINE_PROPERTY`.
  vi.unstubAllEnvs();
});

/** Ejecuta la validación y devuelve el error, o `null` si pasó. */
async function reject(url: string): Promise<{ status: number; message: string } | null> {
  const { assertSafeOutboundUrl } = await import('@/lib/api/outbound-url');

  try {
    await assertSafeOutboundUrl(url, '[prueba]');
    return null;
  } catch (error) {
    const apiError = error as { status: number; message: string };
    return { status: apiError.status, message: apiError.message };
  }
}

describe('destinos permitidos', () => {
  it('acepta un HTTPS público que resuelve a una dirección enrutable', async () => {
    resolvesPublic();

    const { assertSafeOutboundUrl } = await import('@/lib/api/outbound-url');
    const result = await assertSafeOutboundUrl('https://webhooks.example.com/hook', '[prueba]');

    expect(result.url.hostname).toBe('webhooks.example.com');
    expect(result.resolvedAddresses).toEqual(['203.0.113.10']);
  });

  it('conserva la ruta y la cadena de consulta del destino', async () => {
    resolvesPublic();

    const { assertSafeOutboundUrl } = await import('@/lib/api/outbound-url');
    const result = await assertSafeOutboundUrl(
      'https://webhooks.example.com/hook?id=1',
      '[prueba]',
    );

    expect(result.url.pathname).toBe('/hook');
    expect(result.url.search).toBe('?id=1');
  });
});

describe('literales IP no enrutables', () => {
  const blocked = [
    ['loopback', 'https://127.0.0.1/hook'],
    ['red privada 10/8', 'https://10.0.0.5/hook'],
    ['red privada 172.16/12', 'https://172.20.1.1/hook'],
    ['red privada 192.168/16', 'https://192.168.1.1/hook'],
    // El servicio de metadatos de AWS, GCP, Azure y DigitalOcean. Es el objetivo
    // de más valor: en varios proveedores entrega credenciales de la instancia.
    ['metadatos de la plataforma', 'https://169.254.169.254/latest/meta-data/'],
    ['CGNAT 100.64/10', 'https://100.64.0.1/hook'],
    ['red 0/8', 'https://0.0.0.0/hook'],
    ['multicast', 'https://224.0.0.1/hook'],
  ] as const;

  for (const [label, url] of blocked) {
    it(`rechaza ${label}`, async () => {
      const result = await reject(url);
      expect(result?.status).toBe(400);
    });
  }

  it('rechaza loopback en IPv6 y su forma mapeada de IPv4', async () => {
    expect((await reject('https://[::1]/hook'))?.status).toBe(400);
    expect((await reject('https://[::ffff:127.0.0.1]/hook'))?.status).toBe(400);
  });

  it('rechaza direcciones locales únicas y link-local de IPv6', async () => {
    expect((await reject('https://[fd00::1]/hook'))?.status).toBe(400);
    expect((await reject('https://[fe80::1]/hook'))?.status).toBe(400);
  });
});

describe('evasión por DNS', () => {
  it('rechaza un dominio público que resuelve a loopback', async () => {
    // Es el eludir más común de un validador que solo mira el texto de la URL.
    resolvesTo('127.0.0.1');

    const result = await reject('https://parece-publico.example.com/hook');

    expect(result?.status).toBe(400);
    expect(lookupMock).toHaveBeenCalledWith('parece-publico.example.com', { all: true });
  });

  it('rechaza un dominio que resuelve al servicio de metadatos', async () => {
    resolvesTo('169.254.169.254');
    expect((await reject('https://parece-publico.example.com/hook'))?.status).toBe(400);
  });

  it('rechaza si CUALQUIERA de las direcciones resueltas no es enrutable', async () => {
    // Con varias direcciones no se puede controlar a cuál abrirá el socket el
    // `fetch`, así que basta una mala para rechazar.
    lookupMock.mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);

    expect((await reject('https://mixto.example.com/hook'))?.status).toBe(400);
  });

  it('rechaza cuando la resolución falla o no devuelve registros', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    expect((await reject('https://inexistente.example.com/hook'))?.status).toBe(400);

    lookupMock.mockResolvedValue([]);
    expect((await reject('https://sin-registros.example.com/hook'))?.status).toBe(400);
  });
});

describe('esquema, puerto y nombres reservados', () => {
  it('rechaza esquemas que no son web', async () => {
    for (const url of ['file:///etc/passwd', 'gopher://example.com/', 'ftp://example.com/']) {
      expect((await reject(url))?.status).toBe(400);
    }
  });

  it('rechaza puertos no estándar', async () => {
    resolvesPublic();

    // Un puerto arbitrario no tiene uso legítimo en un webhook público y es la
    // herramienta del escaneo de la red interna.
    for (const url of [
      'https://example.com:6379/',
      'https://example.com:5432/',
      'https://example.com:8080/',
    ]) {
      expect((await reject(url))?.status).toBe(400);
    }
  });

  it('rechaza nombres reservados sin llegar a resolverlos', async () => {
    for (const url of [
      'https://localhost/hook',
      'https://metadata.google.internal/',
      'https://servicio.internal/hook',
      'https://impresora.local/hook',
    ]) {
      expect((await reject(url))?.status).toBe(400);
    }

    // Ni una consulta de DNS: se rechaza por nombre.
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rechaza una URL que no parsea', async () => {
    expect((await reject('esto no es una url'))?.status).toBe(400);
  });

  it('rechaza http en producción y lo permite fuera', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    resolvesPublic();
    expect((await reject('http://example.com/hook'))?.status).toBe(400);

    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    resolvesPublic();
    expect(await reject('http://example.com/hook')).toBeNull();
  });
});

describe('el mensaje de rechazo no filtra el motivo', () => {
  it('devuelve un texto genérico y registra el detalle solo en el servidor', async () => {
    const result = await reject('https://169.254.169.254/latest/meta-data/');

    // Devolver «resuelve a 169.254.169.254» convertiría el validador en el oráculo
    // de red que trata de evitar: permitiría sondear qué direcciones existen.
    expect(result?.message).not.toContain('169.254');
    expect(result?.message).not.toMatch(/loopback|private|link-local/i);
    expect(result?.message).toMatch(/not allowed/i);

    // El detalle sí va al log del servidor, que es donde hace falta para depurar.
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[prueba]');
  });
});
