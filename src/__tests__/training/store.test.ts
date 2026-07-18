import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTrainingStore } from '../../store/trainingStore';

// Mock fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Zustand Store Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTrainingStore.getState().reset();
  });

  it('completeModule maps and returns CompleteModuleResult successfully', async () => {
    const mockResult = {
      score: 85,
      passed: true,
      passingScore: 70,
      attempts: 1,
      overallProgress: 50,
      overallScore: 85,
      feedback: {
        score: 85,
        details: [
          { question: 'Q1', correct: true, userAnswer: 'A1' }
        ]
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        employee: { id: 'emp-1', org_id: 'org-1', program_id: 'prog-1', email: 'e@e.com', name: 'N' },
        program: { id: 'prog-1', org_id: 'org-1', title: 'P' },
        modules: [],
        progress: []
      }),
    });

    const result = await useTrainingStore.getState().completeModule('mod-1', { 0: 'my answer' });

    expect(result).toEqual({
      score: 85,
      passed: true,
      passingScore: 70,
      attempts: 1,
      overallProgress: 50,
      overallScore: 85,
      feedback: {
        score: 85,
        details: [
          { question: 'Q1', correct: true, userAnswer: 'A1' }
        ]
      }
    });
  });

  it('incrementTimeSpent propagates errors on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Database timeout' }),
    });

    await expect(
      useTrainingStore.getState().incrementTimeSpent('mod-1', 5)
    ).rejects.toThrow('Database timeout');
  });

  it('sendGeneralMessage does rollback to previous state if API call fails', async () => {
    useTrainingStore.setState({
      generalMessages: [
        { role: 'assistant', content: 'Hello', timestamp: 1000 }
      ]
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    await expect(
      useTrainingStore.getState().sendGeneralMessage('User input')
    ).rejects.toThrow('Internal Server Error');

    expect(useTrainingStore.getState().generalMessages).toEqual([
      { role: 'assistant', content: 'Hello', timestamp: 1000 }
    ]);
  });

  // Nuevos tests del Paso 11
  it('startModuleChat propagates error on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(
      useTrainingStore.getState().startModuleChat('mod-1')
    ).rejects.toThrow('Failed to initialize module tutor');
  });

  it('sets overallScore and score to undefined when absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        employee: {
          id: 'emp-1',
          org_id: 'org-1',
          program_id: 'prog-1',
          email: 'e@e.com',
          name: 'N',
          overall_score: null, // absent
        },
        program: { id: 'prog-1', org_id: 'org-1', title: 'P' },
        modules: [],
        progress: [
          { id: 'prog-id', employee_id: 'emp-1', module_id: 'mod-1', status: 'available', score: null } // absent
        ]
      }),
    });

    const success = await useTrainingStore.getState().initializeFromSession();
    expect(success).toBe(true);

    const state = useTrainingStore.getState();
    expect(state.employee?.overallScore).toBeUndefined();
    expect(state.progress[0]?.score).toBeUndefined();
  });

  it('incrementTimeSpent uses absolute value returned by the server', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        timeSpent: 45, // Absolute value
      }),
    });

    useTrainingStore.setState({
      progress: [
        { id: 'prog-1', employeeId: 'emp-1', moduleId: 'mod-1', status: 'in_progress', timeSpent: 10, createdAt: '' }
      ]
    });

    await useTrainingStore.getState().incrementTimeSpent('mod-1', 5);

    const progressItem = useTrainingStore.getState().progress.find(p => p.moduleId === 'mod-1');
    expect(progressItem?.timeSpent).toBe(45);
  });
});
