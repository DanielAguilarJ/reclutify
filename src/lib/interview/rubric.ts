import type { TopicRubric } from '@/types';

/**
 * Forma mínima que estas comprobaciones necesitan.
 *
 * Se declara parcial a propósito: una rúbrica a medio rellenar es justo el caso que hay que
 * clasificar, así que exigir `TopicRubric` completo obligaría a construir datos válidos para
 * preguntar si son válidos. Un `TopicRubric` entero encaja aquí por tipado estructural.
 */
export type PartialRubric = Partial<TopicRubric>;

/**
 * Reglas sobre la completitud de una rúbrica.
 *
 * POR QUÉ ESTO ES UN MÓDULO
 * -------------------------
 * La comprobación «esta rúbrica está completa» estaba escrita a mano tres veces dentro de
 * `admin/create-role/page.tsx`, con la misma expresión repetida:
 *
 *     !t.rubric.excellent?.trim() || !t.rubric.acceptable?.trim() || !t.rubric.poor?.trim()
 *
 * Decide dos cosas con consecuencias: si se bloquea el guardado de un criterio crítico, y si
 * «Enriquecer con IA» conserva o machaca lo que el reclutador escribió. Duplicada en tres
 * sitios, cualquier corrección en uno deja los otros dos decidiendo distinto.
 */

/** Peso desde el que un criterio se considera crítico para la contratación. */
export const CRITICAL_TOPIC_WEIGHT = 8;

/** Peso por defecto cuando el criterio no lo declara. */
export const DEFAULT_TOPIC_WEIGHT = 5;

/**
 * `true` si la rúbrica tiene los tres niveles con texto.
 *
 * Los tres hacen falta: Zara compara la respuesta del candidato contra los tres descriptores, y
 * con uno vacío el nivel correspondiente no se puede asignar.
 *
 * @param rubric Rúbrica a comprobar. `undefined` cuenta como incompleta.
 */
export function hasCompleteRubric(rubric: PartialRubric | undefined): boolean {
  if (!rubric) return false;

  return Boolean(
    rubric.excellent?.trim() && rubric.acceptable?.trim() && rubric.poor?.trim(),
  );
}

/**
 * `true` si el criterio pesa lo suficiente para que su rúbrica sea obligatoria.
 *
 * @param rubric Rúbrica del criterio, de donde sale el peso.
 */
export function isCriticalTopic(rubric: PartialRubric | undefined): boolean {
  return (rubric?.weight ?? DEFAULT_TOPIC_WEIGHT) >= CRITICAL_TOPIC_WEIGHT;
}
