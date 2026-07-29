import 'server-only';

import type { TrainingErrorLanguage } from './document-errors';

/**
 * Traducción de las excepciones de Postgres del módulo de capacitación a
 * respuestas HTTP accionables.
 *
 * Las funciones transaccionales de `supabase/migrations/2026071800*.sql`
 * señalan cada precondición violada con `RAISE EXCEPTION '<identificador>'`.
 * PostgREST entrega ese identificador dentro de `error.message`, a veces solo
 * (`'forbidden'`) y a veces envuelto (`'exception: forbidden'`). Hoy cada ruta
 * inspecciona el texto con `rpcError.message?.includes(...)`, con listas
 * distintas por ruta y mensajes duplicados. Este módulo centraliza ese parseo
 * (diseño, sección 6).
 *
 * Reglas de diseño:
 *
 * - **Un identificador desconocido devuelve `null`.** La ruta debe caer en su
 *   500 genérico en lugar de inventar un status. Nunca se adivina.
 * - **La causa técnica no se traduce.** El texto que viaja al cliente proviene
 *   siempre del catálogo, igual que en `document-errors.ts`; el error de
 *   Supabase se sigue registrando completo en el log del servidor.
 * - **Bilingüe.** `es` es el idioma por defecto; `en` conserva el texto que hoy
 *   devuelven las rutas para que la centralización no altere contratos ya
 *   verificados por pruebas.
 */

// ============================================================
// 1. TIPOS
// ============================================================

/** Entrada del catálogo: status HTTP más el mensaje en cada idioma. */
export interface TrainingRpcErrorEntry {
  status: number;
  es: string;
  en: string;
}

/** Par que consumen las rutas para construir la respuesta. */
export interface TrainingRpcErrorResolution {
  status: number;
  message: string;
}

// ============================================================
// 2. CATÁLOGO DE EXCEPCIONES
// ============================================================

/**
 * Todos los identificadores que las funciones de capacitación pueden lanzar,
 * extraídos de las migraciones `202607180002`, `202607180003`, `202607180004`
 * y de la migración consolidada `202607280002`.
 *
 * Criterio de status:
 *
 * - `403` cuando el actor no tiene derecho a la operación (`forbidden`) o el
 *   recurso está cerrado para él (`module_locked`, que las rutas ya responden
 *   como 403).
 * - `404` para los `*_not_found` y para los casos en los que el recurso existe
 *   pero no está asignado al solicitante, que es indistinguible de inexistente
 *   desde su punto de vista (`module_not_assigned*`).
 * - `409` para precondiciones de estado: programa no publicado, sin rol, sin
 *   módulos, con documentos sin procesar, documento en uso, desajustes de
 *   organización o vacante, y transiciones de módulo inválidas.
 * - `400` para valores fuera de rango que llegan del cliente (`invalid_score`,
 *   `invalid_time_delta`).
 * - `422` para `unauthorized_source_document`: el contenido generado por la IA
 *   citó un documento ajeno al programa. No es culpa de la petición del
 *   administrador ni un fallo de infraestructura; se corrige regenerando.
 * - `500` para violaciones del contrato interno entre la ruta y la función SQL
 *   (`*_must_be_array`, `module_title_required`, `invalid_message_batch_size`).
 *   Estas excepciones solo se disparan si el servidor construyó mal el
 *   argumento: el administrador no puede hacer nada, así que se mantienen como
 *   error del servidor. Se catalogan igualmente para que el log y el mensaje
 *   sean concretos en lugar de un 500 opaco.
 */
