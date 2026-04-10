import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { getStats, invalidateStats, clearStatsCache } from '../infra/stats-cache';

describe('stats-cache', () => {
  beforeEach(() => {
    clearStatsCache();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getStats', () => {
    it('returns fresh data on first call', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ count: 42 });

      const result = await getStats('test-key', fetchFn, 60);

      expect(result).toEqual({ count: 42 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('returns cached data on second call without calling fetchFn again', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ count: 42 });

      await getStats('test-key', fetchFn, 60);
      const result = await getStats('test-key', fetchFn, 60);

      expect(result).toEqual({ count: 42 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('calls fetchFn again after TTL expires', async () => {
      vi.useFakeTimers();

      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });

      const first = await getStats('ttl-key', fetchFn, 10);
      expect(first).toEqual({ count: 1 });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Advance past the 10-second TTL
      vi.advanceTimersByTime(11_000);

      const second = await getStats('ttl-key', fetchFn, 10);
      expect(second).toEqual({ count: 2 });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('returns stale data on fetch error if cache exists', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce({ count: 99 })
        .mockRejectedValueOnce(new Error('network failure'));

      // Populate the cache
      await getStats('stale-key', fetchFn, 0);

      // TTL=0 means next call will try to refetch (expired immediately)
      const result = await getStats('stale-key', fetchFn, 60);

      expect(result).toEqual({ count: 99 });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('throws on fetch error if no cache exists', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('db down'));

      await expect(getStats('no-cache-key', fetchFn, 60)).rejects.toThrow('db down');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateStats', () => {
    it('removes keys matching the prefix', async () => {
      const fetchFn = vi.fn().mockResolvedValue('data');

      await getStats('stats:posts', fetchFn, 300);
      await getStats('stats:pages', fetchFn, 300);
      await getStats('other:key', fetchFn, 300);
      expect(fetchFn).toHaveBeenCalledTimes(3);

      invalidateStats('stats:');

      // Both "stats:" keys should refetch
      await getStats('stats:posts', fetchFn, 300);
      await getStats('stats:pages', fetchFn, 300);
      // "other:" key should still be cached
      await getStats('other:key', fetchFn, 300);

      // 3 initial + 2 refetched = 5
      expect(fetchFn).toHaveBeenCalledTimes(5);
    });

    it('does not remove keys that do not match the prefix', async () => {
      const fetchFn = vi.fn().mockResolvedValue('data');

      await getStats('keep:this', fetchFn, 300);
      await getStats('remove:this', fetchFn, 300);
      expect(fetchFn).toHaveBeenCalledTimes(2);

      invalidateStats('remove:');

      // "keep:this" should still be cached
      await getStats('keep:this', fetchFn, 300);
      expect(fetchFn).toHaveBeenCalledTimes(2);

      // "remove:this" should refetch
      await getStats('remove:this', fetchFn, 300);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('clearStatsCache', () => {
    it('removes all cached keys', async () => {
      const fetchFn = vi.fn().mockResolvedValue('cached');

      await getStats('a', fetchFn, 300);
      await getStats('b', fetchFn, 300);
      await getStats('c', fetchFn, 300);
      expect(fetchFn).toHaveBeenCalledTimes(3);

      clearStatsCache();

      // All keys should refetch
      await getStats('a', fetchFn, 300);
      await getStats('b', fetchFn, 300);
      await getStats('c', fetchFn, 300);
      expect(fetchFn).toHaveBeenCalledTimes(6);
    });
  });
});
