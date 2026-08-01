import { describe, expect, it } from 'vitest';

import {
  classifyConfidence,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  readConfidence,
} from '@/lib/candidate-results/sentiment';

/**
 * La pantalla del informe leía este dato de dos formas contradictorias, y las dos estaban mal en
 * sentidos opuestos. Decide una contratación, así que va con tabla de casos.
 */
describe('readConfidence', () => {
  it('CERO ES UN VALOR MEDIDO, no un hueco', () => {
    // Es el bug. La gráfica hacía `e.sentiment?.confidence || 50`, así que un 0 medido —el
    // candidato no mostró ninguna seguridad en esa respuesta— se pintaba en el punto medio y
    // aparecía sereno, mientras la lista de abajo lo marcaba en rojo con el mismo dato.
    expect(readConfidence({ confidence: 0 })).toBe(0);
  });

  it('devuelve el valor medido tal cual', () => {
    expect(readConfidence({ confidence: 73 })).toBe(73);
    expect(readConfidence({ confidence: 100 })).toBe(100);
  });

  it('distingue «no medido» de «medido a cero»', () => {
    // Son tres estados y con un `number` no se pueden representar. El `|| 0` de la lista los
    // confundía y penalizaba al candidato por un hueco en los datos.
    expect(readConfidence(undefined)).toBeNull();
    expect(readConfidence(null)).toBeNull();
    expect(readConfidence({})).toBeNull();
    expect(readConfidence({ confidence: 0 })).toBe(0);
  });

  it('acota los valores que el modelo devuelve fuera de rango', () => {
    // Mismo criterio que en `evaluation.service.ts`: acotar en lugar de descartar, porque tirar la
    // medición entera por un 105 perdería el juicio del modelo.
    expect(readConfidence({ confidence: 105 })).toBe(100);
    expect(readConfidence({ confidence: -3 })).toBe(0);
  });

  it('redondea los decimales', () => {
    expect(readConfidence({ confidence: 72.4 })).toBe(72);
    expect(readConfidence({ confidence: 72.6 })).toBe(73);
  });

  it('rechaza lo que no es una medición', () => {
    // `NaN` e `Infinity` no son un cero: son un fallo de formato, y pintarlos como 0 % en rojo
    // sería inventar una señal contra el candidato.
    expect(readConfidence({ confidence: Number.NaN })).toBeNull();
    expect(readConfidence({ confidence: Number.POSITIVE_INFINITY })).toBeNull();
    expect(readConfidence({ confidence: '80' as unknown as number })).toBeNull();
  });
});

describe('classifyConfidence', () => {
  it('los umbrales incluyen su límite', () => {
    expect(classifyConfidence(CONFIDENCE_HIGH)).toBe('high');
    expect(classifyConfidence(CONFIDENCE_HIGH - 1)).toBe('medium');
    expect(classifyConfidence(CONFIDENCE_MEDIUM)).toBe('medium');
    expect(classifyConfidence(CONFIDENCE_MEDIUM - 1)).toBe('low');
  });

  it('un cero medido es `low`, no `unmeasured`', () => {
    expect(classifyConfidence(0)).toBe('low');
  });

  it('la ausencia de medición tiene su propio nivel', () => {
    // Sin este nivel, la interfaz no puede evitar pintar un hueco como una señal.
    expect(classifyConfidence(null)).toBe('unmeasured');
  });

  it('cubre todo el rango sin huecos', () => {
    for (let value = 0; value <= 100; value++) {
      expect(['high', 'medium', 'low']).toContain(classifyConfidence(value));
    }
  });
});
