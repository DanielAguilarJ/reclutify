// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar el módulo.
vi.mock('server-only', () => ({}));

import {
  DEFAULT_AI_MODEL,
  resolveTrainingAiModel,
  TRAINING_AI_MODEL_ENV,
} from '@/lib/ai-model';

/**
 * Pruebas de la resolución del modelo de IA.
 *
 * LO QUE SE PROTEGE AQUÍ
 * ----------------------
 * El identificador del modelo estaba escrito a mano en cinco sitios y con dos
 * operadores distintos: `??` en tres y `||` en dos. Con `TRAINING_AI_MODEL=`
 * definida y **vacía** —la forma que invita `.env.example`— los tres del `??`
 * enviaban `"model": ""` a OpenRouter, que responde `400`, y los dos del `||`
 * funcionaban. El mismo valor de entorno rompía tres rutas y dejaba en pie otras
 * dos.
 *
 * La aserción central de este archivo es que la cadena vacía se trata como
 * ausencia, que es lo que hace irrelevante el operador que se escriba en la
 * ruta.
 */

let originalValue: string | undefined;

beforeEach(() => {
  originalValue = process.env[TRAINING_AI_MODEL_ENV];
});

afterEach(() => {
  if (originalValue === undefined) {
    delete process.env[TRAINING_AI_MODEL_ENV];
  } else {
    process.env[TRAINING_AI_MODEL_ENV] = originalValue;
  }
});

describe('DEFAULT_AI_MODEL', () => {
  it('is the single definition of the model identifier', () => {
    // Si esta aserción falla es que alguien cambió el modelo: revisa el coste y
    // la ventana de contexto documentados en `src/lib/ai-model.ts` antes de
    // actualizarla.
    expect(DEFAULT_AI_MODEL).toBe('google/gemini-3.6-flash');
  });
});

describe('resolveTrainingAiModel falls back to the default', () => {
  it('treats an empty string as absent', () => {
    // El bug exacto: con `??` esta cadena viajaba como `model` a OpenRouter.
    expect(resolveTrainingAiModel('')).toBe(DEFAULT_AI_MODEL);
  });

  it('treats a whitespace-only value as absent', () => {
    for (const rawValue of [' ', '   ', '\t', '\n', ' \t\n ']) {
      expect(resolveTrainingAiModel(rawValue)).toBe(DEFAULT_AI_MODEL);
    }
  });

  it('treats an undefined value as absent', () => {
    expect(resolveTrainingAiModel(undefined)).toBe(DEFAULT_AI_MODEL);
  });
});

describe('resolveTrainingAiModel honours a configured model', () => {
  it('returns a valid value untouched', () => {
    expect(resolveTrainingAiModel('google/gemini-2.5-flash')).toBe(
      'google/gemini-2.5-flash',
    );
  });

  it('trims surrounding whitespace', () => {
    // Un salto de línea arrastrado al pegar la variable en el panel de la
    // plataforma produce un identificador inválido y otro `400`.
    expect(resolveTrainingAiModel('  google/gemini-2.5-flash\n')).toBe(
      'google/gemini-2.5-flash',
    );
  });
});

describe('resolveTrainingAiModel reads the environment', () => {
  it('uses the variable when no argument is passed', () => {
    process.env[TRAINING_AI_MODEL_ENV] = 'openai/gpt-4o-mini';
    expect(resolveTrainingAiModel()).toBe('openai/gpt-4o-mini');
  });

  it('falls back to the default when the variable is set but empty', () => {
    process.env[TRAINING_AI_MODEL_ENV] = '';
    expect(resolveTrainingAiModel()).toBe(DEFAULT_AI_MODEL);
  });

  it('falls back to the default when the variable is not set', () => {
    delete process.env[TRAINING_AI_MODEL_ENV];
    expect(resolveTrainingAiModel()).toBe(DEFAULT_AI_MODEL);
  });
});
