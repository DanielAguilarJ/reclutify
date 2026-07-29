import 'server-only';

/**
 * Construcción del contexto documental que se envía al modelo al generar
 * módulos de capacitación.
 *
 * ── Qué estaba mal ───────────────────────────────────────────────────────────
 *
 * La ruta repartía un presupuesto fijo de 60.000 caracteres a partes iguales
 * entre los documentos y cortaba con un `slice` desnudo:
 *
 *   const charsPerDoc = Math.floor(60_000 / docCount);
 *   const excerpt = text.slice(0, charsPerDoc);
 *
 * Tres defectos, y el tercero es el que produce contenido inventado:
 *
 * 1. 60.000 caracteres ≈ 15.000 tokens. El modelo por defecto
 *    (`google/gemini-2.5-flash`) admite del orden de un millón, así que se
 *    usaba ~1,5 % de la ventana disponible.
 * 2. El reparto ignoraba el tamaño real: una hoja de una página y un manual de
 *    500 recibían lo mismo. El pequeño desperdiciaba su parte y el grande se
 *    quedaba corto.
 * 3. El corte era a media frase y **sin ninguna marca**. El prompt de sistema
 *    exige "at least 3-4 paragraphs of teaching content" por sección, y el
 *    modelo no tenía forma de saber que le faltaba material: rellenaba el hueco
 *    con contenido plausible que no está en ningún documento de la empresa.
 *
 * ── Qué hace este módulo ─────────────────────────────────────────────────────
 *
 * Lógica **pura**: entra texto, sale texto y metadatos. Sin IO, sin red, sin
 * Supabase, sin `fetch`. Por eso se puede probar de verdad (ver
 * `src/__tests__/training/document-context.test.ts`) y por eso la ruta queda
 * reducida a orquestar.
 *
 * - Presupuesto amplio y configurable (`TRAINING_CONTEXT_CHAR_BUDGET`).
 * - Reparto proporcional a la longitud real, con suelo mínimo por documento y
 *   redistribución iterativa del sobrante.
 * - Marca explícita de truncamiento dirigida al modelo: si un documento se
 *   recorta, se le dice cuántos caracteres faltan y se le prohíbe inferirlos.
 * - Metadatos por documento (incluido / omitido / truncado) para que la ruta
 *   pueda avisar al administrador en vez de recortar en silencio.
 */

// ============================================================
// 1. LÍMITE DE DOCUMENTOS
// ============================================================

/**
 * Tope de documentos que entran en una generación.
 *
 * Antes era un `20` literal dentro de un `.slice(0, 20)` en la ruta y los
 * documentos a partir del 21 desaparecían sin que nadie se enterara. El tope se
 * mantiene —no queremos peticiones de tamaño ilimitado contra el modelo ni
 * contra el presupuesto de tiempo de la función— pero ahora tiene nombre y
 * `limitProgramDocuments` devuelve cuántos quedaron fuera para poder decirlo.
 */
export const MAX_PROGRAM_DOCUMENTS = 20;

export interface DocumentLimitResult<T> {
  /** Los documentos que sí entran, en el mismo orden de entrada. */
  documents: T[];
  /** Cuántos quedaron fuera del tope. `0` cuando no sobró ninguno. */
  omittedCount: number;
}

/** Aplica `MAX_PROGRAM_DOCUMENTS` reportando lo que descarta. */
export function limitProgramDocuments<T>(
  documents: readonly T[],
  limit: number = MAX_PROGRAM_DOCUMENTS,
): DocumentLimitResult<T> {
  const effectiveLimit = Math.max(0, Math.floor(limit));
  return {
    documents: documents.slice(0, effectiveLimit),
    omittedCount: Math.max(0, documents.length - effectiveLimit),
  };
}

// ============================================================
// 2. PRESUPUESTO DE CARACTERES
// ============================================================

/** Variable de entorno que permite ajustar el presupuesto por despliegue. */
export const TRAINING_CONTEXT_CHAR_BUDGET_ENV = 'TRAINING_CONTEXT_CHAR_BUDGET';

