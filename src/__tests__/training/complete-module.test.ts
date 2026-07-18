import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/complete-module/route';

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

describe('Complete Module Endpoint (/api/training/complete-module)', () => {
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

  it('completes module successfully with next module id', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        completed: true,
        overallProgress: 50,
        nextModuleId: '00000000-0000-4000-8000-000000000002',
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      completed: true,
      overallProgress: 50,
      nextModuleId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('completes module successfully when it is the last module', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        completed: true,
        overallProgress: 100,
        nextModuleId: null,
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      completed: true,
      overallProgress: 100,
      nextModuleId: null,
    });
  });

  it('returns 409 when module requires evaluation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'module_requires_evaluation',
        code: 'P0001',
      },
    });

    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Module requires evaluation and cannot be completed directly');
  });

  it('returns 409 when module is not available for completion', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'module_not_available',
        code: 'P0001',
      },
    });

    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Module is not available for completion');
  });

  it('returns 500 when RPC response is invalid', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: {
        completed: true,
        overallProgress: 'invalid', // invalid type, should be number
        nextModuleId: null,
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not complete training module');
  });

  it('returns 500 when RPC response contains unexpected overallScore (due to strict schema)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: {
        completed: true,
        overallProgress: 50,
        nextModuleId: null,
        overallScore: 85, // should be rejected by .strict()
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not complete training module');
  });
});