export const TRAINING_RPC_ERRORS = {
  // ---- Autorización y acceso ----
  forbidden: {
    status: 403,
    es: 'No tienes permisos de administrador sobre esta organización para completar la operación.',
    en: 'Forbidden',
  },
  module_locked: {
    status: 403,
    es: 'El módulo está bloqueado. Completa el módulo anterior para desbloquearlo.',
    en: 'Module is locked',
  },

  // ---- Recursos inexistentes ----
  training_program_not_found: {
    status: 404,
    es: 'El programa de capacitación no existe o no pertenece a esta organización.',
    en: 'Training program not found',
  },
  candidate_result_not_found: {
    status: 404,
    es: 'No se encontró el resultado del candidato que intentas contratar.',
    en: 'Candidate result not found',
  },
  role_not_found: {
    status: 404,
    es: 'La vacante indicada no existe o no pertenece a esta organización.',
    en: 'Role vacancy not found',
  },
  training_employee_not_found: {
    status: 404,
    es: 'No se encontró el registro de capacitación del empleado.',
    en: 'Training employee not found',
  },
  training_module_not_found: {
    status: 404,
    es: 'El módulo de capacitación no existe.',
    en: 'Training module not found',
  },
  module_not_found: {
    status: 404,
    es: 'El módulo de capacitación no existe.',
    en: 'Training module not found',
  },
  training_progress_not_found: {
    status: 404,
    es: 'No se encontró el progreso de este módulo para el empleado.',
    en: 'Training progress not found',
  },
  module_not_assigned: {
    status: 404,
    es: 'El módulo no forma parte del programa asignado al empleado.',
    en: 'Module not found or not assigned',
  },
  module_not_assigned_to_employee: {
    status: 404,
    es: 'El módulo no forma parte del programa asignado al empleado.',
    en: 'Module not found or not assigned',
  },
  active_session_not_found: {
    status: 404,
    es: 'La sesión de capacitación ya no está activa. Vuelve a abrir el módulo.',
    en: 'Active training session not found',
  },

  // ---- Precondiciones del programa ----
  training_program_not_published: {
    status: 409,
    es: 'Publica el programa de capacitación antes de contratar candidatos.',
    en: 'Training program must be published before hiring',
  },
  training_program_has_no_role: {
    status: 409,
    es: 'Asigna una vacante al programa antes de publicarlo o usarlo en una contratación.',
    en: 'Assign a role to the program before publishing',
  },
  training_program_has_no_modules: {
    status: 409,
    es: 'Añade al menos un módulo al programa antes de publicarlo o usarlo en una contratación.',
    en: 'Add at least one module before publishing',
  },
  training_program_has_unready_documents: {
    status: 409,
    es: 'Espera a que todos los documentos terminen de procesarse antes de publicar el programa.',
    en: 'All required documents must finish processing before publishing',
  },
  only_draft_programs_can_be_published: {
    status: 409,
    es: 'Solo los programas en borrador se pueden publicar.',
    en: 'Only draft programs can be published',
  },
  only_draft_programs_can_be_modified: {
    status: 409,
    es: 'El programa ya está publicado. Crea una versión nueva para modificarlo.',
    en: 'Create a new program version before editing',
  },
  only_draft_programs_can_replace_modules: {
    status: 409,
    es: 'El programa ya está publicado. Crea una versión nueva antes de regenerar los módulos.',
    en: 'Create a new program version before regenerating modules',
  },
  only_published_or_archived_programs_can_be_versioned: {
    status: 409,
    es: 'Solo los programas publicados o archivados admiten una versión nueva.',
    en: 'Only published or archived programs can be versioned',
  },
  draft_version_already_exists: {
    status: 409,
    es: 'Ya existe una versión en borrador para esta vacante. Termínala o descártala antes de crear otra.',
    en: 'A draft version already exists for this role vacancy',
  },
  program_modules_are_in_use: {
    status: 409,
    es: 'No se pueden regenerar los módulos mientras haya empleados capacitándose con ellos.',
    en: 'Modules cannot be regenerated while employees are in training',
  },

  // ---- Documentos ----
  training_document_in_use: {
    status: 409,
    es: 'El documento es fuente de uno o más módulos. Quítalo de esos módulos antes de desvincularlo.',
    en: 'Document is used by one or more modules. Remove it from those modules first.',
  },

  // ---- Contratación ----
  candidate_org_mismatch: {
    status: 409,
    es: 'El candidato pertenece a otra organización que la del programa de capacitación.',
    en: 'Candidate does not match the training program organization',
  },
  candidate_role_mismatch: {
    status: 409,
    es: 'El candidato aplicó a una vacante distinta de la del programa de capacitación.',
    en: 'Candidate does not match the training program role',
  },

  // ---- Avance de módulos y evaluación ----
  module_not_available: {
    status: 409,
    es: 'El módulo no está disponible en su estado actual.',
    en: 'Module is not available',
  },
  module_not_available_for_evaluation: {
    status: 409,
    es: 'El módulo no está disponible para evaluarse en su estado actual.',
    en: 'Module is not available for evaluation',
  },
  module_requires_evaluation: {
    status: 409,
    es: 'El módulo tiene evaluación obligatoria y no puede completarse directamente.',
    en: 'Module requires evaluation and cannot be completed directly',
  },
  module_does_not_require_evaluation: {
    status: 409,
    es: 'El módulo no tiene evaluación, así que no admite el envío de respuestas.',
    en: 'Module does not require evaluation',
  },
  training_progress_not_available: {
    status: 409,
    es: 'El progreso del módulo no admite actualizaciones de tiempo en su estado actual.',
    en: 'Training progress is not available for time updates',
  },
  training_session_message_limit_reached: {
    status: 409,
    es: 'La conversación alcanzó su límite de mensajes. Vuelve a abrir el módulo para continuar en una sesión nueva.',
    en: 'Training session reached its message limit',
  },

  // ---- Valores fuera de rango recibidos del cliente ----
  invalid_score: {
    status: 400,
    es: 'La puntuación de la evaluación está fuera del rango permitido.',
    en: 'Invalid evaluation score',
  },
  invalid_time_delta: {
    status: 400,
    es: 'El tiempo reportado para el módulo está fuera del rango permitido.',
    en: 'Invalid training time delta',
  },

  // ---- Contenido generado inválido ----
  unauthorized_source_document: {
    status: 422,
    es: 'La generación citó un documento que no está asociado al programa. Vuelve a generar los módulos.',
    en: 'Generated modules cite a document that is not linked to the program',
  },

  // ---- Contrato interno entre la ruta y la función SQL ----
  modules_must_be_array: {
    status: 500,
    es: 'No se pudieron guardar los módulos por un formato inválido en la solicitud interna.',
    en: 'Modules payload sent to the database was malformed',
  },
  module_title_required: {
    status: 500,
    es: 'No se pudieron guardar los módulos porque uno llegó sin título.',
    en: 'A module in the payload was missing its title',
  },
  source_document_ids_must_be_array: {
    status: 500,
    es: 'No se pudieron guardar los módulos por un formato inválido en sus documentos fuente.',
    en: 'Source document list sent to the database was malformed',
  },
  messages_must_be_array: {
    status: 500,
    es: 'No se pudo guardar la conversación por un formato inválido en la solicitud interna.',
    en: 'Message payload sent to the database was malformed',
  },
  invalid_message_batch_size: {
    status: 500,
    es: 'No se pudo guardar la conversación porque el lote de mensajes tenía un tamaño inválido.',
    en: 'Message batch size sent to the database was invalid',
  },
} as const satisfies Record<string, TrainingRpcErrorEntry>;

