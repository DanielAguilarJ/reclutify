import 'server-only';

/**
 * Generación de módulos con IA: taxonomía de errores y normalización previa a
 * la validación.
 *
 * ── Por qué existe este módulo ────────────────────────────────────────────────
 *
 * `generatedTrainingModulesSchema` (en `contracts.ts`) es estricto a propósito:
 * protege lo que se llega a almacenar. Pero `response_format: json_object` solo
 * garantiza JSON *sintácticamente* válido, no conformidad de esquema, así que un
 * único desliz de forma en cualquier módulo de la respuesta —un `correctAnswer`
 * que solo difiere en mayúsculas, una opción repetida, un `durationEstimate` de
 * 600— tumbaba la generación entera con un `502` indistinguible de una caída del
 * proveedor.
 *
 * La respuesta es normalizar **antes** de validar. Este módulo corrige deslices
 * de forma sin tocar ninguna invariante:
 *
 * - Nada de lo que hace debilita el esquema. Lo que no se puede arreglar sin
 *   inventar contenido se deja tal cual y Zod lo rechaza.
 * - `contracts.ts` sigue siendo la única puerta de entrada a la persistencia.
 *
 * ── Separación de planos, igual que `document-errors.ts` ──────────────────────
 *
 * - `code`: legible por máquina, viaja en la respuesta HTTP y es lo que la
 *   interfaz usa para elegir el texto que ve el administrador.
 * - `MODULE_GENERATION_ERROR_MESSAGES`: mensaje humano, derivado solo del
 *   `code`.
 * - Causa técnica (status de OpenRouter, cuerpo del error, `issues` de Zod):
 *   **solo** en el log del servidor.
 *
 * Los mensajes de este catálogo están en inglés, igual que el resto de las
 * respuestas de la API de capacitación: la ruta no recibe el idioma de la
 * interfaz. El texto bilingüe para el administrador se resuelve en el cliente a
 * partir del `code` (ver `handleGenerateModules` en la pantalla de
 * configuración).
 */

// ============================================================
// 1. TAXONOMÍA DE ERRORES
// ============================================================

export type ModuleGenerationErrorCode =
  /** Falta `OPENROUTER_API_KEY` en el entorno del servidor. */
  | 'AI_NOT_CONFIGURED'
  /** OpenRouter respondió con un status no OK (401, 402, 404, 429, 5xx…). */
  | 'AI_UNAVAILABLE'
  /** Se agotó el presupuesto de tiempo del intento. */
  | 'AI_TIMEOUT'
  /** El contenido devuelto no es JSON parseable. */
  | 'AI_INVALID_JSON'
  /** JSON válido que no cumple el esquema, ni tras el reintento de reparación. */
  | 'AI_INVALID_STRUCTURE'
  /**
   * Un módulo se quedó sin ningún `sourceDocumentId` del programa después de
   * filtrar los ajenos. No se reserva para "citó un id ajeno" —eso se filtra en
   * silencio y se registra— sino para "no queda ninguno válido".
   */
  | 'AI_NO_VALID_SOURCE';

/** Status HTTP por código. Conserva los que la ruta ya devolvía. */
export const MODULE_GENERATION_ERROR_STATUS: Record<
  ModuleGenerationErrorCode,
  number
> = {
  AI_NOT_CONFIGURED: 503,
  AI_UNAVAILABLE: 502,
  AI_TIMEOUT: 504,
  AI_INVALID_JSON: 502,
  AI_INVALID_STRUCTURE: 502,
  AI_NO_VALID_SOURCE: 502,
};

/**
 * Mensaje humano por código. Nunca incluye la causa técnica.
 *
 * Los textos reproducen literalmente los que la ruta ya devolvía, de modo que
 * el `code` es aditivo para cualquier consumidor existente de la API.
 */
export const MODULE_GENERATION_ERROR_MESSAGES: Record<
  ModuleGenerationErrorCode,
  string
