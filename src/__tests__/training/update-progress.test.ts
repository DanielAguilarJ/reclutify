import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/update-progress/route';

interface MockEmployee {
  id: string;
  name: string;
  org_id: string;
  program_id: string;
  role_id: string;
  role_title: string;
  personalization_notes: Record<string, unknown>;
}

let mockEmployee: MockEmployee | null = null;

vi.mock('@/lib/training/session', () => ({
  getTrainingEmployeeFromSession: async () => mockEmployee,
}));

const mockRpc = vi.fn();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
  }),
}));

describe('Update Progress Endpoint (/api/training/update-progress)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.clearAllMocks();
    mockEmployee = {
      id: 'emp-111',
      name: 'John Doe',
      org_id: 'org-222',
      program_id: 'prog-333',
      role_id: 'role-444',
      role_title: 'Software Developer',
      personalization_notes: {},
    };
  });

  it('updates progress successfully and returns 200', async () => {
    mockRpc.mockResolvedValueOnce({
      data: 12,
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/update-progress', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
        minutesDelta: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      timeSpent: 12,
    });
  });

  it('returns 409 when progress is not available for time updates', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'training_progress_not_available',
        code: 'P0001',
      },
    });

    const req = new NextRequest('http://localhost/api/training/update-progress', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
        minutesDelta: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Training progress is not available for time updates');
  });

  it('returns 500 when RPC returns null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/update-progress', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
        minutesDelta: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not update training time');
  });

  it('returns 500 when RPC returns a string value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: '12',
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/update-progress', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
        minutesDelta: 5,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not update training time');
  });
});
