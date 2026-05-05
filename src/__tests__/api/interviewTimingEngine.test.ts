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