> = {
  AI_NOT_CONFIGURED: 'AI service not configured',
  AI_UNAVAILABLE: 'AI service unavailable. Please try again.',
  AI_TIMEOUT: 'AI generation timed out. Please try again.',
  AI_INVALID_JSON: 'Failed to parse AI response. Please try again.',
  AI_INVALID_STRUCTURE: 'AI returned invalid module structure',
  AI_NO_VALID_SOURCE: 'AI returned an unauthorized source document',
};

export function getModuleGenerationErrorMessage(
  code: ModuleGenerationErrorCode,
): string {
  return (
    MODULE_GENERATION_ERROR_MESSAGES[code] ??
    MODULE_GENERATION_ERROR_MESSAGES.AI_UNAVAILABLE
  );
}

// ============================================================
// 2. PRESUPUESTO DE TIEMPO
// ============================================================

/**
 * PRESUPUESTO DE TIEMPO
 * ---------------------
 * Antes había un único intento con `AbortController` a 115 s bajo
 * `maxDuration = 120`: consumía el presupuesto completo y no dejaba sitio para
 * un reintento. Con dos intentos el reparto es:
 *
 *   2 intentos × 45 s = 90 s de modelo, + ~30 s de holgura para autorización,
 *   consultas de documentos, construcción del prompt, la RPC de persistencia y
 *   el arranque de la función = 120 s (`maxDuration`).
 *
 * Los 45 s por intento no son arbitrarios: es el mismo tope que ya usa el
 * análisis de documentos (`process-document.ts`) contra el mismo proveedor y
 * modelo, así que el comportamiento observado es comparable. Un intento que no
 * responde en 45 s se corta y se reporta como `AI_TIMEOUT` en lugar de arriesgar
 * que la plataforma corte la función entera (ver el aviso de `maxDuration` en la
 * ruta).
 */
export const MODULE_GENERATION_ATTEMPT_TIMEOUT_MS = 45_000;

/** Intento inicial + un único reintento de reparación. */
export const MODULE_GENERATION_MAX_ATTEMPTS = 2;

// ============================================================
// 3. LÍMITES DE DURACIÓN
// ============================================================

/** Mismos límites que `generatedTrainingModuleSchema.durationEstimate`. */
export const MIN_MODULE_DURATION_MINUTES = 1;
export const MAX_MODULE_DURATION_MINUTES = 480;
export const DEFAULT_MODULE_DURATION_MINUTES = 30;

// ============================================================
// 4. RESULTADO DE LA NORMALIZACIÓN
// ============================================================

export interface NormalizedModuleGeneration {
  /** Payload listo para `generatedTrainingModulesSchema.safeParse`. */
  payload: unknown;
  /**
   * Ids citados por el modelo que no pertenecen al programa. Se registran en el
   * log; nunca llegan al payload.
   */
  droppedSourceDocumentIds: string[];
  /**
   * Índices de módulos que citaron al menos un id y se quedaron sin ninguno
   * válido tras el filtrado. Es la condición de `AI_NO_VALID_SOURCE`.
   *
   * Un módulo que no citó ningún id (clave ausente o array vacío) **no** entra
   * aquí: eso es un fallo de estructura y lo cubre el reintento de reparación.
   */
  modulesWithoutValidSource: number[];
  /** Traza legible de cada corrección aplicada, para el log. */
  adjustments: string[];
}

// ============================================================
// 5. UTILIDADES
// ============================================================

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/**
 * `trim` en todas las cadenas del payload, a cualquier profundidad.
 *
 * Zod ya recorta cada cadena al validar, pero la normalización necesita
 * comparar textos entre sí (deduplicar opciones, alinear `correctAnswer`) y esas
 * comparaciones tienen que hacerse sobre el texto recortado para dar el mismo
 * resultado que dará el esquema después. No toca las claves.
 */
