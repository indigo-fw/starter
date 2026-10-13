import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateTransactionStatus } from '@/core-payments/lib/transaction-service';
import { TransactionStatus } from '@/core-payments/types/payment';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Capture the UPDATE chain so the test can render the WHERE clause to SQL.
const mockReturning = vi.fn();
const mockWhere = vi.fn((..._args: unknown[]) => ({
  returning: mockReturning,
}));
const mockSet = vi.fn(() => ({ where: mockWhere }));
vi.mock('@/server/db', () => ({
  db: {
    update: vi.fn(() => ({ set: mockSet })),
  },
}));

const dialect = new PgDialect();
function renderWhere(): { sql: string; params: unknown[] } {
  const where = mockWhere.mock.calls[0]?.[0] as SQL | undefined;
  if (!where) throw new Error('where() was not called');
  return dialect.sqlToQuery(where);
}

describe('updateTransactionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([{ id: 'tx-1' }]);
  });

  it('without allowedFrom: unconditional write keyed by id only (Stripe path unchanged)', async () => {
    const won = await updateTransactionStatus(
      'tx-1',
      TransactionStatus.SUCCESSFUL,
      { a: 1 }
    );

    expect(won).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'successful', rawResponse: { a: 1 } })
    );
    const { sql, params } = renderWhere();
    expect(sql).not.toMatch(/"status" in/);
    expect(params).toEqual(['tx-1']);
  });

  it('with allowedFrom: adds a status IN (...) guard so the write is a compare-and-set', async () => {
    await updateTransactionStatus('tx-1', TransactionStatus.FAILED, undefined, [
      TransactionStatus.PENDING,
    ]);

    const { sql, params } = renderWhere();
    expect(sql).toMatch(/"status" in \(\$2\)/);
    expect(params).toEqual(['tx-1', 'pending']);
  });

  it('with several allowedFrom statuses: all are listed', async () => {
    await updateTransactionStatus(
      'tx-1',
      TransactionStatus.REFUNDED,
      undefined,
      [TransactionStatus.PENDING, TransactionStatus.SUCCESSFUL]
    );

    const { params } = renderWhere();
    expect(params).toEqual(['tx-1', 'pending', 'successful']);
  });

  it('returns false when no row matched (transition lost or not applicable)', async () => {
    mockReturning.mockResolvedValue([]);

    const won = await updateTransactionStatus(
      'tx-1',
      TransactionStatus.SUCCESSFUL,
      undefined,
      [TransactionStatus.PENDING]
    );

    expect(won).toBe(false);
  });
});
