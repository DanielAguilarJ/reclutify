import 'server-only';

/**
 * Identificador del modelo de IA del proyecto: **una sola definición**.
 *
 * ── Qué estaba mal ───────────────────────────────────────────────────────────
 *
 * El identificador estaba escrito a mano en cinco sitios, y no de la misma
 * forma. Tres usaban `??`:
 *
 *   const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL ?? 'google/...';
 *
 * y dos usaban `||`:
 *
 *   const model = process.env.TRAINING_AI_MODEL || 'google/...';
 *
 * La diferencia no es de estilo. `??` solo cae al defecto con `null` o
 * `undefined`; la cadena vacía **le parece un valor válido**. Y la cadena vacía
 * es exactamente lo que produce `TRAINING_AI_MODEL=` en el entorno, la forma que
 * invita `.env.example` (que ya trae `TRAINING_CONTEXT_CHAR_BUDGET=` vacía) y la
 * que deja una variable borrada a medias en el panel de la plataforma.
 *
 * Resultado con `TRAINING_AI_MODEL=` definida y vacía: las tres rutas del `??`
 * enviaban `"model": ""` y OpenRouter respondía `400`, mientras las dos del `||`
 * funcionaban con normalidad. El mismo valor de entorno rompía el tutor, la
 * calificación de preguntas abiertas y la generación de módulos, y dejaba en pie
 * la contratación y el análisis de documentos. Un fallo así se diagnostica mal
 * precisamente porque es parcial.
 *
 * ── Qué hace este módulo ─────────────────────────────────────────────────────
 *
 * - `DEFAULT_AI_MODEL` es la **única** aparición del identificador en el
 *   proyecto. Cambiar de modelo es cambiar una línea, no cinco (y no seis: la
 *   ruta de parseo de CV tenía además el literal incrustado en el cuerpo de su
 *   petición, sin pasar por ninguna variable).
 * - `resolveTrainingAiModel` trata la cadena vacía o de solo espacios **como
 *   ausencia**, así que ya no importa qué operador se escriba en la ruta: el
 *   comportamiento es el mismo en las cinco.
 * - Recorta el valor válido. Un salto de línea arrastrado al pegar la variable
 *   en el panel de Vercel produce `"google/gemini-3.6-flash\n"`, que es un
 *   identificador inválido y otro `400` difícil de ver a ojo.
 *
 * ── Por qué `google/gemini-3.6-flash` ────────────────────────────────────────
 *
 * - **Ventana de contexto idéntica**: 1.048.576 tokens, la misma que
 *   `google/gemini-2.5-flash`. Por eso el dimensionado de
 *   `DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET` (300.000 caracteres, ~8 % de la
 *   ventana) sigue valiendo tal cual y no se toca ninguna constante.
 * - **Cuesta más**: 1,50 USD por millón de tokens de entrada frente a 0,30 del
 *   modelo anterior (5×), y 7,50 USD por millón de salida frente a 2,50 (3×).
 *   Es la contrapartida consciente del cambio, no un descuido.
 * - **Se revierte sin desplegar**: `TRAINING_AI_MODEL` sigue mandando sobre el
 *   defecto, así que basta con fijarla en el entorno para volver a cualquier
 *   modelo, incluido `google/gemini-2.5-flash`.
 * - Si lo que hace falta es recuperar el **coste** anterior y no el modelo
 *   anterior, `google/gemini-3.5-flash-lite` tiene el mismo precio que
 *   `google/gemini-2.5-flash` (0,30 / 2,50 USD por millón).
 *
 * Aviso operativo: los modelos de la familia 3.x **razonan por defecto**, lo que
 * añade tokens de salida y latencia frente a 2.5. Donde eso importa es en el
 * análisis de documentos, que vive bajo un presupuesto de tiempo; el tope por
 * llamada es ajustable por entorno precisamente por esto (ver
 * `TRAINING_ANALYSIS_CALL_TIMEOUT_MS` en `src/lib/training/document-analysis.ts`).
 */

/**
 * Modelo por defecto de todas las llamadas de IA del proyecto.
 *
 * Única definición del identificador. Si aparece un segundo literal
 * `google/...` en el código, es un sitio que se olvidó de importar esto.
 */
export const DEFAULT_AI_MODEL = 'google/gemini-3.6-flash';

/** Variable de entorno que sustituye el modelo del centro de capacitación. */
export const TRAINING_AI_MODEL_ENV = 'TRAINING_AI_MODEL';

/**
 * Modelo del centro de capacitación.
 *
 * `TRAINING_AI_MODEL` manda cuando trae contenido; en cualquier otro caso se usa
 * `DEFAULT_AI_MODEL`. Se considera **ausente**:
 *
 * - la variable no definida (`undefined`);
 * - la cadena vacía (`TRAINING_AI_MODEL=`);
 * - una cadena de solo espacios, tabuladores o saltos de línea.
 *
 * El valor válido se devuelve recortado.
 */
export function resolveTrainingAiModel(
  rawValue: string | undefined = process.env[TRAINING_AI_MODEL_ENV],
): string {
  if (typeof rawValue !== 'string') {
    return DEFAULT_AI_MODEL;
  }

  const trimmed = rawValue.trim();

  return trimmed.length > 0 ? trimmed : DEFAULT_AI_MODEL;
}