/**
 * PRESUPUESTO POR DEFECTO — 300.000 caracteres
 * --------------------------------------------
 * No es un número redondo elegido a ojo; sale de dimensionar el caso peor con
 * el modelo *más pequeño* que alguien puede configurar razonablemente en
 * `TRAINING_AI_MODEL`, no con el modelo por defecto:
 *
 *   - Ventana del modelo más pequeño que se considera aceptable hoy: 128.000
 *     tokens de entrada. (El modelo por defecto, `google/gemini-2.5-flash`,
 *     admite ~1.000.000: con este presupuesto se queda en ~8 % de su ventana,
 *     que es exactamente el margen que buscamos.)
 *   - Menos el prompt de sistema y los metadatos del programa: ~3.000 tokens.
 *   - Menos sitio para la respuesta del modelo, que son módulos completos con
 *     secciones y preguntas: ~16.000 tokens.
 *   - Menos el eco de esa respuesta en el turno de reparación, que reenvía el
 *     contexto entero más el JSON anterior: otros ~16.000 tokens.
 *   → quedan ~93.000 tokens para documentos.
 *   - El castellano ronda los 4 caracteres por token con los tokenizadores
 *     actuales, pero se calcula con 3,5 para no depender de la media: es la
 *     dirección conservadora, porque menos caracteres por token significa menos
 *     caracteres que caben. A 3,5: ~325.000 caracteres.
 *
 * Se redondea a la baja hasta 300.000. Es 5 veces el presupuesto anterior, y
 * sobre todo es un tamaño en el que la mayoría de las bases de conocimiento
 * reales caben **enteras**, que es el objetivo: el truncamiento debe ser la
 * excepción, no el caso normal.
 *
 * Quien sepa que su modelo admite un millón de tokens puede subirlo con
 * `TRAINING_CONTEXT_CHAR_BUDGET`. No se impone techo máximo a ese ajuste
 * precisamente porque el techo real lo define el modelo configurado, que este
 * módulo no conoce.
 */
export const DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET = 300_000;

/**
 * Suelo mínimo por documento cuando el presupuesto no alcanza.
 *
 * Sin suelo, el reparto estrictamente proporcional deja a un documento pequeño
 * con unos cientos de caracteres cuando comparte presupuesto con un manual
 * enorme: material insuficiente para que el modelo escriba nada útil sobre él,
 * pero suficiente para que lo cite como fuente. 4.000 caracteres son unas dos
 * páginas: bastante para que el documento esté representado de verdad.
 *
 * El suelo se reduce automáticamente si `presupuesto / nº documentos` es menor
 * (ver `allocateCharBudget`): un suelo que no cabe no es un suelo.
 */
export const MIN_DOCUMENT_CHAR_FLOOR = 4_000;

/**
 * Lee el presupuesto del entorno.
 *
 * Solo acepta un entero positivo en notación decimal. Cualquier otra cosa
 * —vacío, `0`, negativo, decimal, `abc`, `1e6`, `Infinity`— cae al defecto: un
 * presupuesto mal escrito no debe degradar la generación en silencio, y menos
 * dejarla en cero.
 */
export function resolveContextCharBudget(
  rawValue: string | undefined = process.env[TRAINING_CONTEXT_CHAR_BUDGET_ENV],
): number {
  if (typeof rawValue !== 'string') {
    return DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET;
  }

  const trimmed = rawValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    return DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET;
  }

  return parsed;
}

// ============================================================
// 3. MARCA DE TRUNCAMIENTO
// ============================================================

/**
 * Etiqueta reconocible del marcador. Se expone para que las pruebas y la ruta
 * puedan detectar la presencia del marcador sin depender de su redacción
 * completa.
 */
export const TRUNCATION_MARKER_TAG = '[[DOCUMENT TRUNCATED';

/**
 * Marcador que cierra un documento recortado.
 *
 * Va en inglés porque forma parte del material que lee el modelo, igual que el
 * prompt de sistema, y es deliberadamente explícito en las tres cosas que el
 * modelo necesita saber: que el documento continúa, cuánto falta, y que no debe
 * reconstruirlo. Es la contrapartida de la regla equivalente del prompt de
 * sistema (`MODULE_GENERATION_SYSTEM_PROMPT`): una sola de las dos se puede
 * ignorar, las dos juntas son difíciles de pasar por alto.
 */
export function buildTruncationMarker(omittedChars: number): string {
  return `\n\n${TRUNCATION_MARKER_TAG}: this document continues beyond this point. ${omittedChars} characters were omitted here because they did not fit in the context budget, and they are NOT available to you. Do not infer, guess, reconstruct or invent the omitted content: write teaching material only from the text actually shown above for this document. A shorter module is correct; fabricated content is not.]]`;
}

