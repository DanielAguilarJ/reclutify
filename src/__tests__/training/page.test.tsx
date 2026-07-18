import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainingModulePage from '../../app/training/center/module/[moduleId]/page';
import { useTrainingStore } from '../../store/trainingStore';
import React from 'react';

// Mock react's use hook
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    use: (promise: Promise<unknown>) => {
      let resolved: unknown;
      promise.then((val) => { resolved = val; }).catch(() => {});
      return resolved || { moduleId: 'mod-1' };
    },
  };
});

// Mock useRouter from next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock trainingStore hook
vi.mock('@/store/trainingStore', () => ({
  useTrainingStore: vi.fn(),
}));

const mockStoreDefault = {
  employee: { id: 'emp-1', orgId: 'org-1', name: 'John Doe', status: 'in_progress' },
  modules: [
    {
      id: 'mod-1',
      title: 'Intro Module',
      description: 'Intro to Reclutify',
      content: { sections: [{ title: 'Sec 1', body: '...' }] },
      evaluationEnabled: true,
      evaluationQuestions: [{ question: 'Q1', type: 'multiple_choice', options: ['A', 'B'] }],
      sourceDocumentIds: [],
    },
  ],
  progress: [
    {
      moduleId: 'mod-1',
      status: 'in_progress',
      timeSpent: 12,
    },
  ],
  moduleMessages: {
    'mod-1': [{ role: 'assistant', content: 'Tutor message' }],
  },
  aiSpeaking: false,
  startModule: vi.fn(),
  completeModule: vi.fn(),
  completeModuleWithoutEvaluation: vi.fn(),
  startModuleChat: vi.fn(),
  sendModuleMessage: vi.fn(),
  incrementTimeSpent: vi.fn(),
};

describe('TrainingModulePage Component Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /training/center if module progress status is locked', async () => {
    const mockStore = {
      ...mockStoreDefault,
      progress: [
        {
          moduleId: 'mod-1',
          status: 'locked',
          timeSpent: 0,
        },
      ],
    };
    vi.mocked(useTrainingStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useTrainingStore>);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    // Since we mock react's use, we must wait for effect ticks
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockPush).toHaveBeenCalledWith('/training/center');
  });

  it('hides take evaluation and complete module buttons if progress is completed', () => {
    const mockStore = {
      ...mockStoreDefault,
      progress: [
        {
          moduleId: 'mod-1',
          status: 'completed',
          timeSpent: 10,
        },
      ],
    };
    vi.mocked(useTrainingStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useTrainingStore>);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    expect(screen.queryByText('Take Evaluation')).not.toBeInTheDocument();
    expect(screen.queryByText('Tomar Evaluación')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete Module')).not.toBeInTheDocument();
    expect(screen.queryByText('Completar Módulo')).not.toBeInTheDocument();
  });
});
