import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Mock Supabase auth responses
const mockSupabaseUrl = 'https://test.supabase.co';

const handlers = [
  // Mock Supabase auth signInWithPassword
  http.post(`${mockSupabaseUrl}/auth/v1/token`, async ({ request }) => {
    const body = await request.json() as Record<string, string>;

    if (body.email === 'valid@test.com' && body.password === 'password123') {
      return HttpResponse.json({
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'mock-user-id',
          email: 'valid@test.com',
          role: 'authenticated',
        },
      });
    }

    return HttpResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid login credentials' },
      { status: 400 }
    );
  }),

  // Mock Supabase auth signUp
  http.post(`${mockSupabaseUrl}/auth/v1/signup`, async () => {
    return HttpResponse.json({
      id: 'new-user-id',
      email: 'new@test.com',
      role: 'authenticated',
    });
  }),

  // Mock Supabase auth getUser
  http.get(`${mockSupabaseUrl}/auth/v1/user`, ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (auth === 'Bearer mock-access-token') {
      return HttpResponse.json({
        id: 'mock-user-id',
        email: 'valid@test.com',
      });
    }
    return HttpResponse.json({ message: 'Invalid token' }, { status: 401 });
  }),
];

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Authentication Flow', () => {
  it('should return a session for valid credentials', async () => {
    const response = await fetch(`${mockSupabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'valid@test.com', password: 'password123' }),
    });

    const data = await response.json();
    expect(response.ok).toBe(true);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.user.email).toBe('valid@test.com');
  });

  it('should reject invalid credentials', async () => {
    const response = await fetch(`${mockSupabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wrong@test.com', password: 'wrong' }),
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400);
  });

  it('should return user data for valid token', async () => {
    const response = await fetch(`${mockSupabaseUrl}/auth/v1/user`, {
      headers: { Authorization: 'Bearer mock-access-token' },
    });

    const data = await response.json();
    expect(response.ok).toBe(true);
    expect(data.email).toBe('valid@test.com');
  });

  it('should reject invalid token', async () => {
    const response = await fetch(`${mockSupabaseUrl}/auth/v1/user`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(401);
  });

  it('should create a new user on signup', async () => {
    const response = await fetch(`${mockSupabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@test.com',
        password: 'securePass123',
      }),
    });

    const data = await response.json();
    expect(response.ok).toBe(true);
    expect(data.email).toBe('new@test.com');
  });
});