// ============================================================
// 4. REPARTO DEL PRESUPUESTO
// ============================================================

/**
 * Reparte `budget` caracteres entre documentos de longitudes `lengths`.
 *
 * Propiedades que cumple, en este orden de prioridad:
 *
 * 1. **Si todo cabe, nadie se trunca.** Es el caso normal y es justo el que el
 *    código anterior no cumplía: con 60.000 caracteres a partes iguales, dos
 *    documentos de 40.000 se recortaban aunque sumaran 80.000 y hubiera sitio.
 * 2. **Nunca se excede el presupuesto**: `sum(resultado) <= budget`.
 * 3. **Proporcional a la longitud** cuando no cabe todo.
 * 4. **Suelo mínimo por documento**, reducido a `budget / n` si el suelo
 *    nominal no cabe.
 * 5. **Sobrante redistribuido**: un documento que necesita menos de lo que le
 *    tocaría se queda con lo que necesita y devuelve el resto al reparto. El
 *    bucle repite mientras siga habiendo documentos que se sacien, porque cada
 *    devolución puede saciar al siguiente (es el clásico llenado por niveles).
 */
export function allocateCharBudget(
  lengths: readonly number[],
  budget: number,
  floor: number = MIN_DOCUMENT_CHAR_FLOOR,
): number[] {
  const count = lengths.length;
  const allocation = new Array<number>(count).fill(0);

  if (count === 0) {
    return allocation;
  }

  const sanitizedLengths = lengths.map((length) =>
    Number.isFinite(length) && length > 0 ? Math.floor(length) : 0,
  );

  let remaining =
    Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0;

  if (remaining === 0) {
    return allocation;
  }

  const nominalFloor =
    Number.isFinite(floor) && floor > 0 ? Math.floor(floor) : 0;

  // Índices que aún compiten por presupuesto. Un documento vacío no compite:
  // no tiene nada que aportar y quedarse con suelo mínimo se lo robaría a los
  // que sí tienen texto.
  let pending = sanitizedLengths
    .map((_, index) => index)
    .filter((index) => sanitizedLengths[index] > 0);

  while (pending.length > 0 && remaining > 0) {
    const pendingTotal = pending.reduce(
      (total, index) => total + sanitizedLengths[index],
      0,
    );

    // Propiedad 1: todo lo que queda cabe → nadie se trunca.
    if (pendingTotal <= remaining) {
      for (const index of pending) {
        allocation[index] = sanitizedLengths[index];
      }
      return allocation;
    }

    // El suelo nominal solo se aplica si cabe para todos los pendientes.
    const passFloor = Math.min(
      nominalFloor,
      Math.floor(remaining / pending.length),
    );

    const settled: number[] = [];
    for (const index of pending) {
      const proportional = Math.floor(
        (remaining * sanitizedLengths[index]) / pendingTotal,
      );
      const share = Math.max(passFloor, proportional);
      if (sanitizedLengths[index] <= share) {
        // Necesita menos de lo que le toca: se le da lo suyo y el resto de su
        // cuota vuelve al pozo común en la siguiente iteración.
        allocation[index] = sanitizedLengths[index];
        settled.push(index);
      }
    }

    if (settled.length > 0) {
      for (const index of settled) {
        remaining -= allocation[index];
      }
      const settledSet = new Set(settled);
      pending = pending.filter((index) => !settledSet.has(index));
      continue;
    }

    // Nadie se sacia: reparto final. Primero el suelo (que ya se sabe que
    // cabe), después el resto en proporción a la longitud. Se hace en dos pasos
    // porque `max(suelo, proporcional)` a secas puede sumar más que el
    // presupuesto cuando el suelo eleva a unos y no a otros.
    for (const index of pending) {
      allocation[index] = passFloor;
      remaining -= passFloor;
    }

    if (remaining > 0) {
      let granted = 0;
      for (const index of pending) {
        const headroom = sanitizedLengths[index] - allocation[index];
        const extra = Math.min(
          headroom,
          Math.floor((remaining * sanitizedLengths[index]) / pendingTotal),
        );
        allocation[index] += extra;
        granted += extra;
      }
      remaining -= granted;

      // Restos de la división entera: se reparten de uno en uno empezando por
      // el documento más largo, que es el que más material pierde.
      if (remaining > 0) {
        const byLengthDesc = [...pending].sort(
          (a, b) => sanitizedLengths[b] - sanitizedLengths[a],
        );
        let progressed = true;
        while (remaining > 0 && progressed) {
          progressed = false;
          for (const index of byLengthDesc) {
            if (remaining === 0) break;
            if (allocation[index] < sanitizedLengths[index]) {
              allocation[index] += 1;
              remaining -= 1;
              progressed = true;
            }
          }
        }
      }
    }

    return allocation;
  }

  return allocation;
}

