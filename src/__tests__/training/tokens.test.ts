import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createOpaqueToken, hashOpaqueToken } from '../../lib/training/tokens';

describe('Training Opaque Tokens Library', () => {
  it('should generate two distinct random tokens', () => {
    const token1 = createOpaqueToken();
    const token2 = createOpaqueToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThan(20);
  });

  it('should generate stable hash values for the same token input', () => {
    const token = 'test-token-value-12345';
    const hash1 = hashOpaqueToken(token);
    const hash2 = hashOpaqueToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
