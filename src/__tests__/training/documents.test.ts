import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  sanitizeTrainingFileName,
  sha256,
  splitTrainingText,
  MAX_TRAINING_FILE_SIZE,
} from '../../lib/training/documents';

describe('Training Documents Helper Library', () => {
  it('should sanitize filename correctly replacing spaces and accents', () => {
    const rawName = '  Curriculum   Ingeniero - 2026! @#  .pdf  ';
    const sanitized = sanitizeTrainingFileName(rawName);
    expect(sanitized).toBe('Curriculum-Ingeniero-2026-.pdf');
  });

  it('should enforce maximum size limit as a number', () => {
    expect(MAX_TRAINING_FILE_SIZE).toBe(15 * 1024 * 1024);
  });

  it('should split text into chunks avoiding infinite loop', () => {
    const text = 'Esta es una frase. '.repeat(500); // Texto largo
    const chunks = splitTrainingText(text, 1000, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(1000);
  });

  it('should return stable sha256 hash output from buffer', () => {
    const buffer = Buffer.from('Reclutify Training V2 Content Checksum Verification');
    const hash1 = sha256(buffer);
    const hash2 = sha256(buffer);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
});
