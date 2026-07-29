import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRAINING_CONTENT_LANGUAGE,
  TRAINING_CONTENT_LANGUAGES,
  buildContentLanguageDirective,
  isTrainingContentLanguage,
  resolveTrainingContentLanguage,
  type TrainingPromptScope,
} from '../../lib/training/content-language';
import { mapTrainingProgram } from '../../lib/training/mappers';

/**
 * Literales que el esquema Zod de `contracts.ts` valida carácter a carácter. Si
 * el modelo los traduce, la respuesta se rechaza entera, así que la directiva de
 * idioma tiene que nombrarlos explícitamente como intocables.
 */
const PROTECTED_JSON_LITERALS = [
  'multiple_choice',
  'open_ended',
  'true_false',
] as const;

const ALL_SCOPES: TrainingPromptScope[] = [
  'module_content',
  'conversation',
  'grading',
  'personalization',
];

describe('Training content language', () => {
  // ─── Directiva de idioma para los prompts ───

  it('demands Spanish content when the program language is es', () => {
    const directive = buildContentLanguageDirective('es');

    expect(directive).toContain('Spanish (es-MX)');
    expect(directive).not.toContain('English (en-US)');
    // Instrucción, no sugerencia.
    expect(directive).toContain('MANDATORY');
    expect(directive).toContain('invalid output');
  });

  it('demands English content when the program language is en', () => {
    const directive = buildContentLanguageDirective('en');

    expect(directive).toContain('English (en-US)');
    expect(directive).not.toContain('Spanish (es-MX)');
    expect(directive).toContain('MANDATORY');
  });

  it('enumerates the translatable module surface for generated content', () => {
    const directive = buildContentLanguageDirective('es', 'module_content');

    for (const field of [
      'module titles',
      'section bodies',
      'key points',
      'questions',
      'options',
      'explanations',
    ]) {
      expect(directive).toContain(field);
    }
  });

  it('keeps JSON keys and enum values in English in every scope and language', () => {
    for (const language of TRAINING_CONTENT_LANGUAGES) {
      for (const scope of ALL_SCOPES) {
        const directive = buildContentLanguageDirective(language, scope);

        expect(directive).toContain('Keep JSON keys and enum values');
        expect(directive).toContain('Never translate');
      }
    }
  });

  it('names the schema-validated enum values as untranslatable', () => {
    const directive = buildContentLanguageDirective('es', 'module_content');

    for (const literal of PROTECTED_JSON_LITERALS) {
      expect(directive).toContain(literal);
    }
  });

  it('does not leak module fields into the conversation scope', () => {
    // Enumerar campos que ese consumidor no produce enseña al modelo a ignorar
    // la enumeración.
    const directive = buildContentLanguageDirective('es', 'conversation');

    expect(directive).toContain('"message"');
    expect(directive).not.toContain('section bodies');
  });

  // ─── Normalización del valor de idioma ───

  it('preserves supported languages', () => {
    for (const language of TRAINING_CONTENT_LANGUAGES) {
      expect(resolveTrainingContentLanguage(language)).toBe(language);
      expect(isTrainingContentLanguage(language)).toBe(true);
    }
  });

  it('falls back to the default for null, undefined and unknown values', () => {
    const unsupported: unknown[] = [
      null,
      undefined,
      'fr',
      'ES',
      'es-MX',
      '',
      42,
      {},
      ['es'],
    ];

    for (const value of unsupported) {
      expect(resolveTrainingContentLanguage(value)).toBe(
        DEFAULT_TRAINING_CONTENT_LANGUAGE
      );
      expect(isTrainingContentLanguage(value)).toBe(false);
    }

    expect(DEFAULT_TRAINING_CONTENT_LANGUAGE).toBe('es');
  });

  // ─── Mapeo de la fila del programa ───

  it('maps the stored content language of a program', () => {
    const program = mapTrainingProgram({
      id: 'prog-1',
      org_id: 'org-1',
      title: 'Onboarding',
      content_language: 'en',
      created_at: '2026-07-30T00:00:00Z',
      updated_at: '2026-07-30T00:00:00Z',
    });

    expect(program.contentLanguage).toBe('en');
  });

  it('falls back to es when the program row has no usable content language', () => {
    // `null` es la fila escrita antes de la migración; `'fr'` es un valor que
    // nunca debería existir (lo impide el CHECK) pero que no puede propagarse al
    // tipo de dominio si apareciera.
    const rows: Array<Record<string, unknown>> = [
      { id: 'p', content_language: null },
      { id: 'p', content_language: 'fr' },
      { id: 'p', content_language: 7 },
      { id: 'p' },
    ];

    for (const row of rows) {
      expect(mapTrainingProgram(row).contentLanguage).toBe('es');
    }
  });
});
