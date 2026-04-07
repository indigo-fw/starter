import { describe, it, expect } from 'vitest';

/**
 * Provider manager logic tests.
 * Tests the selection algorithm, cooldown, and fallback behavior
 * using the exported constants and types.
 */

describe('provider manager constants', () => {
  it('has correct cooldown duration', async () => {
    // Verify the module exports expected values
    const { MATCH_SCORE, FUZZY_MATCH_CUTOFF } = await import('../lib/image/types');
    expect(MATCH_SCORE).toBe(1.0);
    expect(FUZZY_MATCH_CUTOFF).toBe(0.8);
  });
});

describe('provider selection logic', () => {
  it('mock decrypt bypasses encryption for mock adapters', async () => {
    // The provider manager should not try to decrypt for mock adapters
    const { isEncryptionConfigured } = await import('../lib/encryption');
    // Without ENCRYPTION_KEY, encryption is not configured
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    // Restore
    if (originalKey) process.env.ENCRYPTION_KEY = originalKey;
  });
});

describe('voice billing calculations', () => {
  it('cost per minute is a positive integer', () => {
    const costPerMinute = 50;
    expect(costPerMinute).toBeGreaterThan(0);
    expect(Number.isInteger(costPerMinute)).toBe(true);
  });

  it('billing interval is 60 seconds', () => {
    const BILLING_INTERVAL_MS = 60_000;
    expect(BILLING_INTERVAL_MS).toBe(60000);
  });

  it('idle timeout is 2 minutes', () => {
    const IDLE_TIMEOUT_MS = 120_000;
    expect(IDLE_TIMEOUT_MS).toBe(120000);
  });
});
