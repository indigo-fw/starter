import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reconcileStalePendingTransactions } from '@/core-payments/lib/reconciliation-service';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';
import type { DrizzleDB } from '@/server/db';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const dialect = new PgDialect();

// Minimal drizzle-shaped fake: one SELECT result, one UPDATE result per call.
const mockLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockReturning = vi.fn();
const mockUpdateWhere = vi.fn((..._args: unknown[]) => ({
  returning: mockReturning,
}));
const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
const fakeDb = {
  select: vi.fn(() => ({ from: mockFrom })),
  update: vi.fn(() => ({ set: mockSet })),
} as unknown as DrizzleDB;

const staleRow = { id: 'tx-1', providerId: 'stripe', providerTxId: 'cs_123' };

describe('reconcileStalePendingTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([staleRow]);
    mockReturning.mockResolvedValue([{ id: 'tx-1' }]);
  });

  it('marks a provider-confirmed payment with the real `successful` status (not `completed`)', async () => {
    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => 'successful',
      }
    );

    expect(result).toEqual({ checked: 1, recovered: 1, failed: 0 });
    // Revenue queries filter on 'successful' — any other spelling makes the money vanish from reports.
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'successful' })
    );
  });

  it('marks a provider-rejected payment `failed`', async () => {
    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => 'failed',
      }
    );

    expect(result).toEqual({ checked: 1, recovered: 0, failed: 1 });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('only updates rows that are still pending (a late webhook wins the race)', async () => {
    await reconcileStalePendingTransactions(fakeDb, saasPaymentTransactions, {
      stripe: async () => 'successful',
    });

    const where = mockUpdateWhere.mock.calls[0]?.[0] as SQL;
    const { sql, params } = dialect.sqlToQuery(where);
    expect(sql).toMatch(/"id" = \$1 and .*"status" = \$2/);
    expect(params).toEqual(['tx-1', 'pending']);
  });

  it('does not count a transition the webhook already made', async () => {
    mockReturning.mockResolvedValue([]);

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => 'successful',
      }
    );

    expect(result).toEqual({ checked: 1, recovered: 0, failed: 0 });
  });

  it('leaves still-pending payments alone and skips providers without a checker', async () => {
    mockLimit.mockResolvedValue([
      staleRow,
      { id: 'tx-2', providerId: 'nowpayments', providerTxId: '42' },
      { id: 'tx-3', providerId: 'stripe', providerTxId: null },
    ]);

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => 'pending',
      }
    );

    expect(result).toEqual({ checked: 3, recovered: 0, failed: 0 });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a throwing provider check is logged and does not abort the sweep', async () => {
    mockLimit.mockResolvedValue([
      staleRow,
      { id: 'tx-2', providerId: 'stripe', providerTxId: 'cs_2' },
    ]);
    let call = 0;
    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => {
          if (call++ === 0) throw new Error('rate limited');
          return 'failed';
        },
      }
    );

    expect(result).toEqual({ checked: 2, recovered: 0, failed: 1 });
  });
});
