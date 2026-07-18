import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/start-module/route';

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

describe('Start Module Endpoint (/api/training/start-module)', () => {
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

  it('starts module successfully and returns 200', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        status: 'in_progress',
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/start-module', {
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
      result: {
        success: true,
        status: 'in_progress',
      },
    });
  });

  it('returns 403 when module is locked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'module_locked',
        code: 'P0001',
      },
    });

    const req = new NextRequest('http://localhost/api/training/start-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Module is locked');
  });

  it('returns 404 when training progress is not found', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'training_progress_not_found',
        code: 'P0001',
      },
    });

    const req = new NextRequest('http://localhost/api/training/start-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Training progress not found');
  });

  it('returns 409 when module is not available', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'module_not_available',
        code: 'P0001',
      },
    });

    const req = new NextRequest('http://localhost/api/training/start-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Module is not available');
  });

  it('returns 500 when RPC response is corrupt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRpc.mockResolvedValueOnce({
      data: {
        success: false, // invalid literal, should be true
        status: 'corrupt',
      },
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/start-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not start training module');
  });
});
