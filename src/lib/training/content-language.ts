/**
 * Idioma del contenido de capacitación.
 *
 * ── Por qué existe este módulo ────────────────────────────────────────────────
 *
 * El programa de capacitación tiene un idioma
 * (`training_programs.content_language`) y ese idioma tiene que llegar a los
 * cuatro sitios donde se llama al modelo (`generate-modules`, `chat`,
 * `evaluate-module`, `hire-candidate`) y a la interfaz del empleado. Este módulo
 * es la ÚNICA definición del dominio (`'es' | 'en'`), del defecto y de la
 * directiva que se inyecta en los prompts, para que no haya literales
 * `'es' | 'en'` sueltos ni cuatro versiones de la misma instrucción divergiendo
 * entre rutas.
 *
 * No lleva `server-only`: la interfaz del empleado y la de configuración
 * necesitan el tipo y el resolvedor de fallback en el cliente. Nada aquí toca la
 * base de datos ni el entorno.
 *
 * ── CONTENIDO vs. CLAVES Y ENUMERACIONES DEL JSON ─────────────────────────────
 *
 * La distinción crítica de `buildContentLanguageDirective`: se traduce el
 * **contenido que lee una persona** (títulos, descripciones, cuerpos de sección,
 * puntos clave, preguntas, opciones, explicaciones, mensajes del tutor). NO se
 * traducen nunca las **claves del JSON** ni los **valores de enumeración**
 * (`type`, `multiple_choice`, `open_ended`, `true_false`, `text`, `feedback`),
 * porque los esquemas Zod de `contracts.ts` los validan literalmente: un modelo
 * que devuelva `"tipo": "opción_múltiple"` produce una respuesta que se rechaza
 * ENTERA, no una respuesta traducida.
 *
 * Por eso la directiva enumera qué campos son traducibles y qué literales son
 * intocables, en lugar de decir solo "responde en español": la instrucción
 * genérica invita al modelo a traducir también la estructura.
 */

/**
 * Dominio soportado. Coincide con el `CHECK` de
 * `training_programs.content_language` (migración
 * `202607300001_training_content_language.sql`).
 */
export const TRAINING_CONTENT_LANGUAGES = ['es', 'en'] as const;

export type TrainingContentLanguage =
  (typeof TRAINING_CONTENT_LANGUAGES)[number];

/** Mismo defecto que la columna en la base de datos. */
export const DEFAULT_TRAINING_CONTENT_LANGUAGE: TrainingContentLanguage = 'es';

export function isTrainingContentLanguage(
  value: unknown,
): value is TrainingContentLanguage {
  return (
    typeof value === 'string' &&
    (TRAINING_CONTENT_LANGUAGES as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Normaliza un valor de origen desconocido (fila de la base de datos, respuesta
 * de la API, estado del cliente) al dominio soportado.
 *
 * Cae al defecto ante `null`, `undefined` o cualquier valor fuera de la unión,
 * de modo que ningún valor ajeno se propaga al tipo de dominio ni a los prompts.
 * La columna es `NOT NULL DEFAULT 'es'`, así que en la práctica esto solo se
 * activa con filas leídas por un despliegue que se adelantó a la migración.
 */
export function resolveTrainingContentLanguage(
  value: unknown,
): TrainingContentLanguage {
  return isTrainingContentLanguage(value)
    ? value
    : DEFAULT_TRAINING_CONTENT_LANGUAGE;
}

/**
 * Etiqueta del idioma tal y como se le nombra al modelo, con la variante
 * regional que se quiere en el contenido.
 */
const CONTENT_LANGUAGE_LABEL: Record<TrainingContentLanguage, string> = {
  es: 'Spanish (es-MX)',
  en: 'English (en-US)',
};

/**
 * Superficie de contenido de cada consumidor de IA. Existe porque las cuatro
 * llamadas producen formas distintas y una directiva genérica sería falsa en
 * tres de ellas: enumerar los campos equivocados enseña al modelo a ignorar la
 * enumeración.
 */
export type TrainingPromptScope =
  /** `generate-modules`: módulos completos con secciones y preguntas. */
  | 'module_content'
  /** `chat`: mensajes del tutor al empleado. */
  | 'conversation'
  /** `evaluate-module`: calificación de respuestas abiertas. */
  | 'grading'
  /** `hire-candidate`: notas de personalización. */
  | 'personalization';

interface PromptScopeRules {
  /** Qué se traduce, en los términos del propio esquema del consumidor. */
  translatable: string;
  /** Claves y valores de enumeración que NO se traducen nunca. */
  preserved: string;
}

const PROMPT_SCOPE_RULES: Record<TrainingPromptScope, PromptScopeRules> = {
  module_content: {
    translatable:
      'module titles, module descriptions, section titles, section bodies, key points, questions, options and explanations',
    preserved:
      '"modules", "title", "description", "sections", "body", "keyPoints", "durationEstimate", "evaluationEnabled", "evaluationQuestions", "question", "type", "options", "correctAnswer", "explanation", "sourceDocumentIds", and the type values "multiple_choice", "open_ended" and "true_false"',
  },
  conversation: {
    translatable: 'every message addressed to the employee',
    preserved:
      '"message", "type", "contentCovered", "evaluationReady", "citationChunkIds", and the type values "text" and "feedback"',
  },
  grading: {
    translatable:
      'the explanation of every grading result, which is written for the employee',
    preserved: '"evaluations", "index", "correct", "explanation"',
  },
  personalization: {
    translatable:
      'the strengths, the areas to watch, the learning style sentence and the custom tips',
    preserved:
      '"strengths", "areasToWatch", "learningStyle", "customTips"',
  },
};

/**
 * Directiva de idioma para el prompt de sistema.
 *
 * Es una INSTRUCCIÓN, no una sugerencia: va en imperativo, declara que escribir
 * en otro idioma es salida inválida, enumera la superficie traducible del
 * consumidor concreto y cierra explícitamente la puerta a traducir claves y
 * valores de enumeración del JSON (ver la nota de cabecera de este módulo).
 *
 * El texto está en inglés a propósito, igual que el resto de los prompts de
 * sistema del módulo: el idioma de la instrucción no es el idioma de la
 * respuesta, y mezclarlos empeora el seguimiento de instrucciones.
 */
export function buildContentLanguageDirective(
  language: TrainingContentLanguage,
  scope: TrainingPromptScope = 'module_content',
): string {
  const label = CONTENT_LANGUAGE_LABEL[language];
  const rules = PROMPT_SCOPE_RULES[scope];

  return `CONTENT LANGUAGE (MANDATORY):
- Write ALL user-facing content in ${label}: ${rules.translatable}.
- This is not a preference. Content written in any other language is invalid output, even when the source documents, the employee messages or the interview data are written in another language.
- Keep JSON keys and enum values exactly as specified in English: ${rules.preserved}. Never translate, localize or rename them.
- Proper nouns, company names, document file names, product names and technical terms with no established translation stay as they appear in the source material.`;
}
