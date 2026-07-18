import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import TrainingModulePage from '../../app/training/center/module/[moduleId]/page';
import React from 'react';

// Modern hoisting in Vitest
const { mockUseTrainingStore, mockGetState } = vi.hoisted(() => {
  const mockHook = vi.fn();
  const mockGet = vi.fn();
  (mockHook as unknown as { getState: typeof mockGet }).getState = mockGet;
  return {
    mockUseTrainingStore: mockHook,
    mockGetState: mockGet,
  };
});

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
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

// Mock trainingStore hook
vi.mock('@/store/trainingStore', () => ({
  useTrainingStore: mockUseTrainingStore,
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
  startModule: vi.fn().mockResolvedValue(undefined),
  completeModule: vi.fn(),
  completeModuleWithoutEvaluation: vi.fn(),
  startModuleChat: vi.fn().mockResolvedValue(undefined),
  sendModuleMessage: vi.fn(),
  incrementTimeSpent: vi.fn(),
  initializeFromSession: vi.fn().mockResolvedValue(true),
};

describe('TrainingModulePage Component Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue(mockStoreDefault);
    mockUseTrainingStore.mockReturnValue(mockStoreDefault);
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
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockReplace).toHaveBeenCalledWith('/training/center');
  });

  it('hides take evaluation and complete module buttons if progress is completed', async () => {
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
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText('Take Evaluation')).not.toBeInTheDocument();
    expect(screen.queryByText('Tomar Evaluación')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete Module')).not.toBeInTheDocument();
    expect(screen.queryByText('Completar Módulo')).not.toBeInTheDocument();
  });

  it('calls initializeFromSession exactly once if employee is null', async () => {
    const mockStore = {
      ...mockStoreDefault,
      employee: null,
    };
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockStoreDefault.initializeFromSession).toHaveBeenCalledTimes(1);
  });

  it('redirects to / if initializeFromSession returns false', async () => {
    const mockStore = {
      ...mockStoreDefault,
      employee: null,
      initializeFromSession: vi.fn().mockResolvedValue(false),
    };
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('shows approved message on evaluation passed: true and dynamic passingScore', async () => {
    const completeModuleMock = vi.fn().mockResolvedValue({
      score: 90,
      passed: true,
      passingScore: 85,
      feedback: { details: [] },
    });
    const mockStore = {
      ...mockStoreDefault,
      completeModule: completeModuleMock,
    };
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const evalBtn = screen.getByRole('button', { name: /tomar evaluación|take evaluation/i });
    await act(async () => {
      evalBtn.click();
    });

    const radios = screen.getAllByRole('radio');
    await act(async () => {
      radios[0].click();
    });

    const submitBtn = screen.getByRole('button', { name: /enviar evaluación|submit evaluation/i });
    await act(async () => {
      submitBtn.click();
    });

    expect(screen.getByText(/¡Felicidades, Completaste el Módulo!|Congratulations, Module Completed!/i)).toBeInTheDocument();
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });

  it('shows failing message on evaluation passed: false', async () => {
    const completeModuleMock = vi.fn().mockResolvedValue({
      score: 50,
      passed: false,
      passingScore: 75,
      feedback: { details: [] },
    });
    const mockStore = {
      ...mockStoreDefault,
      completeModule: completeModuleMock,
    };
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const evalBtn = screen.getByRole('button', { name: /tomar evaluación|take evaluation/i });
    await act(async () => {
      evalBtn.click();
    });

    const radios = screen.getAllByRole('radio');
    await act(async () => {
      radios[0].click();
    });

    const submitBtn = screen.getByRole('button', { name: /enviar evaluación|submit evaluation/i });
    await act(async () => {
      submitBtn.click();
    });

    expect(screen.getByText(/no se alcanzó el mínimo requerido|did not meet requirements/i)).toBeInTheDocument();
    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it('shows locked module does not call startModuleChat', async () => {
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
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockStoreDefault.startModuleChat).not.toHaveBeenCalled();
  });

  it('does not call startModuleChat if startModule rejects', async () => {
    const mockStore = {
      ...mockStoreDefault,
      progress: [
        {
          moduleId: 'mod-1',
          status: 'available',
          timeSpent: 0,
        },
      ],
      startModule: vi.fn().mockRejectedValue(new Error('Failed to start')),
    };
    mockUseTrainingStore.mockReturnValue(mockStore);
    mockGetState.mockReturnValue(mockStore);

    render(<TrainingModulePage params={Promise.resolve({ moduleId: 'mod-1' })} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockStoreDefault.startModuleChat).not.toHaveBeenCalled();
  });
});