function deepTrim(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(deepTrim);
  }
  if (isPlainObject(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = deepTrim(entry);
    }
    return output;
  }
  return value;
}

/**
 * Clave de comparación laxa: minúsculas y espacios internos colapsados.
 *
 * Deliberadamente no elimina todos los espacios: `"Opción A"` y `"OpciónA"`
 * siguen siendo distintas. Colapsar es suficiente para los deslices reales del
 * modelo y no corre el riesgo de fundir dos opciones que el administrador
 * entiende como diferentes.
 */
const looseKey = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Token booleano reconocible, con el idioma que delata cuando lo delata. */
interface BooleanToken {
  value: boolean;
  language: 'es' | 'en' | null;
}

// `Map` en lugar de objeto literal: una clave como `constructor` en la
// respuesta del modelo no debe resolver contra `Object.prototype`.
const BOOLEAN_TOKENS = new Map<string, BooleanToken>([
  ['true', { value: true, language: 'en' }],
  ['t', { value: true, language: 'en' }],
  ['yes', { value: true, language: 'en' }],
  ['false', { value: false, language: 'en' }],
  ['f', { value: false, language: 'en' }],
  ['verdadero', { value: true, language: 'es' }],
  ['v', { value: true, language: 'es' }],
  ['sí', { value: true, language: 'es' }],
  ['si', { value: true, language: 'es' }],
  ['falso', { value: false, language: 'es' }],
  // Ambiguo entre idiomas: no sirve para decidir el par canónico.
  ['no', { value: false, language: null }],
]);

const CANONICAL_BOOLEAN_OPTIONS: Record<'es' | 'en', [string, string]> = {
  en: ['True', 'False'],
  es: ['Verdadero', 'Falso'],
};

function recognizeBoolean(value: unknown): BooleanToken | null {
  if (typeof value === 'boolean') {
    return { value, language: null };
  }
  if (typeof value !== 'string') {
    return null;
  }
  return BOOLEAN_TOKENS.get(looseKey(value)) ?? null;
}

/**
 * Idioma del par canónico: lo decide el primer indicio inequívoco, primero en
 * `correctAnswer` y después en las opciones que el modelo sí escribió. Sin
 * indicio, inglés, que es el idioma del prompt del sistema.
 */
function pickBooleanLanguage(
  answer: BooleanToken,
  options: string[] | null,
): 'es' | 'en' {
  if (answer.language) {
    return answer.language;
  }
  for (const option of options ?? []) {
    const token = recognizeBoolean(option);
    if (token?.language) {
      return token.language;
    }
  }
  return 'en';
}

/** Descripción segura de un valor no textual para el log. */
const describeValue = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined');

// ============================================================
// 6. NORMALIZACIÓN DE PREGUNTAS
// ============================================================

