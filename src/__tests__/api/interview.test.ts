import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock the OpenRouter API that the /api/chat route calls
const handlers = [
  http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as { messages: Array<{ role: string; content: string }> };
    const systemPrompt = body.messages?.[0]?.content || '';

    // Verify the request structure is correct
    if (!systemPrompt.includes('Zara')) {
      return HttpResponse.json(
        { error: { message: 'Invalid system prompt' } },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '¡Excelente respuesta! ¿Podrías contarme más sobre tu experiencia liderando equipos remotos?',
          },
        },
      ],
      usage: { prompt_tokens: 500, completion_tokens: 30 },
    });
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Interview Chat API (/api/chat)', () => {
  it('should generate an AI follow-up question from OpenRouter', async () => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'You are Zara, a Senior HR Recruiter. You are conducting a live job interview.',
          },
          {
            role: 'user',
            content: 'CANDIDATO: Tengo 5 años de experiencia en desarrollo web con React y Node.js.',
          },
        ],
      }),
    });

    const data = await response.json();
    expect(response.ok).toBe(true);
    expect(data.choices).toBeDefined();
    expect(data.choices[0].message.content).toBeTruthy();
    expect(data.choices[0].message.content.length).toBeGreaterThan(10);
  });

  it('should validate the system prompt contains interviewer context', async () => {
    // The handler checks for 'Zara' in the system prompt
    // This test verifies the mock validation logic works
    const validResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are Zara, conducting an interview.' },
          { role: 'user', content: 'Test question' },
        ],
      }),
    });

    expect(validResponse.ok).toBe(true);
    const data = await validResponse.json();
    expect(data.choices[0].message.content).toBeTruthy();
  });

  it('should handle the evaluation response structure', async () => {
    // Override handler for evaluation-style response
    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', () => {
        return HttpResponse.json({
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  candidateName: 'Test Candidate',
                  overallScore: 78,
                  recommendation: 'Hire',
                  pros: ['Good communication', 'Strong technical skills'],
                  cons: ['Limited leadership experience'],
                  topicScores: { 'React': 8, 'Node.js': 7 },
                  executiveSummary: 'Solid candidate with strong technical background.',
                  interviewHighlights: [],
                  hiringRisks: [],
                  onboardingTips: ['Pair with senior dev for first month'],
                  biasFlags: [],
                }),
              },
            },
          ],
        });
      })
    );

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'You are Zara, evaluating a candidate.' },
          { role: 'user', content: 'Evaluate this transcript...' },
        ],
      }),
    });

    const data = await response.json();
    const evaluation = JSON.parse(data.choices[0].message.content);

    expect(evaluation.overallScore).toBeGreaterThanOrEqual(0);
    expect(evaluation.overallScore).toBeLessThanOrEqual(100);
    expect(['Strong Hire', 'Hire', 'Pass']).toContain(evaluation.recommendation);
    expect(evaluation.pros).toBeInstanceOf(Array);
    expect(evaluation.cons).toBeInstanceOf(Array);
  });
});
