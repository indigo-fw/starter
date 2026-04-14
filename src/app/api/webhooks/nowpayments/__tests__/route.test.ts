import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payment factory
const mockHandleWebhook = vi.fn();
vi.mock('@/core-payments/lib/factory', () => ({
  getProvider: vi.fn().mockReturnValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'nowpayments' },
  }),
}));

// Mock DB
const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockInsert = vi.fn().mockReturnValue({ values: (...args: unknown[]) => { mockInsertValues(...args); return Promise.resolve(undefined); } });

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

// Mock dynamically-imported handler
const mockHandleSubscriptionWebhookEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-subscriptions/lib/webhook-handler', () => ({
  handleSubscriptionWebhookEvent: (...args: unknown[]) => mockHandleSubscriptionWebhookEvent(...args),
}));

import { POST } from '../route';
import { getProvider } from '@/core-payments/lib/factory';
import { asMock } from '@/test-utils';

function makeRequest(body = '{}') {
  return new Request('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    body,
  });
}

describe('NOWPayments webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getProvider).mockReturnValue({
      handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
      config: { id: 'nowpayments' },
    });
    mockHandleSubscriptionWebhookEvent.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({
      values: (...args: unknown[]) => { mockInsertValues(...args); return Promise.resolve(undefined); },
    });
  });

  it('returns 503 when provider is not configured', async () => {
    asMock(getProvider).mockReturnValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
  });

  it('returns 400 when webhook verification fails', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid signature'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns duplicate:true for already-processed events', async () => {
    mockInsert.mockReturnValueOnce({
      values: () => Promise.reject(new Error('unique constraint violation')),
    });
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { order_id: 'tx-dup' },
    });

    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(mockHandleSubscriptionWebhookEvent).not.toHaveBeenCalled();
  });

  it('delegates subscription.activated to handleSubscriptionWebhookEvent', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      providerData: { order_id: 'tx-1' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockHandleSubscriptionWebhookEvent).toHaveBeenCalledWith({
      event: expect.objectContaining({
        type: 'subscription.activated',
        organizationId: 'org-1',
      }),
      providerId: 'nowpayments',
    });
  });

  it('delegates payment.failed to handler', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      organizationId: 'org-2',
      providerData: { order_id: 'tx-fail' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockHandleSubscriptionWebhookEvent).toHaveBeenCalledWith({
      event: expect.objectContaining({ type: 'payment.failed' }),
      providerId: 'nowpayments',
    });
  });

  it('returns 500 when handler throws', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { order_id: 'tx-err' },
    });
    mockHandleSubscriptionWebhookEvent.mockRejectedValue(new Error('DB error'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
