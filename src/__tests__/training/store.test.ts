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

    // Mock bootstrap fetch inside initializeFromSession if needed, but since completeModule calls initializeFromSession, let's mock it too.
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
    // Set initial messages
    useTrainingStore.setState({
      generalMessages: [
        { role: 'assistant', content: 'Hello', timestamp: 1000 }
      ]
    });

    // API error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Internal Server Error' }),
    });

    await expect(
      useTrainingStore.getState().sendGeneralMessage('User input')
    ).rejects.toThrow('Internal Server Error');

    // Confirm that generalMessages has been rolled back and doesn't contain the optimistic user message
    expect(useTrainingStore.getState().generalMessages).toEqual([
      { role: 'assistant', content: 'Hello', timestamp: 1000 }
    ]);
  });
});
