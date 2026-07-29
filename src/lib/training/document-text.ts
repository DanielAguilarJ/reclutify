/**
 * Criterio de «texto suficiente» de un documento de capacitación.
 *
 * POR QUÉ ESTE MÓDULO EXISTE
 * --------------------------
 * El umbral decide dos cosas distintas en dos lados de la aplicación:
 *
 * - En el servidor (`processTrainingDocument`) decide el `status` de la fila:
 *   por debajo del umbral, un PDF queda en `needs_ocr` y cualquier otro tipo en
 *   `failed`; por encima, el documento pasa a `ready`, se fragmenta y alimenta
 *   al tutor y a la generación de módulos.
 * - En el navegador (`@/lib/training/client-ocr`) decide si merece la pena
 *   ejecutar OCR: si el PDF trae capa de texto, el OCR es puro gasto.
 *
 * Si cada lado llevara su propio número, el navegador podría decidir «hay capa
 * de texto, no hace falta OCR» sobre un PDF que el servidor va a marcar
 * `needs_ocr`, y el documento quedaría atascado exactamente igual que antes de
 * existir el OCR. Por eso el número vive aquí, en un módulo **sin**
 * `server-only`: es el único sitio donde se define y los dos lados lo importan.
 */

/**
 * Mínimo de caracteres (ya recortados) para considerar que un documento aporta
 * contenido utilizable. El valor es el histórico del servidor: no se sube ni se
 * baja en este tramo para no cambiar el estado de documentos ya procesados.
 */
export const MIN_TRAINING_TEXT_CHARS = 50;

/**
 * Máximo de caracteres de texto de documento que se aceptan **del cliente** (el
 * campo `ocrText` de `POST /api/training/documents/process`).
 *
 * Vive aquí, junto al mínimo, por la misma razón que el mínimo: los dos lados lo
 * necesitan. El esquema Zod de `contracts.ts` lo aplica al validar el cuerpo, y
 * el OCR del navegador lo aplica al terminar, para no gastar minutos
 * reconociendo texto que el esquema va a rechazar con un 400. Si el número
 * viviera solo en el esquema, un documento denso podría completar el OCR y morir
 * en la validación.
 *
 * El valor: un PDF escaneado de 40 páginas (el tope por defecto del OCR de
 * navegador) da del orden de 100.000 caracteres, así que medio millón deja
 * margen para el tope máximo configurable y sigue muy por debajo del límite de
 * cuerpo de petición de la plataforma (~4,5 MB), porque medio millón de
 * caracteres son ~0,5 MB de JSON.
 */
export const MAX_TRAINING_OCR_TEXT_CHARS = 500_000;

/**
 * `true` cuando el texto alcanza el umbral. Acepta `null`/`undefined` porque los
 * extractores pueden devolver vacío sin lanzar.
 */
export function hasSufficientTrainingText(
  text: string | null | undefined,
): boolean {
  if (typeof text !== 'string') {
    return false;
  }

  return text.trim().length >= MIN_TRAINING_TEXT_CHARS;
}