function normalizeQuestion(
  rawQuestion: unknown,
  path: string,
  adjustments: string[],
): unknown {
  if (!isPlainObject(rawQuestion)) {
    return rawQuestion;
  }

  const question: Record<string, unknown> = { ...rawQuestion };
  const type = question.type;

  // 1. Deduplicar `options` preservando el orden de aparición.
  if (isStringArray(question.options)) {
    const deduped = Array.from(new Set(question.options));
    if (deduped.length !== question.options.length) {
      adjustments.push(`${path}.options: opciones duplicadas eliminadas`);
      question.options = deduped;
    }
  }

  // 2. `open_ended` no lleva opciones. Se elimina la clave por completo, que es
  //    lo que el esquema espera (un array vacío también pasa, pero la clave
  //    ausente es la forma canónica del prompt).
  if (type === 'open_ended' && 'options' in question) {
    delete question.options;
    adjustments.push(`${path}.options: eliminadas en una pregunta open_ended`);
  }

  // 3. `true_false` exige exactamente 2 opciones. Si faltan o no son 2, se
  //    genera el par canónico SOLO cuando `correctAnswer` es reconociblemente
  //    booleano. Si no lo es, no se inventa nada: Zod lo rechaza.
  if (type === 'true_false') {
    const options = isStringArray(question.options) ? question.options : null;

    if (!options || options.length !== 2) {
      const recognized = recognizeBoolean(question.correctAnswer);
      if (recognized) {
        const language = pickBooleanLanguage(recognized, options);
        const [truthy, falsy] = CANONICAL_BOOLEAN_OPTIONS[language];
        question.options = [truthy, falsy];
        question.correctAnswer = recognized.value ? truthy : falsy;
        adjustments.push(
          `${path}: par booleano canónico (${language}) generado para true_false`,
        );
      }
    } else if (typeof question.correctAnswer === 'boolean') {
      // Par correcto pero respuesta booleana en vez de texto: se traduce a la
      // opción equivalente cuando hay una sola candidata.
      const matches = options.filter(
        (option) => recognizeBoolean(option)?.value === question.correctAnswer,
      );
      if (matches.length === 1) {
        question.correctAnswer = matches[0];
        adjustments.push(
          `${path}.correctAnswer: booleano traducido a la opción "${matches[0]}"`,
        );
      }
    }
  }

  // 4. `correctAnswer` que solo difiere en mayúsculas o espacios. Se ajusta al
  //    texto exacto de la opción únicamente si la coincidencia laxa es única;
  //    con varias candidatas o ninguna se deja como está para que Zod lo
  //    rechace, porque elegir por nosotros cambiaría la respuesta correcta.
  if (
    isStringArray(question.options) &&
    typeof question.correctAnswer === 'string' &&
    !question.options.includes(question.correctAnswer)
  ) {
    const key = looseKey(question.correctAnswer);
    const matches = question.options.filter(
      (option) => looseKey(option) === key,
    );
    if (matches.length === 1) {
      adjustments.push(
        `${path}.correctAnswer: ajustado al texto exacto de la opción "${matches[0]}"`,
      );
      question.correctAnswer = matches[0];
    }
  }

  return question;
}

// ============================================================
// 7. NORMALIZACIÓN DE MÓDULOS
// ============================================================

function normalizeDuration(
  raw: unknown,
  path: string,
  adjustments: string[],
): number {
  const candidate =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim() !== ''
        ? Number(raw)
        : Number.NaN;

  if (!Number.isFinite(candidate)) {
    if (raw !== undefined && raw !== null) {
      adjustments.push(
        `${path}.durationEstimate: valor no numérico sustituido por ${DEFAULT_MODULE_DURATION_MINUTES}`,
      );
    }
    return DEFAULT_MODULE_DURATION_MINUTES;
  }

  const clamped = Math.min(
    MAX_MODULE_DURATION_MINUTES,
    Math.max(MIN_MODULE_DURATION_MINUTES, Math.round(candidate)),
  );

  if (clamped !== candidate) {
    adjustments.push(
      `${path}.durationEstimate: ${candidate} acotado a ${clamped}`,
    );
  }

  return clamped;
}

