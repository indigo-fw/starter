import { scripted } from './helpers/scripted-db';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type RefundHandler,
  setRefundHandler,
} from '@/core-store/lib/refund-types';
// ─── Imports (after mocks) ────────────────────────────────────────────────

import {
  approveReturn,
  processReturnRefund,
  resolveStuckRefund,
} from '@/core-store/lib/return-service';
import { storeOrders } from '@/core-store/schema/orders';
import { storeReturns } from '@/core-store/schema/returns';

// ─── Mocks (before service import) ────────────────────────────────────────

// Query ordering in each test mirrors the service's query order — the point of
// these tests is exactly that order (claim before gateway, commit after).
const { mockUpdateOrderStatus, logError, mockLogAudit } = vi.hoisted(() => ({
  mockUpdateOrderStatus: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock('@/server/db', async () => ({
  db: (await import('./helpers/scripted-db')).scripted.db,
}));

vi.mock('@/core-store/lib/order-service', () => ({
  updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: logError,
    debug: vi.fn(),
  }),
  markLogged: <T>(e: T) => e,
}));

const { db: mockDb, selectQueue, updateQueue, updates } = scripted;

// ─── Helpers ──────────────────────────────────────────────────────────────

const RETURN_ID = 'ret-1';
const ORDER_ID = 'order-1';

function approvedReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: 'approved',
    refundAmountCents: 4000,
    ...overrides,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    paymentTransactionId: 'txn_1',
    currency: 'EUR',
    totalCents: 10000,
    refundedCents: 0,
    ...overrides,
  };
}

function returnStatusWrites(): unknown[] {
  return updates
    .filter((u) => u.table === storeReturns)
    .map((u) => u.set.status);
}

function orderWrites() {
  return updates.filter((u) => u.table === storeOrders);
}

async function expectTRPC(p: Promise<unknown>, code: TRPCError['code']) {
  await expect(p).rejects.toBeInstanceOf(TRPCError);
  await expect(p).rejects.toMatchObject({ code });
}

let refundPayment: ReturnType<typeof vi.fn>;

beforeEach(() => {
  scripted.reset();
  vi.clearAllMocks();
  refundPayment = vi
    .fn()
    .mockResolvedValue({ refundId: 're_1', status: 'succeeded' });
  setRefundHandler({ refundPayment } as unknown as RefundHandler);
});

// ─── processReturnRefund ──────────────────────────────────────────────────