/** Identificadores catalogados, útil para recorrer el mapa en pruebas. */
export type TrainingRpcErrorIdentifier = keyof typeof TRAINING_RPC_ERRORS;

// ============================================================
// 3. RECONOCIMIENTO DEL IDENTIFICADOR EN EL MENSAJE
// ============================================================

/**
 * Etiquetas con las que PostgREST y las capas intermedias envuelven el
 * mensaje original. `'exception: training_document_in_use'` es la forma que ya
 * aparece en las pruebas actuales del proyecto.
 */
const WRAPPER_LABEL =
  /^(?:exception|error|db error|database error|rpc error|postgres(?:ql)?|postgrest|pgrst\d*|p\d{4})\s*:\s*/;

/** Caracteres que forman parte de un identificador: minúsculas, dígitos y `_`. */
const IDENTIFIER_CHAR = '0-9a-z_';

/**
 * Normaliza el texto de un error antes de buscar el identificador: minúsculas,
 * espacios colapsados, comillas y puntuación de cierre fuera, y etiquetas
 * envolventes retiradas de forma repetida (`'exception: error: forbidden'`).
 */
function normalizeErrorText(raw: string): string {
  let text = raw.toLowerCase().replace(/\s+/g, ' ').trim();

  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(WRAPPER_LABEL, '').trim();
    text = text.replace(/^["'`]+/, '').replace(/["'`]+$/, '').trim();
    text = text.replace(/[.;,]+$/, '').trim();
  }

  return text;
}

/**
 * Expresiones precompiladas por identificador.
 *
 * Dos ambigüedades a resolver, ambas señaladas por el diseño:
 *
 * 1. **Identificadores que son prefijo o sufijo de otros.** `module_not_available`
 *    está contenido en `module_not_available_for_evaluation`, y
 *    `module_not_found` en `training_module_not_found`. La búsqueda se delimita
 *    con clases de caracteres que tratan `_` como parte del identificador, de
 *    modo que un identificador solo coincide si a su izquierda y derecha no hay
 *    más caracteres de identificador. Además, el recorrido va del identificador
 *    más largo al más corto, así que ante un mensaje que contenga varios gana
 *    siempre el más específico.
 * 2. **Identificadores de una sola palabra del lenguaje natural.** `forbidden`
 *    podría aparecer por casualidad en cualquier frase en inglés
 *    (`'access to this row is forbidden'`). Para estos, la coincidencia se
 *    ancla al inicio del texto normalizado, que es donde Postgres coloca el
 *    mensaje de `RAISE EXCEPTION`. Un identificador con `_` no corre ese riesgo
 *    y se busca en cualquier posición.
 */
const IDENTIFIER_PATTERNS: ReadonlyMap<TrainingRpcErrorIdentifier, RegExp> =
  new Map(
    (Object.keys(TRAINING_RPC_ERRORS) as TrainingRpcErrorIdentifier[])
      .slice()
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .map((identifier) => [
        identifier,
        identifier.includes('_')
          ? new RegExp(
              `(^|[^${IDENTIFIER_CHAR}])${identifier}([^${IDENTIFIER_CHAR}]|$)`,
            )
          : new RegExp(`^${identifier}([^${IDENTIFIER_CHAR}]|$)`),
      ]),
  );

/**
 * Reúne los textos candidatos de cualquier forma de error: cadena, `Error`,
 * error de PostgREST (`{ message, details, hint }`) o error anidado en
 * `{ error: ... }`. El orden importa: `message` es el campo que lleva el
 * identificador y se inspecciona primero.
 */
function collectErrorTexts(error: unknown, depth = 0): string[] {
  if (depth > 3 || error === null || error === undefined) {
    return [];
  }

  if (typeof error === 'string') {
    return [error];
  }

  if (error instanceof Error) {
    return [error.message, ...collectErrorTexts(error.cause, depth + 1)];
  }

  if (typeof error !== 'object') {
    return [];
  }

  const record = error as Record<string, unknown>;
  const texts: string[] = [];

  for (const key of ['message', 'details', 'hint'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      texts.push(value);
    }
  }

  if (record.error !== undefined && record.error !== error) {
    texts.push(...collectErrorTexts(record.error, depth + 1));
  }

  return texts;
}

/**
 * Devuelve el identificador catalogado que aparece en el error, o `null` si no
 * reconoce ninguno.
 */
export function findTrainingRpcErrorIdentifier(
  error: unknown,
): TrainingRpcErrorIdentifier | null {
  const texts = collectErrorTexts(error);

  for (const text of texts) {
    const normalized = normalizeErrorText(text);
    if (!normalized) {
      continue;
    }

    for (const [identifier, pattern] of IDENTIFIER_PATTERNS) {
      if (normalized === identifier || pattern.test(normalized)) {
        return identifier;
      }
    }
  }

  return null;
}

// ============================================================
// 4. RESOLUCIÓN A STATUS Y MENSAJE
// ============================================================

/**
 * Traduce el error de una RPC de capacitación a `{ status, message }`.
 *
 * Devuelve `null` cuando el error no corresponde a ninguna excepción conocida,
 * para que la ruta responda su 500 genérico y no exponga texto interno.
 */
export function resolveTrainingRpcError(
  error: unknown,
  language: TrainingErrorLanguage = 'es',
): TrainingRpcErrorResolution | null {
  const identifier = findTrainingRpcErrorIdentifier(error);

  if (!identifier) {
    return null;
  }

  const entry = TRAINING_RPC_ERRORS[identifier];

  return { status: entry.status, message: entry[language] };
}
