import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (before route import) ──────────────────────────────────────────

const mockHandleWebhook = vi.fn();
vi.mock('@/core-payments/lib/factory', () => ({
  getProvider: vi.fn().mockResolvedValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'stripe' },
  }),
}));

const mockHandleStorePaymentEvent = vi.fn().mockResolvedValue({ processed: true });
vi.mock('@/core-store/lib/webhook-handler', () => ({
  handleStorePaymentEvent: (...args: unknown[]) => mockHandleStorePaymentEvent(...args),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ─── Import route handler AFTER mocks ─────────────────────────────────────

import { POST } from '@/app/api/webhooks/store/route';
import { getProvider } from '@/core-payments/lib/factory';
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

    asMock(getProvider).mockResolvedValue({
      handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
      config: { id: 'stripe' },
    });
    mockHandleStorePaymentEvent.mockResolvedValue({ processed: true });
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

  it('delegates to handleStorePaymentEvent on payment.completed', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: {
        _eventId: 'evt_paid_1',
        metadata: { orderId: 'order-1' },
        transactionId: 'txn_123',
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.processed).toBe(true);

    expect(mockHandleStorePaymentEvent).toHaveBeenCalledWith({
      orderId: 'order-1',
      eventType: 'payment.completed',
      eventId: 'evt_paid_1',
      providerId: 'stripe',
      transactionId: 'txn_123',
    });
  });

  it('delegates payment.failed events', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      providerData: {
        _eventId: 'evt_fail_1',
        metadata: { orderId: 'order-2' },
      },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockHandleStorePaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-2',
        eventType: 'payment.failed',
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
    mockHandleStorePaymentEvent.mockRejectedValue(new Error('DB connection lost'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Processing error');
  });
});