describe('processReturnRefund', () => {
  /** Happy path script: select return, select order, claim, order bump (returning), flip return. */
  function scriptHappyPath(
    ret = approvedReturn(),
    ord = order(),
    newRefundedCents = 4000
  ) {
    selectQueue.push([ret], [ord]);
    updateQueue.push({ rowCount: 1 }, [{ refundedCents: newRefundedCents }], {
      rowCount: 1,
    });
  }

  it('claims the return BEFORE calling the gateway, then commits in a transaction', async () => {
    scriptHappyPath();

    const result = await processReturnRefund(RETURN_ID);

    expect(result.refundId).toBe('re_1');
    // Claim precedes the gateway call: 'refunding' is written before refundPayment runs
    expect(returnStatusWrites()).toEqual(['refunding', 'refunded']);
    expect(mockDb.update.mock.invocationCallOrder[0]).toBeLessThan(
      refundPayment.mock.invocationCallOrder[0]!
    );
    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'txn_1', amountCents: 4000 })
    );
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(orderWrites()).toHaveLength(1);
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      ORDER_ID,
      'partially_refunded',
      'system',
      expect.any(String)
    );
  });

  it('double call: the loser of the CAS claim never reaches the gateway', async () => {
    // First call: full happy path. Second call: same stale read, claim matches 0 rows.
    scriptHappyPath();
    selectQueue.push([approvedReturn()], [order()]);
    updateQueue.push({ rowCount: 0 });

    await processReturnRefund(RETURN_ID);
    await expectTRPC(processReturnRefund(RETURN_ID), 'CONFLICT');

    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses a return already in "refunding" without touching the gateway', async () => {
    selectQueue.push([approvedReturn({ status: 'refunding' })]);

    await expectTRPC(processReturnRefund(RETURN_ID), 'CONFLICT');

    expect(refundPayment).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('refuses an already refunded return', async () => {
    selectQueue.push([approvedReturn({ status: 'refunded' })]);

    await expectTRPC(processReturnRefund(RETURN_ID), 'BAD_REQUEST');
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('rejects an over-refund before claiming anything', async () => {
    selectQueue.push(
      [approvedReturn({ refundAmountCents: 4000 })],
      [order({ totalCents: 10000, refundedCents: 7000 })]
    );

    await expectTRPC(processReturnRefund(RETURN_ID), 'BAD_REQUEST');

    expect(refundPayment).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('gateway throw keeps the claim ("refunding") and logs at error', async () => {
    selectQueue.push([approvedReturn()], [order()]);
    updateQueue.push({ rowCount: 1 });
    refundPayment.mockRejectedValue(new Error('ETIMEDOUT'));

    await expectTRPC(processReturnRefund(RETURN_ID), 'INTERNAL_SERVER_ERROR');

    // Only the claim was written — no rollback, no 'refunded', no order bump
    expect(returnStatusWrites()).toEqual(['refunding']);
    expect(orderWrites()).toHaveLength(0);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('outcome unknown'),
      expect.objectContaining({
        returnId: RETURN_ID,
        orderId: ORDER_ID,
        transactionId: 'txn_1',
        amountCents: 4000,
        error: 'ETIMEDOUT',
      })
    );
  });

  it('definitive gateway decline rolls the claim back to the prior status', async () => {
    selectQueue.push([approvedReturn({ status: 'received' })], [order()]);
    updateQueue.push({ rowCount: 1 }, { rowCount: 1 });
    refundPayment.mockResolvedValue({
      status: 'failed',
      failureReason: 'insufficient_funds',
    });

    await expectTRPC(processReturnRefund(RETURN_ID), 'PRECONDITION_FAILED');

    expect(returnStatusWrites()).toEqual(['refunding', 'received']);
    expect(orderWrites()).toHaveLength(0);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it('cumulative across two returns: order flips to "refunded" only when refundedCents reaches the total', async () => {
    // Return A: 6000 of 10000
    scriptHappyPath(
      approvedReturn({ id: 'ret-a', refundAmountCents: 6000 }),
      order(),
      6000
    );
    await processReturnRefund('ret-a');
    expect(mockUpdateOrderStatus).toHaveBeenLastCalledWith(
      ORDER_ID,
      'partially_refunded',
      'system',
      expect.any(String)
    );

    // Return B: remaining 4000 → cumulative 10000
    scriptHappyPath(
      approvedReturn({ id: 'ret-b', refundAmountCents: 4000 }),
      order({ refundedCents: 6000 }),
      10000
    );
    await processReturnRefund('ret-b');
    expect(mockUpdateOrderStatus).toHaveBeenLastCalledWith(
      ORDER_ID,
      'refunded',
      'system',
      expect.any(String)
    );

    // Return C: anything more is refused before the gateway
    selectQueue.push(
      [approvedReturn({ id: 'ret-c', refundAmountCents: 1 })],
      [order({ refundedCents: 10000 })]
    );
    await expectTRPC(processReturnRefund('ret-c'), 'BAD_REQUEST');

    expect(refundPayment).toHaveBeenCalledTimes(2);
  });

  it('transactional cap guard trips after a successful gateway refund → claim kept, loud error', async () => {
    // Concurrent refund on another return consumed the headroom between our pre-check and commit.
    selectQueue.push([approvedReturn()], [order()]);
    updateQueue.push({ rowCount: 1 }, []);

    await expectTRPC(processReturnRefund(RETURN_ID), 'INTERNAL_SERVER_ERROR');

    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(returnStatusWrites()).toEqual(['refunding']);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('reconcile manually'),
      expect.objectContaining({ refundId: 're_1' })
    );
  });

  it('without a refund handler the refund is bookkeeping only', async () => {
    setRefundHandler(null as unknown as RefundHandler);
    scriptHappyPath();

    const result = await processReturnRefund(RETURN_ID);

    expect(result.refundId).toBeUndefined();
    expect(returnStatusWrites()).toEqual(['refunding', 'refunded']);
  });
});

// ─── approveReturn ────────────────────────────────────────────────────────

describe('approveReturn', () => {
  /** Script: select return, [items if no amount], select order, select pending sum, CAS update. */
  function scriptApprove(opts: {
    status?: string;
    totalCents?: number;
    refundedCents?: number;
    pendingCents?: number;
  }) {
    selectQueue.push(
      [
        {
          id: RETURN_ID,
          orderId: ORDER_ID,
          status: opts.status ?? 'requested',
        },
      ],
      [
        {
          totalCents: opts.totalCents ?? 10000,
          refundedCents: opts.refundedCents ?? 0,
        },
      ],
      [{ totalCents: opts.pendingCents ?? 0 }]
    );
    updateQueue.push({ rowCount: 1 });
  }

  it('approves when the amount fits the remaining refundable total', async () => {
    scriptApprove({
      totalCents: 10000,
      refundedCents: 3000,
      pendingCents: 2000,
    });

    await approveReturn(RETURN_ID, 5000);

    expect(returnStatusWrites()).toEqual(['approved']);
    expect(updates[0]!.set.refundAmountCents).toBe(5000);
  });

  it('rejects an amount exceeding total − refunded − other pending returns', async () => {
    scriptApprove({
      totalCents: 10000,
      refundedCents: 3000,
      pendingCents: 2000,
    });

    await expectTRPC(approveReturn(RETURN_ID, 5001), 'BAD_REQUEST');
    expect(updates).toHaveLength(0);
  });

  it('counts "refunding" returns as pending (bigint SUM arrives as a string)', async () => {
    scriptApprove({ totalCents: 10000, refundedCents: 0 });
    // Overwrite the pending-sum row with a string like pg returns for SUM
    selectQueue[2] = [{ totalCents: '9000' }];

    await expectTRPC(approveReturn(RETURN_ID, 1001), 'BAD_REQUEST');
  });

  it('refuses to approve a return whose refund is already in motion', async () => {
    selectQueue.push([
      { id: RETURN_ID, orderId: ORDER_ID, status: 'refunding' },
    ]);

    await expectTRPC(approveReturn(RETURN_ID, 100), 'BAD_REQUEST');
    expect(updates).toHaveLength(0);
  });

  it('CONFLICT when the status changed between read and write', async () => {
    scriptApprove({});
    updateQueue[0] = { rowCount: 0 };

    await expectTRPC(approveReturn(RETURN_ID, 100), 'CONFLICT');
  });
});

// ─── resolveStuckRefund ───────────────────────────────────────────────────

describe('resolveStuckRefund', () => {
  const stuck = () => approvedReturn({ status: 'refunding' });

  it('"refunded" commits via the normal path (counter bump + flip) and audit-logs', async () => {
    selectQueue.push([stuck()], [{ totalCents: 10000 }]);
    updateQueue.push([{ refundedCents: 4000 }], { rowCount: 1 });

    await resolveStuckRefund({
      returnId: RETURN_ID,
      outcome: 'refunded',
      actorUserId: 'admin-1',
      providerRefundId: 're_manual',
    });

    expect(returnStatusWrites()).toEqual(['refunded']);
    expect(orderWrites()).toHaveLength(1);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      ORDER_ID,
      'partially_refunded',
      'admin-1',
      expect.any(String)
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.return.refund_confirmed',
        entityId: RETURN_ID,
        userId: 'admin-1',
        metadata: expect.objectContaining({ providerRefundId: 're_manual' }),
      })
    );
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('"release" rolls the claim back to approved (CAS on refunding) and audit-logs', async () => {
    selectQueue.push([stuck()]);
    updateQueue.push({ rowCount: 1 });

    await resolveStuckRefund({
      returnId: RETURN_ID,
      outcome: 'release',
      actorUserId: 'admin-1',
    });

    expect(returnStatusWrites()).toEqual(['approved']);
    expect(orderWrites()).toHaveLength(0);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'store.return.refund_released' })
    );
  });

  it('refuses a return that is not in "refunding"', async () => {
    selectQueue.push([approvedReturn({ status: 'approved' })]);

    await expectTRPC(
      resolveStuckRefund({
        returnId: RETURN_ID,
        outcome: 'release',
        actorUserId: 'admin-1',
      }),
      'BAD_REQUEST'
    );
    expect(updates).toHaveLength(0);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('"release" CONFLICTs when resolved concurrently (CAS matched 0 rows)', async () => {
    selectQueue.push([stuck()]);
    updateQueue.push({ rowCount: 0 });

    await expectTRPC(
      resolveStuckRefund({
        returnId: RETURN_ID,
        outcome: 'release',
        actorUserId: 'admin-1',
      }),
      'CONFLICT'
    );
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('"refunded" with the order cap already consumed keeps the claim and errors loudly', async () => {
    selectQueue.push([stuck()], [{ totalCents: 10000 }]);
    updateQueue.push([]);

    await expectTRPC(
      resolveStuckRefund({
        returnId: RETURN_ID,
        outcome: 'refunded',
        actorUserId: 'admin-1',
      }),
      'INTERNAL_SERVER_ERROR'
    );
    expect(returnStatusWrites()).toEqual([]);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
