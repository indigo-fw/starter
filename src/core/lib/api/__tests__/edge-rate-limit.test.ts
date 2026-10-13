import {
  edgeRateLimit,
  memoryRateLimit,
  memoryRateLimitSize,
  resetMemoryRateLimit,
  resetRedisAvailability,
} from '../edge-rate-limit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetRedis = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock('@/core/lib/infra/memory-stats', () => ({
  registerMemoryStat: vi.fn(),
}));

vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: (...args: unknown[]) => mockGetRedis(...args),
  getRequestRedis: (...args: unknown[]) => mockGetRedis(...args),
}));

vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  resetMemoryRateLimit();
  resetRedisAvailability();
  mockGetRedis.mockReset();
  mockCheckRateLimit.mockReset();
});

// ─── memoryRateLimit ───────────────────────────────────────────────────────────

describe('memoryRateLimit', () => {
  it('allows requests under the limit', () => {
    const now = 1_000_000;
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now)).toBe(true);
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now + 100)).toBe(true);
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now + 200)).toBe(true);
  });

  it('blocks when limit is exceeded', () => {
    const now = 1_000_000;
    // First 3 requests allowed (maxRequests = 3)
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now)).toBe(true);
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now + 100)).toBe(true);
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now + 200)).toBe(true);
    // 4th request blocked
    expect(memoryRateLimit('1.2.3.4', 60_000, 3, now + 300)).toBe(false);
  });

  it('resets after window expires', () => {
    const now = 1_000_000;
    const windowMs = 10_000;

    // Exhaust the limit
    expect(memoryRateLimit('1.2.3.4', windowMs, 2, now)).toBe(true);
    expect(memoryRateLimit('1.2.3.4', windowMs, 2, now + 100)).toBe(true);
    expect(memoryRateLimit('1.2.3.4', windowMs, 2, now + 200)).toBe(false);

    // After the window expires, requests are allowed again
    const afterWindow = now + windowMs + 1;
    expect(memoryRateLimit('1.2.3.4', windowMs, 2, afterWindow)).toBe(true);
  });

  it('tracks different IPs independently', () => {
    const now = 1_000_000;

    // Exhaust limit for IP A
    expect(memoryRateLimit('10.0.0.1', 60_000, 1, now)).toBe(true);
    expect(memoryRateLimit('10.0.0.1', 60_000, 1, now + 100)).toBe(false);

    // IP B should still be allowed
    expect(memoryRateLimit('10.0.0.2', 60_000, 1, now + 200)).toBe(true);
  });

  it('cleans up stale entries after 5 minutes', () => {
    const now = 1_000_000;
    const windowMs = 1_000;

    // Create an entry that will expire
    memoryRateLimit('stale-ip', windowMs, 5, now);

    // Advance past the window so the entry is stale, and past 5 minutes to trigger cleanup
    const afterCleanup = now + 300_001;
    // This call triggers cleanup internally
    memoryRateLimit('fresh-ip', windowMs, 5, afterCleanup);

    // The stale entry should have been cleaned up.
    // Verify by making a new request from the stale IP — it should start fresh (count = 1, allowed)
    expect(memoryRateLimit('stale-ip', windowMs, 1, afterCleanup + 100)).toBe(
      true
    );
  });

  // The cap is what keeps a spoofed-IP flood from growing the map without
  // bound between 5-minute sweeps.
  const CAP = 10_000;

  it('never tracks more than the cap, evicting the oldest entry first', () => {
    const now = 1_000_000;
    for (let i = 0; i < CAP; i++) memoryRateLimit(`ip-${i}`, 60_000, 5, now);
    expect(memoryRateLimitSize()).toBe(CAP);

    // All entries still live → the oldest one (ip-0) makes room.
    memoryRateLimit('ip-new', 60_000, 5, now + 1);
    expect(memoryRateLimitSize()).toBe(CAP);

    // ip-0 was forgotten: it starts fresh (allowed with limit 1)...
    expect(memoryRateLimit('ip-0', 60_000, 1, now + 2)).toBe(true);
    // ...while a surviving entry kept its count.
    expect(memoryRateLimit('ip-new', 60_000, 1, now + 3)).toBe(false);
  });

  it('prefers dropping expired entries over live ones when full', () => {
    const now = 1_000_000;
    const windowMs = 1_000;
    for (let i = 0; i < CAP - 1; i++)
      memoryRateLimit(`old-${i}`, windowMs, 5, now);
    // One live entry inserted last, so plain oldest-first eviction would keep it anyway;
    // the point is that the expired bulk goes, not just a single oldest key.
    memoryRateLimit('live', 60_000, 5, now + 500);
    expect(memoryRateLimitSize()).toBe(CAP);

    memoryRateLimit('newcomer', 60_000, 5, now + windowMs + 1);
    expect(memoryRateLimitSize()).toBe(2);
    expect(memoryRateLimit('live', 60_000, 2, now + windowMs + 2)).toBe(true);
    expect(memoryRateLimit('live', 60_000, 2, now + windowMs + 3)).toBe(false);
  });
});

// ─── edgeRateLimit ─────────────────────────────────────────────────────────────

describe('edgeRateLimit', () => {
  it('uses Redis when available', async () => {
    const fakeRedis = {};
    mockGetRedis.mockReturnValue(fakeRedis);
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterMs: 0,
    });

    const result = await edgeRateLimit('1.2.3.4', 60_000, 5);

    expect(result).toBe(true);
    expect(mockGetRedis).toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      fakeRedis,
      'rl:proxy:1.2.3.4',
      { windowMs: 60_000, maxRequests: 5 }
    );
  });

  it('falls back to memory when Redis returns null', async () => {
    mockGetRedis.mockReturnValue(null);

    // First request allowed (memory fallback)
    const result = await edgeRateLimit('1.2.3.4', 60_000, 5);

    expect(result).toBe(true);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('falls back to memory when Redis throws', async () => {
    mockGetRedis.mockImplementation(() => {
      throw new Error('Connection refused');
    });

    const result = await edgeRateLimit('1.2.3.4', 60_000, 5);

    expect(result).toBe(true);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('caches Redis unavailability and does not retry after failure', async () => {
    // First call: Redis throws
    mockGetRedis.mockImplementation(() => {
      throw new Error('Connection refused');
    });
    await edgeRateLimit('1.2.3.4', 60_000, 5);

    // Reset mocks to verify they are NOT called on subsequent requests
    mockGetRedis.mockClear();
    mockCheckRateLimit.mockClear();

    // Second call: should skip Redis entirely (cached unavailability)
    const result = await edgeRateLimit('1.2.3.4', 60_000, 5);

    expect(result).toBe(true);
    expect(mockGetRedis).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});
