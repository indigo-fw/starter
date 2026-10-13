import { POST } from '../route';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getProvider } from '@/core-payments/lib/factory';
import { sendStaffAlert } from '@/core/lib/email/staff-alert';
import { asMock } from '@/test-utils';

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
const mockInsert = vi.fn().mockReturnValue({
  values: (...args: unknown[]) => {
    mockInsertValues(...args);
    return Promise.resolve(undefined);
  },
});

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

vi.mock('@/core/lib/email/staff-alert', () => ({
  sendStaffAlert: vi.fn().mockResolvedValue(undefined),
}));

// Mock dynamically-imported handler
const mockHandleSubscriptionWebhookEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-subscriptions/lib/webhook-handler', () => ({
  handleSubscriptionWebhookEvent: (...args: unknown[]) =>
    mockHandleSubscriptionWebhookEvent(...args),
}));

/**
 * What a unique violation looks like after drizzle-orm wraps it: the message
 * is `Failed query: …` and the pg SQLSTATE lives on `cause`, so a message
 * string-match never fires.
 */
function duplicateKeyError(): Error {
  const pg = Object.assign(
    new Error('duplicate key value violates unique constraint'),
    {
      code: '23505',
      constraint_name: 'saas_subscription_events_provider_event_id_unique',
    }
  );
  return Object.assign(
    new Error('Failed query: insert into "saas_subscription_events" …'),
    { cause: pg }
  );
}

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
      values: (...args: unknown[]) => {
        mockInsertValues(...args);
        return Promise.resolve(undefined);
      },
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
    // Unverified traffic alerts on the capped path, with the raw body attached.
    expect(sendStaffAlert).toHaveBeenCalledWith(
      'nowpayments-webhook',
      expect.any(Error),
      expect.any(String),
      { kind: 'unverified' }
    );
  });

  it('returns duplicate:true for already-processed events', async () => {
    mockInsert.mockReturnValueOnce({
      values: () => Promise.reject(duplicateKeyError()),
    });
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { order_id: 'tx-dup' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(mockHandleSubscriptionWebhookEvent).not.toHaveBeenCalled();
  });

  it('rethrows insert failures that are not a unique violation (even if the text mentions "unique")', async () => {
    mockInsert.mockReturnValueOnce({
      values: () => Promise.reject(new Error('unique index is being rebuilt')),
    });
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { order_id: 'tx-other-err' },
    });

    await expect(POST(makeRequest())).rejects.toThrow('unique index');
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
    // A verified IPN whose handler failed is a money event: never throttled.
    expect(sendStaffAlert).toHaveBeenCalledWith(
      'nowpayments-webhook',
      expect.any(Error),
      { order_id: 'tx-err' },
      {
        kind: 'money-event',
        diagnostics: expect.objectContaining({ handler: 'subscription' }),
      }
    );
  });
});
