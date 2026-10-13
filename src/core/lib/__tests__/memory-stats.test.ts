import { getMemorySnapshot, registerMemoryStat } from '../infra/memory-stats';
import { describe, expect, it } from 'vitest';

describe('getMemorySnapshot', () => {
  it('reports process memory plus registered counters', () => {
    registerMemoryStat('memoryStatsTestCounter', () => 42);
    const snap = getMemorySnapshot();
    expect(snap.rssMb).toBeGreaterThan(0);
    expect(Number.isFinite(snap.heapUsedMb)).toBe(true);
    expect(snap.counters.memoryStatsTestCounter).toBe(42);
  });

  it('only carries JSC heap fields when the runtime provides them', () => {
    const snap = getMemorySnapshot();
    const isBun =
      typeof (process.versions as { bun?: string }).bun === 'string';
    if (isBun && snap.jscHeapMb !== undefined) {
      expect(snap.jscHeapMb).toBeGreaterThan(0);
      expect(snap.jscHeapCapacityMb).toBeGreaterThanOrEqual(snap.jscHeapMb);
    } else if (!isBun) {
      // Under Node the lazy `bun:jsc` import must fail silently, not leak NaN.
      expect(snap.jscHeapMb).toBeUndefined();
      expect(snap.jscHeapCapacityMb).toBeUndefined();
    }
  });

  it('a throwing provider does not break the snapshot', () => {
    registerMemoryStat('memoryStatsBroken', () => {
      throw new Error('nope');
    });
    expect(() => getMemorySnapshot()).not.toThrow();
    expect(getMemorySnapshot().counters.memoryStatsBroken).toBeUndefined();
  });
});
