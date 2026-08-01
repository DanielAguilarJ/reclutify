import type { SentimentData } from '@/types';

/**
 * Lectura de la confianza detectada en una respuesta del candidato.
 *
 * POR QUÉ ESTO ES UN MÓDULO Y NO UNA EXPRESIÓN EN EL JSX
 * ------------------------------------------------------
 * La pantalla del informe leía el mismo dato de dos formas distintas, y las dos estaban mal en
 * sentidos opuestos:
 *
 *     // en la gráfica
 *     confidence: e.sentiment?.confidence || 50
 *
 *     // en la lista de señales, treinta líneas más abajo
 *     entry.sentiment?.confidence || 0
 *
 * `confidence` va de 0 a 100 y **0 es un valor válido**: significa que el candidato no mostró
 * ninguna seguridad en esa respuesta. Con `||`, un 0 medido es falsy:
 *
 *   - En la gráfica pasaba a 50, o sea el punto medio: el candidato aparecía sereno.
 *   - En la lista pasaba a 0 con etiqueta roja, que es lo correcto para un 0 medido.
 *
 * El mismo turno se pintaba como «50 %» arriba y «0 %, rojo» abajo. Quien decide una contratación
 * veía dos versiones contradictorias del mismo dato.
 *
 * Y el `|| 0` de la lista tenía el error inverso: una confianza que el modelo NO midió salía como
 * «0 %» en rojo, es decir «evasión máxima», cuando la verdad es «no se midió». Penalizaba al
 * candidato por un hueco en los datos.
 *
 * De ahí que la respuesta sea `number | null`: hay tres estados —medido, medido a cero, y no
 * medido— y con un `number` no se pueden representar los tres.
 */

/**
 * Valor con el que se dibuja un punto SIN medición, solo para que la línea no se corte.
 *
 * No es un dato: la interfaz tiene que marcarlo como no medido en lugar de pintarlo igual que una
 * medición real. Es el punto medio porque es la posición que menos sugiere.
 */
export const UNMEASURED_CONFIDENCE_PLOT_VALUE = 50;

/** Umbral desde el que la confianza se considera alta. */
export const CONFIDENCE_HIGH = 70;

/** Umbral desde el que la confianza se considera media. */
export const CONFIDENCE_MEDIUM = 40;

/**
 * Devuelve la confianza medida, o `null` si no se midió.
 *
 * Un valor fuera de 0-100 se ACOTA en lugar de descartarse, por el mismo motivo que en
 * `evaluation.service.ts`: el modelo devuelve ocasionalmente 105 o -3, y tirar la medición entera
 * por eso perdería su juicio. Lo que no se acepta es un valor no numérico o no finito, que no es
 * una medición sino un fallo de formato.
 *
 * @param sentiment Datos de sentimiento del turno. `null`/`undefined` cuentan como no medido.
 */
export function readConfidence(
  sentiment: Partial<SentimentData> | null | undefined,
): number | null {
  const raw = sentiment?.confidence;

  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;

  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** Nivel cualitativo, para elegir el color sin repetir los umbrales en el JSX. */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unmeasured';

/**
 * Clasifica la confianza en un nivel.
 *
 * `unmeasured` existe para que la interfaz pueda distinguirlo de `low`. Eran lo mismo antes, y
 * confundirlos es lo que hacía que un hueco en los datos se leyera como una señal contra el
 * candidato.
 *
 * @param confidence Resultado de `readConfidence`.
 */
export function classifyConfidence(confidence: number | null): ConfidenceLevel {
  if (confidence === null) return 'unmeasured';
  if (confidence >= CONFIDENCE_HIGH) return 'high';
  if (confidence >= CONFIDENCE_MEDIUM) return 'medium';
  return 'low';
}
