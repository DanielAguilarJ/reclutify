// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  INVITE_TOKEN_ALPHABET,
  INVITE_TOKEN_LENGTH,
  generateInviteToken,
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
