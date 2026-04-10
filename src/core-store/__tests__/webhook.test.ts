import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (before route import) ──────────────────────────────────────────

const mockHandleWebhook = vi.fn();
vi.mock('@/core-payments/lib/factory', () => ({
  getProvider: vi.fn().mockResolvedValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'stripe' },
  }),
}));

const mockUpdateOrderStatus = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-store/lib/order-service', () => ({
  updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
}));

const mockSendNotification = vi.fn();
const mockEnqueueTemplateEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-store/deps', () => ({
  getStoreDeps: vi.fn().mockReturnValue({
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
    enqueueTemplateEmail: (...args: unknown[]) => mockEnqueueTemplateEmail(...args),
  }),
}));

// Track DB operations
const mockInsertValues = vi.fn();
const mockInsert = vi.fn().mockImplementation(() => ({
  values: (...args: unknown[]) => {
    mockInsertValues(...args);
    return Promise.resolve(undefined);
  },
}));

let selectResults: unknown[][] = [];
let selectCallIndex = 0;

function mockSelectChain() {
  return {
    from: () => ({
      where: () => ({
        limit: () => {
          const result = selectResults[selectCallIndex] ?? [];
          selectCallIndex++;
          return Promise.resolve(result);
        },
      }),
    }),
  };
}

const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
});

vi.mock('@/server/db', () => ({
  db: {
    select: () => mockSelectChain(),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('@/core-store/schema/orders', () => ({
  storeOrders: {
    id: 'id',
    status: 'status',
    userId: 'user_id',
    paymentTransactionId: 'payment_transaction_id',
    paidAt: 'paid_at',
  },
  storeOrderEvents: {
    id: 'id',
    orderId: 'order_id',
    status: 'status',
    note: 'note',
    actor: 'actor',
    metadata: 'metadata',
  },
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => val),
}));

// ─── Import route handler AFTER mocks ─────────────────────────────────────

import { POST } from '@/app/api/webhooks/store/route';
import { getProvider } from '@/core-payments/lib/factory';
import { logAudit } from '@/core/lib/infra/audit';
import { asMock } from '@/core/test-utils';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(body = '{}', provider = 'stripe') {
  return new Request(`http://localhost/api/webhooks/store?provider=${provider}`, {
    method: 'POST',
    body,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Store webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults = [];
    selectCallIndex = 0;

    // Restore default mock behavior
    asMock(getProvider).mockResolvedValue({
      handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
      config: { id: 'stripe' },
    });
    mockInsert.mockImplementation(() => ({
      values: (...args: unknown[]) => {
        mockInsertValues(...args);
        return Promise.resolve(undefined);
      },
    }));
    mockUpdateOrderStatus.mockResolvedValue(undefined);
  });

  it('returns 503 when provider not configured', async () => {
    asMock(getProvider).mockResolvedValue(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe('Provider not configured');
  });

  it('returns 400 when webhook verification fails', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid signature'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('Invalid signature');
  });

  it('returns 200 with skipped when no orderId in metadata', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: { _eventId: 'evt_no_order', metadata: {} },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skipped).toBe('no orderId');
  });

  it('updates order to processing on payment.completed', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: {
        _eventId: 'evt_paid_1',
        metadata: { orderId: 'order-1' },
        transactionId: 'txn_123',
      },
    });
    // Order exists with pending status
    selectResults = [[{ id: 'order-1', status: 'pending', userId: 'user-1' }]];

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      'processing',
      'system',
      'Payment confirmed via webhook',
    );

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        title: 'Payment confirmed',
      }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'store.order.paid',
        entityId: 'order-1',
      }),
    );
  });

  it('handles duplicate events gracefully', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: {
        _eventId: 'evt_dup',
        metadata: { orderId: 'order-1' },
      },
    });

    // Simulate unique constraint violation on event insert
    mockInsert.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error('duplicate key unique constraint')),
    }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.duplicate).toBe(true);

    // Should NOT attempt to update order
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it('handles payment.failed by keeping order pending', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      providerData: {
        _eventId: 'evt_fail_1',
        metadata: { orderId: 'order-2' },
      },
    });
    // Order exists
    selectResults = [[{ id: 'order-2', status: 'pending', userId: 'user-2' }]];

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    // Should NOT update status — order stays pending for retry
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        title: 'Payment issue',
      }),
    );
  });

  it('returns 500 on processing error', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: {
        _eventId: 'evt_err',
        metadata: { orderId: 'order-3' },
      },
    });
    // Order exists
    selectResults = [[{ id: 'order-3', status: 'pending', userId: 'user-3' }]];
    // updateOrderStatus throws
    mockUpdateOrderStatus.mockRejectedValue(new Error('DB connection lost'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Processing error');
  });
});