function normalizeModule(
  rawModule: unknown,
  index: number,
  allowedDocumentIds: ReadonlySet<string>,
  result: NormalizedModuleGeneration,
): unknown {
  if (!isPlainObject(rawModule)) {
    return rawModule;
  }

  const path = `modules.${index}`;
  const module_: Record<string, unknown> = { ...rawModule };
  const { adjustments } = result;

  // 1. Duración acotada ANTES de validar. Antes se acotaba después, así que un
  //    600 del modelo tumbaba la validación entera en vez de quedarse en 480.
  module_.durationEstimate = normalizeDuration(
    module_.durationEstimate,
    path,
    adjustments,
  );

  // 2. Preguntas: primero se normaliza cada una, después se resuelve la
  //    coherencia con `evaluationEnabled`.
  if (Array.isArray(module_.evaluationQuestions)) {
    module_.evaluationQuestions = module_.evaluationQuestions.map(
      (question, questionIndex) =>
        normalizeQuestion(
          question,
          `${path}.evaluationQuestions.${questionIndex}`,
          adjustments,
        ),
    );
  }

  const questions = Array.isArray(module_.evaluationQuestions)
    ? module_.evaluationQuestions
    : null;

  if (module_.evaluationEnabled === false) {
    // El modelo marcó el módulo como introductorio a propósito: se respeta el
    // `false` y se descartan las preguntas, no al contrario.
    if (!questions || questions.length > 0) {
      if (questions && questions.length > 0) {
        adjustments.push(
          `${path}: ${questions.length} pregunta(s) descartada(s) porque evaluationEnabled es false`,
        );
      }
      module_.evaluationQuestions = [];
    }
  } else if (module_.evaluationEnabled === true && (!questions || questions.length === 0)) {
    // Evaluación activada sin preguntas: el módulo es utilizable como
    // introductorio, así que se degrada a `false` en lugar de fallar.
    module_.evaluationEnabled = false;
    module_.evaluationQuestions = [];
    adjustments.push(
      `${path}: evaluationEnabled pasado a false por no traer preguntas`,
    );
  }

  // 3. `sourceDocumentIds`: se filtran los ajenos al programa.
  //
  //    PROPIEDAD DE SEGURIDAD — no es una relajación, es un endurecimiento.
  //    El comportamiento anterior detectaba un id ajeno y rechazaba la
  //    generación completa; este filtra el id y solo falla si un módulo se queda
  //    sin ninguno. En ambos casos se cumple la misma propiedad, y aquí de forma
  //    aún más fuerte: **ningún id fuera del conjunto permitido del programa
  //    puede llegar a persistirse**, porque el array que sale de aquí es un
  //    subconjunto de `allowedDocumentIds` por construcción. Lo que cambia es
  //    solo el radio de la penalización: antes un id inventado en un módulo
  //    invalidaba los otros diecinueve módulos correctos. Cada descarte se
  //    registra en el log, así que la conducta del modelo sigue siendo
  //    auditable.
  if (Array.isArray(module_.sourceDocumentIds)) {
    const cited = module_.sourceDocumentIds;
    const kept: string[] = [];

    for (const entry of cited) {
      if (typeof entry === 'string' && allowedDocumentIds.has(entry)) {
        if (!kept.includes(entry)) {
          kept.push(entry);
        } else {
          adjustments.push(
            `${path}.sourceDocumentIds: id duplicado eliminado (${entry})`,
          );
        }
        continue;
      }
      result.droppedSourceDocumentIds.push(describeValue(entry));
    }

    module_.sourceDocumentIds = kept;

    if (cited.length > 0 && kept.length === 0) {
      result.modulesWithoutValidSource.push(index);
    }
  }

  return module_;
}

// ============================================================
// 8. ENTRADA PÚBLICA
// ============================================================

/**
 * Normaliza la respuesta cruda del modelo antes de pasarla por Zod.
 *
 * Contrato:
 * - Es una función pura: no muta `raw`.
 * - Nunca añade contenido que el modelo no haya producido (ni secciones, ni
 *   preguntas, ni ids de documento). Solo recorta, deduplica, acota y descarta.
 * - Si la forma es irreconocible (no es un objeto con `modules` array) devuelve
 *   el payload tal cual: no hay nada que normalizar sin inventar estructura, y
 *   Zod produce los `issues` que alimentan el reintento de reparación.
 */
