import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the collector that config/store-pricing.ts registers
const { collectorsRef, planFeaturesMock } = vi.hoisted(() => ({
  collectorsRef: { current: [] as Array<{ code: string; sortOrder: number; collect: (ctx: unknown) => Promise<void> }> },
  planFeaturesMock: vi.fn(),
}));

vi.mock('@/core-store/lib/totals-pipeline', () => ({
  registerTotalsCollector: (c: { code: string; sortOrder: number; collect: (ctx: unknown) => Promise<void> }) =>
    collectorsRef.current.push(c),
}));
vi.mock('@/core-subscriptions/lib/feature-gate', () => ({
  getPlanFeatures: planFeaturesMock,
}));

import '@/config/store-pricing';

interface TestCtx {
  extensions: Record<string, unknown>;
  adjustments: Array<{ code: string; label: string; amountCents: number; metadata?: Record<string, unknown> }>;
  runningTotalCents: number;
}

function makeCtx(overrides: Partial<TestCtx> = {}): TestCtx {
  return {
    extensions: { orgId: 'org-1', userId: 'user-1' },
    adjustments: [{ code: 'subtotal', label: 'Subtotal', amountCents: 10_000 }],
    runningTotalCents: 10_000,
    ...overrides,
  };
}

const collector = () => collectorsRef.current.find((c) => c.code === 'member-discount')!;

beforeEach(() => {
  planFeaturesMock.mockReset();
});

describe('member discount collector', () => {
  it('registers between coupon (100) and shipping (200)', () => {
    expect(collector()).toBeDefined();
    expect(collector().sortOrder).toBeGreaterThan(100);
    expect(collector().sortOrder).toBeLessThan(200);
  });

  it('applies the plan percentage to the subtotal', async () => {
    planFeaturesMock.mockResolvedValue({ storeDiscountPercent: 10 });
    const ctx = makeCtx();
    await collector().collect(ctx);

    const adj = ctx.adjustments.find((a) => a.code === 'member-discount');
    expect(adj?.amountCents).toBe(-1000);
    expect(ctx.runningTotalCents).toBe(9_000);
  });

  it('no-ops for guests, plans without the feature, and out-of-range values', async () => {
    // Guest checkout: no orgId
    const guest = makeCtx({ extensions: {} });
    await collector().collect(guest);
    expect(guest.runningTotalCents).toBe(10_000);

    // Plan without the feature key
    planFeaturesMock.mockResolvedValue({ maxMembers: 5 });
    const noFeature = makeCtx();
    await collector().collect(noFeature);
    expect(noFeature.runningTotalCents).toBe(10_000);

    // Nonsense value
    planFeaturesMock.mockResolvedValue({ storeDiscountPercent: 150 });
    const outOfRange = makeCtx();
    await collector().collect(outOfRange);
    expect(outOfRange.runningTotalCents).toBe(10_000);
  });

  it('no-ops when core-subscriptions is unavailable', async () => {
    planFeaturesMock.mockRejectedValue(new Error('module not installed'));
    const ctx = makeCtx();
    await collector().collect(ctx);
    expect(ctx.runningTotalCents).toBe(10_000);
    expect(ctx.adjustments).toHaveLength(1);
  });
});
