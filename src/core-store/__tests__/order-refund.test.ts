import { scripted } from './helpers/scripted-db';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Imports (after mocks) ────────────────────────────────────────────────

import { refundWholeOrder } from '@/core-store/lib/refund-service';
import {
  type RefundHandler,
  setRefundHandler,
} from '@/core-store/lib/refund-types';
import { handleStorePaymentEvent } from '@/core-store/lib/webhook-handler';
import { storeOrders } from '@/core-store/schema/orders';

// ─── Mocks (before service imports) ───────────────────────────────────────

const {
  mockUpdateOrderStatus,
  mockRestoreInventory,
  logError,
  mockSendNotification,
} = vi.hoisted(() => ({
  mockUpdateOrderStatus: vi.fn().mockResolvedValue(undefined),
  mockRestoreInventory: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn(),
  mockSendNotification: vi.fn(),
}));

vi.mock('@/server/db', async () => ({
  db: (await import('./helpers/scripted-db')).scripted.db,
}));

vi.mock('@/core-store/lib/order-service', () => ({
  updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
  deductOrderInventory: vi.fn(),
  restoreOrderInventory: (...args: unknown[]) => mockRestoreInventory(...args),
}));

vi.mock('@/core-store/deps', () => ({
  getStoreDeps: () => ({
    sendNotification: mockSendNotification,
    enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/core/lib/infra/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/core/lib/webhooks/webhooks', () => ({ dispatchWebhook: vi.fn() }));

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

const ORDER_ID = 'order-1';

function order(overrides: Record<string, unknown> = {}) {
  return {
    status: 'delivered',
    totalCents: 10000,
    refundedCents: 0,
    paymentTransactionId: 'txn_1',
    currency: 'EUR',
    ...overrides,
  };
}

function orderWrites() {
  return updates.filter((u) => u.table === storeOrders).map((u) => u.set);
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

// ─── refundWholeOrder ─────────────────────────────────────────────────────

describe('refundWholeOrder', () => {
  /** Script: select order, claim (status flip), counter bump (returning). */
  function scriptHappyPath(ord = order(), newRefunded = 10000) {
    selectQueue.push([ord]);
    updateQueue.push({ rowCount: 1 }, [{ refundedCents: newRefunded }]);
  }

  it('claims (status → refunded) before the gateway, then bumps refundedCents', async () => {
    scriptHappyPath();

    const result = await refundWholeOrder({
      orderId: ORDER_ID,
      actor: 'admin-1',
      reason: 'damaged',
    });

    expect(result).toEqual({ refundId: 're_1', amountCents: 10000 });
    expect(orderWrites()).toHaveLength(2);
    expect(orderWrites()[0]).toMatchObject({ status: 'refunded' });
    expect(orderWrites()[1]).toHaveProperty('refundedCents');
    expect(mockDb.update.mock.invocationCallOrder[0]).toBeLessThan(
      refundPayment.mock.invocationCallOrder[0]!
    );
    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 10000,
        transactionId: 'txn_1',
        reason: 'damaged',
      })
    );
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      ORDER_ID,
      'refunded',
      'admin-1',
      'damaged'
    );
  });

  it('refunds only the outstanding remainder after partial return refunds', async () => {
    scriptHappyPath(
      order({ status: 'partially_refunded', refundedCents: 6000 })
    );

    const result = await refundWholeOrder({
      orderId: ORDER_ID,
      actor: 'admin-1',
    });

    expect(result.amountCents).toBe(4000);
    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 4000 })
    );
  });

  it('double call: the CAS loser never reaches the gateway', async () => {
    scriptHappyPath();
    selectQueue.push([order()]);
    updateQueue.push({ rowCount: 0 });

    await refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' });
    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'CONFLICT'
    );

    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses an already fully refunded order without claiming', async () => {
    selectQueue.push([
      order({ status: 'partially_refunded', refundedCents: 10000 }),
    ]);

    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'BAD_REQUEST'
    );
    expect(updates).toHaveLength(0);
    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('refuses non-paid statuses', async () => {
    selectQueue.push([order({ status: 'refunded' })]);
    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'BAD_REQUEST'
    );

    selectQueue.push([order({ status: 'pending' })]);
    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'BAD_REQUEST'
    );

    expect(refundPayment).not.toHaveBeenCalled();
  });

  it('gateway throw keeps the claim (status stays refunded, counter untouched) and logs at error', async () => {
    selectQueue.push([order()]);
    updateQueue.push({ rowCount: 1 });
    refundPayment.mockRejectedValue(new Error('ETIMEDOUT'));

    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'INTERNAL_SERVER_ERROR'
    );

    expect(orderWrites()).toEqual([
      expect.objectContaining({ status: 'refunded' }),
    ]);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('outcome unknown'),
      expect.objectContaining({
        orderId: ORDER_ID,
        amountCents: 10000,
        error: 'ETIMEDOUT',
      })
    );
  });

  it('definitive decline rolls the status back to its prior value', async () => {
    selectQueue.push([order({ status: 'shipped' })]);
    updateQueue.push({ rowCount: 1 }, { rowCount: 1 });
    refundPayment.mockResolvedValue({
      status: 'failed',
      failureReason: 'card_closed',
    });

    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'PRECONDITION_FAILED'
    );

    expect(orderWrites().map((w) => w.status)).toEqual(['refunded', 'shipped']);
    expect(orderWrites()[1]).toMatchObject({ refundedAt: null });
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it('cap guard tripping after payout keeps status refunded and errors loudly', async () => {
    selectQueue.push([order()]);
    updateQueue.push({ rowCount: 1 }, []);

    await expectTRPC(
      refundWholeOrder({ orderId: ORDER_ID, actor: 'admin-1' }),
      'INTERNAL_SERVER_ERROR'
    );

    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('reconcile'),
      expect.objectContaining({ refundId: 're_1' })
    );
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });
});

// ─── webhook payment.refunded ─────────────────────────────────────────────

describe('handleStorePaymentEvent payment.refunded', () => {
  const event = {
    orderId: ORDER_ID,
    eventType: 'payment.refunded',
    eventId: 'evt_1',
    providerId: 'stripe',
  };
  const webhookOrder = (status: string) => ({
    id: ORDER_ID,
    status,
    placedByUserId: 'user-1',
    guestEmail: null,
    organizationId: null,
    orderNumber: 'ORD-1',
    totalCents: 10000,
    currency: 'EUR',
    metadata: null,
  });

  it('settles the ledger (refundedCents = total) and flips status in one CAS update', async () => {
    selectQueue.push([webhookOrder('processing')]);
    updateQueue.push([{ id: ORDER_ID }]);

    const result = await handleStorePaymentEvent(event);

    expect(result.processed).toBe(true);
    const [settle] = orderWrites();
    expect(settle).toMatchObject({ status: 'refunded' });
    expect(settle).toHaveProperty('refundedCents');
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      ORDER_ID,
      'refunded',
      'system',
      expect.any(String)
    );
    expect(mockRestoreInventory).toHaveBeenCalledWith(ORDER_ID);
  });

  it('redelivery is a no-op: CAS matches 0 rows → no status event, no inventory restore', async () => {
    selectQueue.push([webhookOrder('refunded')]);
    updateQueue.push([]);

    const result = await handleStorePaymentEvent(event);

    expect(result.processed).toBe(true);
    expect(orderWrites()).toHaveLength(1);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
    expect(mockRestoreInventory).not.toHaveBeenCalled();
  });
});