// ============================================================
// 5. CORTE EN UN LÍMITE NATURAL
// ============================================================

/**
 * Ventana de retroceso para buscar un límite natural de corte.
 *
 * Es proporcional al recorte (2 %) con un techo de 1.000 caracteres: el ajuste
 * tiene que ser pequeño respecto a lo que se incluye, o dejaríamos fuera texto
 * útil solo por acabar en un punto.
 */
function boundaryLookback(limit: number): number {
  return Math.max(1, Math.min(1_000, Math.floor(limit * 0.02)));
}

/**
 * Corta `text` en `limit` caracteres, retrocediendo a un límite natural cercano.
 *
 * Prioridad: fin de párrafo → fin de frase → fin de palabra → corte duro. El
 * corte duro solo ocurre si en toda la ventana no hay ni un espacio (texto sin
 * separadores, p. ej. una tabla exportada sin saltos), y aun así el marcador
 * avisa de que falta material.
 */
export function cutAtNaturalBoundary(text: string, limit: number): string {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;

  const window = boundaryLookback(limit);
  const searchStart = Math.max(0, limit - window);
  const candidate = text.slice(0, limit);

  const paragraphEnd = candidate.lastIndexOf('\n\n');
  if (paragraphEnd >= searchStart) {
    return candidate.slice(0, paragraphEnd).trimEnd();
  }

  const sentenceEnd = lastSentenceBoundary(candidate, searchStart);
  if (sentenceEnd >= searchStart) {
    return candidate.slice(0, sentenceEnd).trimEnd();
  }

  const lineEnd = candidate.lastIndexOf('\n');
  if (lineEnd >= searchStart) {
    return candidate.slice(0, lineEnd).trimEnd();
  }

  const wordEnd = candidate.lastIndexOf(' ');
  if (wordEnd >= searchStart) {
    return candidate.slice(0, wordEnd).trimEnd();
  }

  return candidate;
}

/**
 * Posición (exclusiva) del final de la última frase completa dentro de
 * `candidate`, o `-1` si no hay ninguna a partir de `searchStart`.
 *
 * Un signo de puntuación solo cierra frase si le sigue un espacio, un cierre de
 * comillas o paréntesis, o el final del fragmento. Así `3.5` o `art. 12` no se
 * confunden con un final de frase.
 */
