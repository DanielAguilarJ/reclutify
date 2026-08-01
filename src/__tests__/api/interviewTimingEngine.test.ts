import { describe, it, expect } from 'vitest';
import {
  computeInterviewPlan,
  getQuestionBudget,
  getInterviewPaceConfig,
  computeRealTimePacing,
  getQuestionsRange,
  type TopicInput,
  type InterviewPlan,
} from '@/lib/interviewTimingEngine';

// ─── Helper: generate N topics with specified or default weights ───
function makeTopics(count: number, weights?: number[]): TopicInput[] {
  return Array.from({ length: count }, (_, i) => ({
    label: `Topic ${i + 1}`,
    weight: weights?.[i] ?? 5,
  }));
}

describe('InterviewTimingEngine', () => {
  // ══════════════════════════════════════════════════════════════
  // SECTION 1: Distribution Table Validation
  // Verifies the engine produces question counts that match
  // the expected distribution table (within ±30% tolerance
  // to account for rounding and weight distribution).
  // ══════════════════════════════════════════════════════════════

  describe('Distribution Table', () => {
    it('10 min / 3 topics → ~6 total questions', () => {
      const plan = computeInterviewPlan(10, makeTopics(3));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(4);
      expect(plan.totalQuestions).toBeLessThanOrEqual(9);
      // Each topic should get at most 4 questions (short interview cap)
      plan.topics.forEach(t => expect(t.questionBudget).toBeLessThanOrEqual(4));
    });

    it('15 min / 4 topics → ~10 total questions', () => {
      const plan = computeInterviewPlan(15, makeTopics(4));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(7);
      expect(plan.totalQuestions).toBeLessThanOrEqual(14);
    });

    it('30 min / 5 topics → ~23 total questions', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(15);
      expect(plan.totalQuestions).toBeLessThanOrEqual(30);
    });

    it('45 min / 6 topics → ~38 total questions', () => {
      const plan = computeInterviewPlan(45, makeTopics(6));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(28);
      expect(plan.totalQuestions).toBeLessThanOrEqual(48);
    });

    it('60 min / 7 topics → ~52 total questions', () => {
      const plan = computeInterviewPlan(60, makeTopics(7));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(38);
      expect(plan.totalQuestions).toBeLessThanOrEqual(65);
    });

    it('90 min / 7 topics → ~86 total questions', () => {
      const plan = computeInterviewPlan(90, makeTopics(7));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(60);
      expect(plan.totalQuestions).toBeLessThanOrEqual(98);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 2: Invariants
  // ══════════════════════════════════════════════════════════════

  describe('Invariants', () => {
    it('sum of allocated seconds never exceeds usable seconds', () => {
      const durations = [5, 10, 15, 30, 45, 60, 90, 120, 180];
      const topicCounts = [1, 3, 5, 7, 10];

      for (const duration of durations) {
        for (const count of topicCounts) {
          const plan = computeInterviewPlan(duration, makeTopics(count));
          const sumAllocated = plan.topics.reduce((s, t) => s + t.allocatedSeconds, 0);
          expect(sumAllocated).toBeLessThanOrEqual(plan.usableSeconds + 1); // +1 for rounding
        }
      }
    });

    it('total overhead + usable seconds = total seconds', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      const totalOverhead = plan.greetingOverheadSec + plan.closingOverheadSec + plan.transitionOverheadSec;
      expect(totalOverhead + plan.usableSeconds).toBe(30 * 60);
    });

    it('every topic gets at least 1 question', () => {
      const plan = computeInterviewPlan(5, makeTopics(10));
      plan.topics.forEach(t => {
        expect(t.questionBudget).toBeGreaterThanOrEqual(1);
      });
    });

    it('no topic exceeds maxPerTopic cap', () => {
      // 10 min → cap at 4
      const plan10 = computeInterviewPlan(10, makeTopics(1, [10]));
      expect(plan10.topics[0].questionBudget).toBeLessThanOrEqual(4);

      // 30 min → cap at 8
      const plan30 = computeInterviewPlan(30, makeTopics(1, [10]));
      expect(plan30.topics[0].questionBudget).toBeLessThanOrEqual(8);

      // 90 min → cap at 14
      const plan90 = computeInterviewPlan(90, makeTopics(1, [10]));
      expect(plan90.topics[0].questionBudget).toBeLessThanOrEqual(14);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 3: Weight Proportionality
  // ══════════════════════════════════════════════════════════════

  describe('Weight Proportionality', () => {
    it('topic with weight 10 gets ≥2x questions vs topic with weight 3', () => {
      const topics: TopicInput[] = [
        { label: 'Heavy', weight: 10 },
        { label: 'Light', weight: 3 },
        { label: 'Medium', weight: 5 },
      ];
      const plan = computeInterviewPlan(45, topics);

      const heavy = plan.topics.find(t => t.label === 'Heavy')!;
      const light = plan.topics.find(t => t.label === 'Light')!;

      // Heavy should get significantly more time
      expect(heavy.allocatedSeconds).toBeGreaterThan(light.allocatedSeconds * 2);
      // Heavy should get more or equal questions
      expect(heavy.questionBudget).toBeGreaterThanOrEqual(light.questionBudget);
    });

    it('topics with equal weights get equal budgets', () => {
      const plan = computeInterviewPlan(30, makeTopics(4, [5, 5, 5, 5]));

      const budgets = plan.topics.map(t => t.questionBudget);
      // All should be the same (or differ by at most 1 due to rounding)
      const min = Math.min(...budgets);
      const max = Math.max(...budgets);
      expect(max - min).toBeLessThanOrEqual(1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 4: CV Overhead
  // ══════════════════════════════════════════════════════════════

  describe('CV Overhead', () => {
    it('with CV → fewer questions than without CV (same duration)', () => {
      const topics = makeTopics(5);
      const planWithCv = computeInterviewPlan(30, topics, { hasCv: true });
      const planWithoutCv = computeInterviewPlan(30, topics, { hasCv: false });

      // CV adds overhead, so total questions should be fewer (or equal in edge cases)
      expect(planWithCv.totalQuestions).toBeLessThanOrEqual(planWithoutCv.totalQuestions);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 5: Pace Config
  // ══════════════════════════════════════════════════════════════

  describe('Pace Config', () => {
    it('≤7 min → concise style', () => {
      const config = getInterviewPaceConfig(5);
      expect(config.questionStyle).toBe('concise');
      expect(config.acknowledgmentLength).toBe('minimal');
    });

    it('≤15 min → concise style', () => {
      const config = getInterviewPaceConfig(15);
      expect(config.questionStyle).toBe('concise');
    });

    it('16-35 min → standard style', () => {
      const config = getInterviewPaceConfig(30);
      expect(config.questionStyle).toBe('standard');
    });

    it('36-55 min → deep style', () => {
      const config = getInterviewPaceConfig(45);
      expect(config.questionStyle).toBe('deep');
    });

    it('>55 min → deep style', () => {
      const config = getInterviewPaceConfig(90);
      expect(config.questionStyle).toBe('deep');
    });

    it('pace config is included in the plan', () => {
      const plan = computeInterviewPlan(15, makeTopics(3));
      expect(plan.paceConfig).toBeDefined();
      expect(plan.paceConfig.questionStyle).toBe('concise');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 6: getQuestionBudget
  // ══════════════════════════════════════════════════════════════

  describe('getQuestionBudget', () => {
    it('returns correct budget for valid index', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      const budget = getQuestionBudget(2, plan);
      expect(budget.label).toBe('Topic 3');
      expect(budget.questionBudget).toBeGreaterThanOrEqual(1);
    });

    it('returns fallback for out-of-bounds index', () => {
      const plan = computeInterviewPlan(30, makeTopics(3));
      const budget = getQuestionBudget(99, plan);
      expect(budget.label).toBe('Unknown');
      expect(budget.questionBudget).toBe(2);
    });

    it('returns fallback for negative index', () => {
      const plan = computeInterviewPlan(30, makeTopics(3));
      const budget = getQuestionBudget(-1, plan);
      expect(budget.label).toBe('Unknown');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 7: getQuestionsRange
  // ══════════════════════════════════════════════════════════════

  describe('getQuestionsRange', () => {
    it('formats as "min-max" string', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      const range = getQuestionsRange(plan.topics[0]);
      expect(range).toMatch(/^\d+-\d+$/);
    });

    it('min is at least 1', () => {
      const plan = computeInterviewPlan(5, makeTopics(10));
      plan.topics.forEach(t => {
        const range = getQuestionsRange(t);
        const [min] = range.split('-').map(Number);
        expect(min).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 8: Real-Time Pacing
  // ══════════════════════════════════════════════════════════════

  describe('computeRealTimePacing', () => {
    it('on track when progress matches elapsed time', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      // At 50% time, on topic 2 with half its questions done → roughly on track
      const pacing = computeRealTimePacing(900, 2, 2, plan); // 15min elapsed, topic 3
      expect(pacing.onTrack).toBe(true);
      expect(pacing.urgency).not.toBe('critical');
    });

    it('suggests adding questions when ahead of schedule', () => {
      const plan = computeInterviewPlan(60, makeTopics(5));
      // At 10% time, already on topic 2 → way ahead
      const pacing = computeRealTimePacing(360, 3, 3, plan);
      expect(pacing.suggestAddQuestions).toBeGreaterThanOrEqual(0);
    });

    it('suggests skipping when behind schedule', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      // At 80% time, still on topic 0 → way behind
      const pacing = computeRealTimePacing(1440, 0, 1, plan);
      expect(pacing.urgency).not.toBe('relaxed');
    });

    it('critical urgency at 90%+ elapsed', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      // At 95% time
      const pacing = computeRealTimePacing(1710, 3, 1, plan);
      expect(pacing.urgency).toBe('critical');
    });

    it('message is always a non-empty string', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      const pacing = computeRealTimePacing(600, 1, 2, plan);
      expect(pacing.message).toBeTruthy();
      expect(typeof pacing.message).toBe('string');
    });

    describe('grace period', () => {
      it('suppresses critical urgency when isGracePeriod=true', () => {
        const plan = computeInterviewPlan(5, makeTopics(7));
        // At 150% elapsed time, still mid-interview → without grace this would be 'critical'.
        const withoutGrace = computeRealTimePacing(450, 3, 0, plan);
        expect(withoutGrace.urgency).toBe('critical');

        const withGrace = computeRealTimePacing(450, 3, 0, plan, { isGracePeriod: true });
        expect(withGrace.urgency).toBe('normal');
        expect(withGrace.onTrack).toBe(true);
      });

      it('does not suggest skipping questions in grace period', () => {
        const plan = computeInterviewPlan(5, makeTopics(7));
        const pacing = computeRealTimePacing(450, 3, 0, plan, { isGracePeriod: true });
        expect(pacing.suggestSkipQuestions).toBe(0);
        expect(pacing.suggestAddQuestions).toBe(0);
      });

      it('keeps effectiveHardLimit equal to base budget in grace period', () => {
        const plan = computeInterviewPlan(5, makeTopics(7));
        const baseBudget = plan.topics[3].questionBudget;
        const pacing = computeRealTimePacing(600, 3, 0, plan, { isGracePeriod: true });
        expect(pacing.effectiveHardLimit).toBe(baseBudget);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 8b: El tope efectivo TIENE que poder forzar el avance
  // ══════════════════════════════════════════════════════════════

  describe('effectiveHardLimit fuerza el avance de tema', () => {
    /**
     * Reproduce la decisión REAL de `src/app/api/chat/route.ts`:
     *
     *     const maxQuestionsHardLimit = Math.max(1, pacing.effectiveHardLimit);
     *     const mustAdvanceNow = turn.questionsInCurrentTopic >= maxQuestionsHardLimit;
     *
     * Se replica aquí porque el fallo no estaba en ninguno de los dos lados por separado: el
     * motor devolvía un número coherente consigo mismo y la ruta hacía una comparación
     * razonable. Estaba en que ese número NUNCA satisfacía la comparación.
     */
    function mustAdvance(pacing: { effectiveHardLimit: number }, asked: number): boolean {
      return asked >= Math.max(1, pacing.effectiveHardLimit);
    }

    it('REGRESIÓN: con urgencia crítica el tema avanza, no se queda clavado', () => {
      // Era el fallo más grave del motor. `effectiveHardLimit` se calculaba con un suelo de
      // `asked + 1`, así que `asked >= limit` era insatisfacible y la entrevista se quedaba
      // CLAVADA en un tema justo cuando se quedaba sin tiempo. Los temas restantes acababan con
      // cero evidencia, y como la evaluación puntúa por tema, el candidato quedaba juzgado
      // sobre una rúbrica que la entrevista nunca cubrió.
      const plan = computeInterviewPlan(30, makeTopics(5));
      const budget = plan.topics[1].questionBudget;

      // 95 % del tiempo consumido, todavía en el tema 1, con el presupuesto ya agotado.
      const pacing = computeRealTimePacing(1710, 1, budget, plan);

      expect(pacing.urgency).toBe('critical');
      expect(pacing.effectiveHardLimit).toBeLessThanOrEqual(budget);
      expect(mustAdvance(pacing, budget)).toBe(true);
    });

    it('y el tope NO escala siguiendo a las preguntas ya hechas', () => {
      // El síntoma exacto: el tope subía 5, 6, 7… a medida que el modelo insistía.
      const plan = computeInterviewPlan(30, makeTopics(5));
      const limits = [3, 4, 5, 6, 7, 12].map(
        (asked) => computeRealTimePacing(1710, 1, asked, plan).effectiveHardLimit,
      );

      // Todos idénticos: el tope es función de la urgencia, no de lo ya preguntado.
      expect(new Set(limits).size).toBe(1);
    });

    it('el tema avanza también con urgencia normal (no había regresión aquí)', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));
      const budget = plan.topics[2].questionBudget;
      const pacing = computeRealTimePacing(900, 2, budget, plan);

      expect(mustAdvance(pacing, budget)).toBe(true);
    });

    it('INVARIANTE: en todo el espacio de estados el avance llega a dispararse', () => {
      // Barrido exhaustivo. Para cada duración, número de temas, tema actual y momento del
      // reloj, tiene que existir una cantidad de preguntas que fuerce el avance. Si para alguna
      // combinación no existe, esa entrevista puede quedarse encerrada en un tema.
      const unreachable: string[] = [];

      for (const minutes of [10, 15, 30, 45, 60, 90]) {
        for (const numTopics of [1, 3, 5, 8, 12]) {
          const plan = computeInterviewPlan(minutes, makeTopics(numTopics));
          for (let topicIndex = 0; topicIndex < numTopics; topicIndex++) {
            for (const pct of [0.1, 0.5, 0.8, 0.95, 1.3]) {
              const elapsed = Math.round(minutes * 60 * pct);
              // 30 es holgadamente mayor que cualquier presupuesto posible (el tope duro del
              // motor es 14), así que si con 30 preguntas no avanza, no avanza nunca.
              const canAdvance = Array.from({ length: 30 }, (_, i) => i + 1).some((asked) =>
                mustAdvance(computeRealTimePacing(elapsed, topicIndex, asked, plan), asked),
              );
              if (!canAdvance) {
                unreachable.push(`${minutes}min/${numTopics}temas/tema${topicIndex}/${pct}`);
              }
            }
          }
        }
      }

      expect(unreachable).toEqual([]);
    });

    it('el suelo es 1: ningún tema se queda sin ninguna pregunta', () => {
      const combos: number[] = [];
      for (const minutes of [10, 30, 60]) {
        for (const numTopics of [1, 5, 10]) {
          const plan = computeInterviewPlan(minutes, makeTopics(numTopics));
          for (let topicIndex = 0; topicIndex < numTopics; topicIndex++) {
            for (const pct of [0.1, 0.5, 0.95, 1.5]) {
              combos.push(
                computeRealTimePacing(Math.round(minutes * 60 * pct), topicIndex, 0, plan)
                  .effectiveHardLimit,
              );
            }
          }
        }
      }

      expect(Math.min(...combos)).toBeGreaterThanOrEqual(1);
    });

    it('el periodo de gracia sigue conservando el presupuesto íntegro', () => {
      // La corrección no debe tocar el atajo de gracia: ahí el tiempo dejó de mandar a
      // propósito, para poder cubrir los temas que faltan sin prisa.
      const plan = computeInterviewPlan(30, makeTopics(5));
      const budget = plan.topics[1].questionBudget;
      const pacing = computeRealTimePacing(2400, 1, budget, plan, { isGracePeriod: true });

      expect(pacing.effectiveHardLimit).toBe(budget);
      expect(pacing.urgency).toBe('normal');
    });

    it('con urgencia crítica no se ofrecen preguntas extra', () => {
      // Con más de diez temas, `progressDelta` puede pasar de 1 estando al 90 % del tiempo. La
      // rama de «vas adelantado» iba antes que la de urgencia crítica, así que el modelo podía
      // recibir «puedes hacer preguntas extra para explorar en profundidad» con el 95 % del
      // tiempo consumido.
      const plan = computeInterviewPlan(30, makeTopics(12));
      const pacing = computeRealTimePacing(1710, 11, 0, plan);

      expect(pacing.urgency).toBe('critical');
      expect(pacing.suggestAddQuestions).toBe(0);
      expect(pacing.message).toContain('CRITICAL');
    });

    it('la holgura del adelantado no supera el presupuesto en más de 1', () => {
      const plan = computeInterviewPlan(60, makeTopics(5));
      const budget = plan.topics[3].questionBudget;
      const pacing = computeRealTimePacing(360, 3, 0, plan);

      expect(pacing.effectiveHardLimit).toBeLessThanOrEqual(budget + 1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 9: Edge Cases
  // ══════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('1 topic, 5 min → at least 2 questions', () => {
      const plan = computeInterviewPlan(5, makeTopics(1));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(2);
    });

    it('10 topics, 5 min → at least 1 question per topic', () => {
      const plan = computeInterviewPlan(5, makeTopics(10));
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(10);
      plan.topics.forEach(t => expect(t.questionBudget).toBeGreaterThanOrEqual(1));
    });

    it('180 min, 3 topics → capped, no runaway budgets', () => {
      const plan = computeInterviewPlan(180, makeTopics(3));
      plan.topics.forEach(t => {
        expect(t.questionBudget).toBeLessThanOrEqual(14); // maxPerTopic for long interviews
      });
      // Should still produce a reasonable total
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(30);
      expect(plan.totalQuestions).toBeLessThanOrEqual(42);
    });

    it('handles 0 topics gracefully (defaults to 1)', () => {
      const plan = computeInterviewPlan(30, []);
      expect(plan.topics.length).toBe(1);
      expect(plan.topics[0].label).toBe('General');
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(1);
    });

    it('handles 0 minutes gracefully (floors to 1)', () => {
      const plan = computeInterviewPlan(0, makeTopics(3));
      expect(plan.totalMinutes).toBe(1);
      expect(plan.totalQuestions).toBeGreaterThanOrEqual(1);
    });

    it('handles negative duration gracefully', () => {
      const plan = computeInterviewPlan(-10, makeTopics(3));
      expect(plan.totalMinutes).toBe(1);
    });

    it('handles topics with weight 0 (floors to 1)', () => {
      const topics: TopicInput[] = [
        { label: 'Zero', weight: 0 },
        { label: 'Normal', weight: 5 },
      ];
      const plan = computeInterviewPlan(30, topics);
      const zero = plan.topics.find(t => t.label === 'Zero')!;
      expect(zero.weight).toBe(1);
      expect(zero.questionBudget).toBeGreaterThanOrEqual(1);
    });

    it('question type adjustments work correctly', () => {
      const behavioralTopics: TopicInput[] = [
        { label: 'Behavioral', weight: 5, questionType: 'behavioral' },
      ];
      const verificationTopics: TopicInput[] = [
        { label: 'Verification', weight: 5, questionType: 'verification' },
      ];
      const planB = computeInterviewPlan(30, behavioralTopics);
      const planV = computeInterviewPlan(30, verificationTopics);

      // Verification questions have shorter cycles → more questions
      expect(planV.totalQuestions).toBeGreaterThanOrEqual(planB.totalQuestions);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 10: Plan Structure
  // ══════════════════════════════════════════════════════════════

  describe('Plan Structure', () => {
    it('contains all required fields', () => {
      const plan = computeInterviewPlan(30, makeTopics(5));

      expect(plan.totalMinutes).toBe(30);
      expect(plan.greetingOverheadSec).toBeGreaterThan(0);
      expect(plan.closingOverheadSec).toBeGreaterThan(0);
      expect(plan.transitionOverheadSec).toBeGreaterThan(0);
      expect(plan.usableSeconds).toBeGreaterThan(0);
      expect(plan.topics).toHaveLength(5);
      expect(plan.totalQuestions).toBeGreaterThan(0);
      expect(plan.paceConfig).toBeDefined();
    });

    it('topic budgets have all required fields', () => {
      const plan = computeInterviewPlan(30, makeTopics(3));
      plan.topics.forEach(t => {
        expect(t.label).toBeTruthy();
        expect(t.weight).toBeGreaterThanOrEqual(1);
        expect(t.allocatedSeconds).toBeGreaterThanOrEqual(0);
        expect(t.questionBudget).toBeGreaterThanOrEqual(1);
        expect(t.questionCycleSec).toBeGreaterThanOrEqual(30);
      });
    });
  });
});
