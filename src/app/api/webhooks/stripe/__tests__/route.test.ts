import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payment factory
const mockHandleWebhook = vi.fn();
vi.mock('@/core-payments/lib/factory', () => ({
  getProvider: vi.fn().mockReturnValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'stripe' },
  }),
}));

// Mock DB
const mockInsertValues = vi.fn();
const mockInsert = vi.fn().mockImplementation(() => ({
  values: (...args: unknown[]) => {
    mockInsertValues(...args);
    return {
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([{ id: 'notif-1' }]),
    };
  },
}));

vi.mock('@/server/db', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock('@/server/db/schema', () => ({
  saasSubscriptionEvents: {
    id: 'id',
    providerEventId: 'provider_event_id',
  },
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock dynamically-imported handlers
const mockHandleSubscriptionWebhookEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-subscriptions/lib/webhook-handler', () => ({
  handleSubscriptionWebhookEvent: (...args: unknown[]) => mockHandleSubscriptionWebhookEvent(...args),
}));

const mockHandleStorePaymentEvent = vi.fn().mockResolvedValue({ processed: true });
vi.mock('@/core-store/lib/webhook-handler', () => ({
  handleStorePaymentEvent: (...args: unknown[]) => mockHandleStorePaymentEvent(...args),
}));

import { POST } from '../route';
import { getProvider } from '@/core-payments/lib/factory';
import { asMock } from '@/test-utils';

function makeRequest(body: string, signature = 'sig_valid') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': signature },
  });
}

describe('Stripe webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleSubscriptionWebhookEvent.mockResolvedValue(undefined);
    mockHandleStorePaymentEvent.mockResolvedValue({ processed: true });
  });

  it('returns 503 if stripe provider is not configured', async () => {
    asMock(getProvider).mockReturnValue(null);
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(503);
    asMock(getProvider).mockReturnValue({
      handleWebhook: mockHandleWebhook,
      config: { id: 'stripe' },
    });
  });

  it('returns 400 if webhook handling fails', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid signature'));
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('returns duplicate:true for already-processed events', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { _eventId: 'evt_dup' },
    });
    mockInsert.mockImplementationOnce(() => ({
      values: () => Promise.reject(new Error('unique constraint violation')),
    }));

    const res = await POST(makeRequest('{}'));
    const body = await res.json();
    expect(body.duplicate).toBe(true);
  });

  // ── Subscription event delegation ──────────────────────────────────

  it('delegates subscription.activated to handleSubscriptionWebhookEvent', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      providerSubscriptionId: 'sub_123',
      providerData: { _eventId: 'evt_checkout' },
    });

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    expect(mockHandleSubscriptionWebhookEvent).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'subscription.activated',
        organizationId: 'org-1',
      }),
      providerId: 'stripe',
    });
  });

  it('delegates subscription.canceled to handleSubscriptionWebhookEvent', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.canceled',
      providerSubscriptionId: 'sub_456',
      status: 'canceled',
      providerData: { _eventId: 'evt_deleted' },
    });

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockHandleSubscriptionWebhookEvent).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: 'subscription.canceled' }),
      providerId: 'stripe',
    });
  });

  it('delegates payment.failed to handleSubscriptionWebhookEvent', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      providerSubscriptionId: 'sub_789',
      providerData: { _eventId: 'evt_failed' },
    });

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockHandleSubscriptionWebhookEvent).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: 'payment.failed' }),
      providerId: 'stripe',
    });
  });

  it('returns 500 if subscription handler throws', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { _eventId: 'evt_error' },
    });
    mockHandleSubscriptionWebhookEvent.mockRejectedValue(new Error('DB error'));

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
  });

  // ── Store order routing ──────────────────────────────────────────────

  it('routes store order events to handleStorePaymentEvent', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: {
        _eventId: 'evt_store_1',
        metadata: { type: 'store_order', orderId: 'order-abc' },
      },
    });

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.processed).toBe(true);

    expect(mockHandleStorePaymentEvent).toHaveBeenCalledWith({
      orderId: 'order-abc',
      eventType: 'payment.completed',
      eventId: 'evt_store_1',
      providerId: 'stripe',
      transactionId: undefined,
    });

    // Should NOT call subscription handler
    expect(mockHandleSubscriptionWebhookEvent).not.toHaveBeenCalled();
  });

  it('does not route to store handler when metadata has no store type', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      providerSubscriptionId: 'sub_normal',
      providerData: {
        _eventId: 'evt_sub_normal',
        metadata: { userId: 'user-1' },
      },
    });

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);

    expect(mockHandleStorePaymentEvent).not.toHaveBeenCalled();
    expect(mockHandleSubscriptionWebhookEvent).toHaveBeenCalled();
  });

  it('returns 500 when store handler throws', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.completed',
      providerData: {
        _eventId: 'evt_store_err',
        metadata: { type: 'store_order', orderId: 'order-fail' },
      },
    });
    mockHandleStorePaymentEvent.mockRejectedValue(new Error('Store DB error'));

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
  });
});