function lastSentenceBoundary(candidate: string, searchStart: number): number {
  for (let index = candidate.length - 1; index >= searchStart; index -= 1) {
    const char = candidate[index];
    if (char !== '.' && char !== '!' && char !== '?' && char !== '…') {
      continue;
    }
    const next = candidate[index + 1];
    if (next === undefined || /[\s"'”)\]]/.test(next)) {
      return index + 1;
    }
  }
  return -1;
}

// ============================================================
// 6. CONSTRUCCIÓN DEL CONTEXTO
// ============================================================

export interface DocumentContextSource {
  id: string;
  fileName: string;
  /** Texto extraído. `null`/`undefined` se tratan como cadena vacía. */
  text: string | null | undefined;
}

/** Qué le pasó a un documento concreto. Base del aviso al administrador. */
export interface DocumentContextStat {
  id: string;
  fileName: string;
  /** Longitud original del texto extraído. */
  totalChars: number;
  /** Caracteres que viajan en el prompt (sin contar cabecera ni marcador). */
  includedChars: number;
  /** Caracteres que se quedaron fuera. `0` si el documento entró completo. */
  omittedChars: number;
  truncated: boolean;
}

export interface DocumentContextResult {
  /** Bloque listo para insertar en `<UNTRUSTED_DOCUMENT_CONTENT>`. */
  context: string;
  /** Presupuesto efectivamente usado para el reparto. */
  budgetChars: number;
  /** Suma de longitudes originales. */
  totalChars: number;
  /** Suma de caracteres incluidos. Nunca mayor que `budgetChars`. */
  includedChars: number;
  /** Suma de caracteres omitidos por truncamiento. */
  omittedChars: number;
  /** Detalle por documento, en el orden de entrada. */
  documents: DocumentContextStat[];
  /** Documentos que se truncaron. Subconjunto de `documents`. */
  truncatedDocuments: DocumentContextStat[];
}

const documentHeader = (source: DocumentContextSource): string =>
  `--- DOCUMENT: ${source.fileName} (ID: ${source.id}) ---`;

/**
 * Construye el contexto documental y describe lo que hizo con él.
 *
 * Función pura: no lee el entorno (el presupuesto se le pasa ya resuelto, lo
 * que permite probarla con valores pequeños) y no produce ningún efecto.
 */
export function buildDocumentContext(
  sources: readonly DocumentContextSource[],
  options: { budgetChars?: number; floorChars?: number } = {},
): DocumentContextResult {
  const budgetChars =
    options.budgetChars !== undefined
      ? options.budgetChars
      : DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET;
  const floorChars =
    options.floorChars !== undefined
      ? options.floorChars
      : MIN_DOCUMENT_CHAR_FLOOR;

  const texts = sources.map((source) =>
    typeof source.text === 'string' ? source.text : '',
  );
  const allocation = allocateCharBudget(
    texts.map((text) => text.length),
    budgetChars,
    floorChars,
  );

  const documents: DocumentContextStat[] = [];
  const blocks: string[] = [];

  sources.forEach((source, index) => {
    const text = texts[index];
    const allowed = allocation[index];
    const body = allowed >= text.length ? text : cutAtNaturalBoundary(text, allowed);
    const includedChars = body.length;
    const omittedChars = Math.max(0, text.length - includedChars);
    const truncated = omittedChars > 0;

    documents.push({
      id: source.id,
      fileName: source.fileName,
      totalChars: text.length,
      includedChars,
      omittedChars,
      truncated,
    });

    blocks.push(
      `${documentHeader(source)}\n${body}${
        truncated ? buildTruncationMarker(omittedChars) : ''
      }`,
    );
  });

  return {
    context: blocks.join('\n\n'),
    budgetChars,
    totalChars: documents.reduce((total, doc) => total + doc.totalChars, 0),
    includedChars: documents.reduce((total, doc) => total + doc.includedChars, 0),
    omittedChars: documents.reduce((total, doc) => total + doc.omittedChars, 0),
    documents,
    truncatedDocuments: documents.filter((doc) => doc.truncated),
  };
}

// ============================================================
// 7. AVISO AL ADMINISTRADOR
// ============================================================

/**
 * Aviso estructurado de lo que no llegó al modelo.
 *
 * Viaja en la respuesta de éxito de `POST /api/training/generate-modules` como
 * campo **añadido**: `{ success, modules }` sigue intacto para cualquier
 * consumidor existente. Es información, no error: los módulos se generaron y se
 * guardaron; lo que el administrador necesita saber es que el modelo no vio
 * todo el material, para decidir si divide el programa o recorta documentos.
 */
export interface TrainingContextNotice {
  /** Presupuesto aplicado, para que el aviso sea interpretable. */
  budgetChars: number;
  /** Tope de documentos vigente. */
  documentLimit: number;
  /** Documentos descartados por el tope. */
  documentsOmittedByLimit: number;
  /** Caracteres omitidos en total por truncamiento. */
  omittedChars: number;
  /** Documentos truncados, identificados por nombre de archivo. */
  truncatedDocuments: Array<{
    fileName: string;
    includedChars: number;
    omittedChars: number;
  }>;
}

/**
 * Devuelve el aviso, o `null` si no hay nada que avisar (todo el material entró
 * y ningún documento quedó fuera del tope). `null` es lo que mantiene la
 * respuesta idéntica a la actual en el caso normal.
 */
export function buildTrainingContextNotice(
  result: DocumentContextResult,
  documentsOmittedByLimit: number,
  documentLimit: number = MAX_PROGRAM_DOCUMENTS,
): TrainingContextNotice | null {
  const omittedByLimit = Math.max(0, Math.floor(documentsOmittedByLimit));

  if (result.truncatedDocuments.length === 0 && omittedByLimit === 0) {
    return null;
  }

  return {
    budgetChars: result.budgetChars,
    documentLimit,
    documentsOmittedByLimit: omittedByLimit,
    omittedChars: result.omittedChars,
    truncatedDocuments: result.truncatedDocuments.map((doc) => ({
      fileName: doc.fileName,
      includedChars: doc.includedChars,
      omittedChars: doc.omittedChars,
    })),
  };
}