export function normalizeGeneratedModules(
  raw: unknown,
  allowedDocumentIds: Iterable<string>,
): NormalizedModuleGeneration {
  const allowed =
    allowedDocumentIds instanceof Set
      ? (allowedDocumentIds as ReadonlySet<string>)
      : new Set(allowedDocumentIds);

  const result: NormalizedModuleGeneration = {
    payload: undefined,
    droppedSourceDocumentIds: [],
    modulesWithoutValidSource: [],
    adjustments: [],
  };

  const trimmed = deepTrim(raw);

  if (!isPlainObject(trimmed) || !Array.isArray(trimmed.modules)) {
    result.payload = trimmed;
    return result;
  }

  const modules = trimmed.modules.map((module_, index) =>
    normalizeModule(module_, index, allowed, result),
  );

  result.payload = { ...trimmed, modules };
  return result;
}

// ============================================================
// 9. REINTENTO DE REPARACIÓN
// ============================================================

/**
 * Tope de errores que viajan en la instrucción de reparación. Una respuesta muy
 * mal formada puede producir cientos de `issues`, y enviarlos todos infla el
 * prompt sin aportar señal.
 */
const MAX_REPAIR_ISSUES = 40;

/** Forma mínima de un `ZodError`, para no acoplar este módulo a una versión. */
interface ZodIssueLike {
  path: ReadonlyArray<PropertyKey>;
  message: string;
}

interface ZodErrorLike {
  issues: ReadonlyArray<ZodIssueLike>;
}

/**
 * `issues` de Zod aplanados a `ruta: mensaje`.
 *
 * Se prefiere esto a `error.flatten()` porque `flatten` agrupa por la clave de
 * primer nivel y pierde la posición dentro de los arrays: para el log y para el
 * reintento, `modules.0.evaluationQuestions.1.correctAnswer` es la información
 * útil.
 */
export function flattenZodIssues(error: ZodErrorLike): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((segment) =>
        typeof segment === 'symbol'
          ? (segment.description ?? 'symbol')
          : String(segment),
      )
      .join('.');

    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Instrucción de corrección para el segundo intento.
 *
 * Se envía junto con la respuesta previa del propio modelo (como turno
 * `assistant`), de modo que la petición es "aquí está tu JSON y aquí lo que
 * falla en él; devuélvelo corregido".
 *
 * IDIOMA: esta instrucción es técnica y va dirigida al modelo, no al empleado,
 * así que se queda en inglés independientemente del idioma del programa (el
 * prompt de sistema ya lleva la directiva de idioma del contenido). Lo que sí
 * necesita es prohibir explícitamente la retraducción: al pedir "devuelve el
 * mismo JSON corregido" un modelo puede aprovechar para reescribir el contenido
 * —y traducirlo al idioma de esta instrucción—, lo que convertiría una
 * reparación de forma en un cambio de contenido.
 */
export function buildModuleRepairInstruction(issues: string[]): string {
  const listed = issues.slice(0, MAX_REPAIR_ISSUES);
  const omitted = issues.length - listed.length;

  return `Your previous JSON response was syntactically valid but failed schema validation.

<VALIDATION_ERRORS>
${listed.map((issue) => `- ${issue}`).join('\n')}${
    omitted > 0 ? `\n- (${omitted} more error(s) omitted)` : ''
  }
</VALIDATION_ERRORS>

Return the SAME JSON object with exactly those problems fixed. Requirements:
- Output only the corrected JSON object, no prose, no markdown fences.
- Keep every module, section and question you already wrote; do not shorten or drop content to make validation pass.
- Do NOT translate or rewrite the content you already produced. Keep every title, description, body, key point, question, option and explanation in the language you already used, word for word, except where a listed error forces a change.
- Paths use dot notation over the JSON you returned: "modules.0.evaluationQuestions.1.correctAnswer" is the correctAnswer of the second question of the first module.
- correctAnswer must match one of that question's options exactly, character for character.
- true_false questions need exactly 2 unique options; open_ended questions must omit "options"; multiple_choice needs 2-20 unique options.
- If evaluationEnabled is false, evaluationQuestions must be []. If it is true, there must be at least one question.
- sourceDocumentIds must only contain document IDs from the list you were given, and every module needs at least one.
- durationEstimate must be an integer between 1 and 480.`;
}
