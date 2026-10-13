import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordRefund } from '@/core-affiliates/lib/affiliates';

// ---------------------------------------------------------------------------
// Mocks — the service talks to Drizzle directly, so stub `db` with chains
// ---------------------------------------------------------------------------

const { dbMock, selectResults, insertValuesMock, updateSetMock } = vi.hoisted(
  () => {
    const selectResults: unknown[][] = [];
    const insertValuesMock = vi.fn().mockResolvedValue(undefined);
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });

    function selectChain() {
      const data = selectResults.shift() ?? [];
      const limit = vi.fn().mockResolvedValue(data);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      return { from };
    }

    const dbMock = {
      select: vi.fn().mockImplementation(selectChain),
      insert: vi.fn().mockReturnValue({ values: insertValuesMock }),
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
    };
    return { dbMock, selectResults, insertValuesMock, updateSetMock };
  }
);

vi.mock('@/server/db', () => ({ db: dbMock }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const REFERRAL = { id: 'ref-1', affiliateId: 'aff-1' };

function queue(...results: unknown[][]) {
  selectResults.length = 0;
  selectResults.push(...results);
}

describe('recordRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
  });

  it('claws back the full commission on a full refund', async () => {
    queue(
      [REFERRAL],
      [
        { type: 'purchase', amountCents: 10_000 },
        { type: 'commission', amountCents: 2_000 },
      ]
    );

    await recordRefund('user-1', 'tx-1', 10_000);

    expect(insertValuesMock).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'refund',
        amountCents: 10_000,
        metadata: { transactionId: 'tx-1' },
      }),
      expect.objectContaining({
        type: 'clawback',
        amountCents: 2_000,
        metadata: {
          transactionId: 'tx-1',
          refundedCents: 10_000,
          purchaseCents: 10_000,
        },
      }),
    ]);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ totalEarningsCents: expect.anything() })
    );
  });

  it('claws back proportionally on a partial refund', async () => {
    queue(
      [REFERRAL],
      [
        { type: 'purchase', amountCents: 10_000 },
        { type: 'commission', amountCents: 2_000 },
      ]
    );

    await recordRefund('user-1', 'tx-1', 2_500);

    expect(insertValuesMock).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'refund', amountCents: 2_500 }),
      expect.objectContaining({ type: 'clawback', amountCents: 500 }),
    ]);
  });

  it('never claws back more than the commission paid', async () => {
    queue(
      [REFERRAL],
      [
        { type: 'purchase', amountCents: 10_000 },
        { type: 'commission', amountCents: 2_000 },
      ]
    );

    // Refund exceeds the purchase (fees reversed, currency rounding, …)
    await recordRefund('user-1', 'tx-1', 12_000);

    expect(insertValuesMock).toHaveBeenCalledWith([
      expect.anything(),
      expect.objectContaining({ type: 'clawback', amountCents: 2_000 }),
    ]);
  });

  it('is idempotent — a redelivered webhook does not claw back twice', async () => {
    queue(
      [REFERRAL],
      [
        { type: 'purchase', amountCents: 10_000 },
        { type: 'commission', amountCents: 2_000 },
        { type: 'clawback', amountCents: 2_000 },
      ]
    );

    await recordRefund('user-1', 'tx-1', 10_000);

    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('does nothing for a user without a converted referral', async () => {
    queue([]);

    await recordRefund('user-9', 'tx-1', 10_000);

    expect(dbMock.select).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it('does nothing when no commission was recorded for the transaction', async () => {
    queue([REFERRAL], [{ type: 'purchase', amountCents: 10_000 }]);

    await recordRefund('user-1', 'tx-unknown', 10_000);

    expect(insertValuesMock).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('swallows database errors (fire-and-forget)', async () => {
    dbMock.select.mockImplementationOnce(() => {
      throw new Error('db down');
    });

    await expect(recordRefund('user-1', 'tx-1', 100)).resolves.toBeUndefined();
  });
});
