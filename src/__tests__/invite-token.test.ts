// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  INVITE_TOKEN_ALPHABET,
  INVITE_TOKEN_LENGTH,
  PUBLIC_ROLE_TOKEN_PREFIX,
  PUBLIC_ROLE_TOKEN_RANDOM_LENGTH,
  generateInviteToken,
  generatePublicRoleToken,
  generateTicketId,
} from '@/lib/invites/token';

/**
 * Pruebas del generador del token de acceso a la entrevista.
 *
 * El token es la credencial que abre `/interview/t/[token]`, así que lo que se
 * fija aquí es su forma (para que siga siendo el mismo tipo de cadena que ya
 * hay en `interview_tickets`) y que no se repita.
 *
 * La aleatoriedad criptográfica en sí no se puede afirmar desde una prueba
 * unitaria: lo que se comprueba es lo observable — que cada posición del
 * alfabeto se alcanza y que no hay repeticiones en un lote grande, que es lo que
 * fallaría con un generador degenerado.
 */

const ALPHABET = new Set(INVITE_TOKEN_ALPHABET.split(''));

describe('generateInviteToken', () => {
  it('produce la longitud declarada', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateInviteToken()).toHaveLength(INVITE_TOKEN_LENGTH);
    }
  });

  it('usa solo caracteres del alfabeto declarado', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const char of generateInviteToken()) {
        expect(ALPHABET.has(char), `carácter fuera del alfabeto: ${char}`).toBe(true);
      }
    }
  });

  it('omite los caracteres visualmente ambiguos', () => {
    // El alfabeto existe para que el token se pueda dictar y copiar a mano.
    for (const ambiguous of ['I', 'O', '0', '1']) {
      expect(INVITE_TOKEN_ALPHABET).not.toContain(ambiguous);
    }

    const sample = Array.from({ length: 200 }, () => generateInviteToken()).join('');
    for (const ambiguous of ['I', 'O', '0', '1']) {
      expect(sample).not.toContain(ambiguous);
    }
  });

  it('no repite tokens en un lote grande', () => {
    const total = 5_000;
    const tokens = new Set<string>();
    for (let i = 0; i < total; i += 1) {
      tokens.add(generateInviteToken());
    }
    expect(tokens.size).toBe(total);
  });

  it('alcanza todas las posiciones del alfabeto', () => {
    // Con 32 símbolos y 16 caracteres por token, 200 tokens son 3.200 muestras:
    // que falte un símbolo indicaría un índice mal calculado (por ejemplo, una
    // máscara equivocada), no mala suerte.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      for (const char of generateInviteToken()) {
        seen.add(char);
      }
    }
    expect(seen.size).toBe(INVITE_TOKEN_ALPHABET.length);
  });
});

describe('generatePublicRoleToken', () => {
  /**
   * El `public_token` es la credencial de `/interview/public/[publicToken]`, el
   * enlace general de la vacante. Antes se armaba en el componente de creación
   * de vacantes con el reloj y `Math.random()`; lo que se fija aquí es la forma
   * que el resto del código espera (prefijo `pub-` y un solo tramo aleatorio) y
   * que no se repita.
   */
  const LOWERCASE_ALPHABET = new Set(INVITE_TOKEN_ALPHABET.toLowerCase().split(''));

  it('conserva el prefijo pub- y usa la longitud declarada', () => {
    for (let i = 0; i < 100; i += 1) {
      const token = generatePublicRoleToken();
      expect(token.startsWith(PUBLIC_ROLE_TOKEN_PREFIX)).toBe(true);
      expect(token).toHaveLength(
        PUBLIC_ROLE_TOKEN_PREFIX.length + PUBLIC_ROLE_TOKEN_RANDOM_LENGTH,
      );
    }
  });

  it('es una cadena en minúsculas y segura en una ruta de URL', () => {
    // Viaja como segmento de `/interview/public/{token}`: nada que codificar y
    // una sola caja, para que copiarlo o reescribirlo no altere el valor.
    for (let i = 0; i < 200; i += 1) {
      const token = generatePublicRoleToken();
      expect(token).toBe(token.toLowerCase());
      expect(token).toBe(encodeURIComponent(token));

      for (const char of token.slice(PUBLIC_ROLE_TOKEN_PREFIX.length)) {
        expect(LOWERCASE_ALPHABET.has(char), `carácter fuera del alfabeto: ${char}`).toBe(
          true,
        );
      }
    }
  });

  it('no lleva marca de tiempo: dos tokens del mismo instante no comparten tramos', () => {
    // El formato anterior era `pub-<epoch_base36>-<aleatorio>`, así que la mitad
    // del valor era adivinable. Ahora hay un único tramo y es todo aleatorio.
    const first = generatePublicRoleToken();
    const second = generatePublicRoleToken();

    expect(first.split('-')).toHaveLength(2);
    expect(first.slice(PUBLIC_ROLE_TOKEN_PREFIX.length)).not.toBe(
      second.slice(PUBLIC_ROLE_TOKEN_PREFIX.length),
    );
  });

  it('no repite tokens en un lote grande', () => {
    const total = 5_000;
    const tokens = new Set<string>();
    for (let i = 0; i < total; i += 1) {
      tokens.add(generatePublicRoleToken());
    }
    expect(tokens.size).toBe(total);
  });

  it('alcanza todas las posiciones del alfabeto', () => {
    // 200 tokens × 24 caracteres son 4.800 muestras sobre 32 símbolos: que falte
    // uno señalaría un índice mal calculado, no mala suerte.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      for (const char of generatePublicRoleToken().slice(PUBLIC_ROLE_TOKEN_PREFIX.length)) {
        seen.add(char);
      }
    }
    expect(seen.size).toBe(INVITE_TOKEN_ALPHABET.length);
  });
});

describe('generateTicketId', () => {
  it('conserva la forma ticket-<epoch_ms>-<sufijo>', () => {
    const now = 1_713_456_789_000;
    const id = generateTicketId(now);

    expect(id.startsWith(`ticket-${now}-`)).toBe(true);
    expect(id).toMatch(/^ticket-\d+-[a-z2-9]{6}$/);
  });

  it('no repite identificadores dentro del mismo milisegundo', () => {
    const now = 1_713_456_789_000;
    // El sufijo son 6 caracteres sobre 32 símbolos (30 bits). Con 200
    // identificadores la probabilidad de colisión legítima es ~2e-5, así que un
    // fallo aquí señala un generador roto, no mala suerte.
    const total = 200;
    const ids = new Set<string>();
    for (let i = 0; i < total; i += 1) {
      ids.add(generateTicketId(now));
    }
    expect(ids.size).toBe(total);
  });
});
