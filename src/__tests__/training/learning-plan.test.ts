import { describe, it, expect } from 'vitest';
import type { EmployeeTrainingModule, TrainingProgress } from '@/types';
import {
  buildLearningPlan,
  findPlanNeighbors,
  formatMinutes,
  resolveNextAction,
  sortModulesByOrder,
} from '@/lib/training/learning-plan';

function makeModule(
  id: string,
  sortOrder: number,
  overrides: Partial<EmployeeTrainingModule> = {}
): EmployeeTrainingModule {
  return {
    id,
    programId: 'prog-1',
    title: `Módulo ${id}`,
    content: { sections: [] },
    sourceDocumentIds: [],
    sortOrder,
    durationEstimate: 15,
    evaluationEnabled: true,
    evaluationQuestions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProgress(
  moduleId: string,
  status: TrainingProgress['status'],
  overrides: Partial<TrainingProgress> = {}
): TrainingProgress {
  return {
    id: `progress-${moduleId}`,
    employeeId: 'emp-1',
    moduleId,
    status,
    timeSpent: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('learning plan', () => {
  it('orders modules by sortOrder and numbers them from one', () => {
    const plan = buildLearningPlan(
      [makeModule('c', 3), makeModule('a', 1), makeModule('b', 2)],
      []
    );

    expect(plan.items.map((item) => item.module.id)).toEqual(['a', 'b', 'c']);
    expect(plan.items.map((item) => item.position)).toEqual([1, 2, 3]);
  });

  it('treats a module with no progress row as locked', () => {
    const plan = buildLearningPlan([makeModule('a', 1)], []);

    expect(plan.items[0].status).toBe('locked');
  });

  it('sums time spent and computes the completed percentage', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2), makeModule('c', 3)],
      [
        makeProgress('a', 'completed', { timeSpent: 20, score: 90 }),
        makeProgress('b', 'in_progress', { timeSpent: 5 }),
        makeProgress('c', 'locked'),
      ]
    );

    expect(plan.completedCount).toBe(1);
    expect(plan.percent).toBe(33);
    expect(plan.totalTimeSpent).toBe(25);
  });

  it('keeps a stable order when sortOrder is missing', () => {
    const withoutOrder = [
      makeModule('a', 0, { sortOrder: undefined as unknown as number }),
      makeModule('b', 0, { sortOrder: undefined as unknown as number }),
    ];

    expect(sortModulesByOrder(withoutOrder).map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('resolveNextAction', () => {
  it('reports an empty plan', () => {
    expect(resolveNextAction(buildLearningPlan([], []))).toEqual({
      kind: 'empty',
      item: null,
    });
  });

  it('invites to start the first available module when nothing began', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2)],
      [makeProgress('a', 'available'), makeProgress('b', 'locked')]
    );

    const action = resolveNextAction(plan);

    expect(action.kind).toBe('start');
    expect(action.item?.module.id).toBe('a');
  });

  it('points at the module in progress even if a later one is available', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2), makeModule('c', 3)],
      [
        makeProgress('a', 'completed'),
        makeProgress('b', 'in_progress'),
        makeProgress('c', 'available'),
      ]
    );

    const action = resolveNextAction(plan);

    expect(action.kind).toBe('resume');
    expect(action.item?.module.id).toBe('b');
  });

  it('resumes on the next available module once something was completed', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2)],
      [makeProgress('a', 'completed'), makeProgress('b', 'available')]
    );

    const action = resolveNextAction(plan);

    expect(action.kind).toBe('resume');
    expect(action.item?.module.id).toBe('b');
  });

  it('closes the program when every module is completed', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2)],
      [makeProgress('a', 'completed'), makeProgress('b', 'completed')]
    );

    expect(resolveNextAction(plan)).toEqual({ kind: 'complete', item: null });
  });

  it('closes the program when the employee status says so', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2)],
      [makeProgress('a', 'completed'), makeProgress('b', 'available')]
    );

    expect(resolveNextAction(plan, true)).toEqual({
      kind: 'complete',
      item: null,
    });
  });

  it('offers a review when nothing is open but something was completed', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1), makeModule('b', 2), makeModule('c', 3)],
      [
        makeProgress('a', 'completed'),
        makeProgress('b', 'completed'),
        makeProgress('c', 'locked'),
      ]
    );

    const action = resolveNextAction(plan);

    expect(action.kind).toBe('review');
    expect(action.item?.module.id).toBe('b');
  });

  it('reports a fully locked plan', () => {
    const plan = buildLearningPlan(
      [makeModule('a', 1)],
      [makeProgress('a', 'locked')]
    );

    expect(resolveNextAction(plan)).toEqual({ kind: 'locked', item: null });
  });
});

describe('findPlanNeighbors', () => {
  const plan = buildLearningPlan(
    [makeModule('a', 1), makeModule('b', 2), makeModule('c', 3)],
    [
      makeProgress('a', 'completed'),
      makeProgress('b', 'in_progress'),
      makeProgress('c', 'locked'),
    ]
  );

  it('resolves both neighbours of a middle module', () => {
    const neighbors = findPlanNeighbors(plan, 'b');

    expect(neighbors.previous?.module.id).toBe('a');
    expect(neighbors.next?.module.id).toBe('c');
    expect(neighbors.current?.position).toBe(2);
  });

  it('has no previous on the first module and no next on the last', () => {
    expect(findPlanNeighbors(plan, 'a').previous).toBeNull();
    expect(findPlanNeighbors(plan, 'c').next).toBeNull();
  });

  it('returns nothing for a module outside the plan', () => {
    expect(findPlanNeighbors(plan, 'zzz')).toEqual({
      previous: null,
      next: null,
      current: null,
    });
  });
});

describe('formatMinutes', () => {
  it('formats minutes, hours and mixed durations', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(80)).toBe('1 h 20 min');
  });

  it('never renders a negative or invalid duration', () => {
    expect(formatMinutes(-5)).toBe('0 min');
    expect(formatMinutes(Number.NaN)).toBe('0 min');
  });
});
