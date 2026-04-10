import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payment factory
const mockHandleWebhook = vi.fn();
vi.mock('@/core-payments/lib/factory', () => ({
  getProvider: vi.fn().mockReturnValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'nowpayments' },
  }),
}));

// Mock subscription service
const mockActivateSubscription = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-subscriptions/lib/subscription-service', () => ({
  activateSubscription: (...args: unknown[]) => mockActivateSubscription(...args),
}));

// Mock discount service
const mockFinalizeUsage = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core-subscriptions/lib/discount-service', () => ({
  finalizeUsage: (...args: unknown[]) => mockFinalizeUsage(...args),
}));

// Mock db with idempotency query support
const limitMock = vi.fn().mockResolvedValue([]);
const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
const fromMock = vi.fn().mockReturnValue({ where: whereMock });
const selectMock = vi.fn().mockReturnValue({ from: fromMock });
const valuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

vi.mock('@/server/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

// Mock schema
vi.mock('@/server/db/schema', () => ({
  saasSubscriptionEvents: {
    id: 'saas_subscription_events.id',
    providerEventId: 'saas_subscription_events.provider_event_id',
  },
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _type: 'eq', val })),
}));

// Mock audit
vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

// Mock notifications
vi.mock('@/server/lib/notifications', () => ({
  sendOrgNotification: vi.fn(),
}));

// Mock notification types
vi.mock('@/core/types/notifications', () => ({
  NotificationType: { SUCCESS: 'success', WARNING: 'warning', ERROR: 'error' },
  NotificationCategory: { BILLING: 'billing' },
}));

// Mock logger
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { POST } from '../route';
import { getProvider } from '@/core-payments/lib/factory';
import { sendOrgNotification } from '@/server/lib/notifications';
import { logAudit } from '@/core/lib/infra/audit';
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
    // Restore default getProvider mock
    asMock(getProvider).mockReturnValue({
      handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
      config: { id: 'nowpayments' },
    });
    mockActivateSubscription.mockResolvedValue(undefined);
    mockFinalizeUsage.mockResolvedValue(undefined);

    // Re-establish mock chains
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ limit: limitMock });
    limitMock.mockResolvedValue([]); // no duplicate by default
    insertMock.mockReturnValue({ values: valuesMock });
    valuesMock.mockResolvedValue(undefined);
  });

  it('returns 503 when provider is not configured', async () => {
    asMock(getProvider).mockReturnValue(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe('NOWPayments not configured');
  });

  it('returns 400 when webhook verification fails', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid signature'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('Invalid webhook');
  });

  it('processes subscription.activated: calls activateSubscription, logAudit, sendOrgNotification', async () => {
    const periodStart = new Date(1700000000000);
    const periodEnd = new Date(1702600000000);

    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'cus_np_123',
      periodStart,
      periodEnd,
      providerData: { order_id: 'tx-uuid-1', payment_status: 'finished' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(mockActivateSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      planId: 'pro',
      providerId: 'nowpayments',
      interval: 'yearly',
      providerCustomerId: 'cus_np_123',
      status: 'active',
      periodStart,
      periodEnd,
    });

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'system',
      action: 'subscription.created',
      entityType: 'subscription',
      entityId: 'tx-uuid-1',
      metadata: expect.objectContaining({
        orgId: 'org-1',
        planId: 'pro',
        provider: 'nowpayments',
      }),
    }));

    expect(sendOrgNotification).toHaveBeenCalledWith('org-1', expect.objectContaining({
      title: 'Payment confirmed',
      type: 'success',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
    }));
  });

  it('calls finalizeUsage when discountUsageId is present in providerData', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'cus_np_123',
      periodStart: new Date(),
      periodEnd: new Date(),
      providerData: { order_id: 'tx-uuid-2', payment_status: 'finished', discountUsageId: 'usage-1' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFinalizeUsage).toHaveBeenCalledWith('usage-1', 'tx-uuid-2');
  });

  it('does not call finalizeUsage when discountUsageId is absent', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'cus_np_123',
      periodStart: new Date(),
      periodEnd: new Date(),
      providerData: { order_id: 'tx-uuid-3', payment_status: 'finished' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockFinalizeUsage).not.toHaveBeenCalled();
  });

  it('returns duplicate:true for already-processed events (idempotency)', async () => {
    // Simulate unique constraint violation on insert (already processed)
    valuesMock.mockRejectedValueOnce(new Error('unique constraint violation'));

    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerData: { order_id: 'tx-uuid-dup', payment_status: 'finished' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.duplicate).toBe(true);

    // Should NOT process the event
    expect(mockActivateSubscription).not.toHaveBeenCalled();
  });

  it('uses defaults when planId and providerCustomerId are missing on subscription.activated', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-2',
      status: 'active',
      periodStart: new Date(),
      periodEnd: new Date(),
      providerData: { order_id: 'tx-uuid-4', payment_status: 'finished' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockActivateSubscription).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'free',
      providerCustomerId: '',
    }));

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'tx-uuid-4',
    }));
  });

  it('processes payment.failed: sends error notification', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      organizationId: 'org-3',
      providerData: { order_id: 'tx-uuid-5', payment_status: 'failed' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(sendOrgNotification).toHaveBeenCalledWith('org-3', expect.objectContaining({
      title: 'Payment failed',
      body: 'Your crypto payment has failed or expired. Please try again.',
      type: 'error',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
    }));

    // Should not call activateSubscription for payment.failed
    expect(mockActivateSubscription).not.toHaveBeenCalled();
  });

  it('processes payment.refunded: sends warning notification', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.refunded',
      organizationId: 'org-4',
      providerData: { order_id: 'tx-uuid-6', payment_status: 'refunded' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(sendOrgNotification).toHaveBeenCalledWith('org-4', expect.objectContaining({
      title: 'Payment refunded',
      body: 'Your crypto payment has been refunded.',
      type: 'warning',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
    }));

    // Should not call activateSubscription for payment.refunded
    expect(mockActivateSubscription).not.toHaveBeenCalled();
  });

  it('skips processing when organizationId is missing on subscription.activated', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      // no organizationId
      planId: 'pro',
      status: 'active',
      providerData: { order_id: 'tx-uuid-7', payment_status: 'finished' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockActivateSubscription).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('skips processing when organizationId is missing on payment.failed', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      // no organizationId
      providerData: { order_id: 'tx-uuid-8', payment_status: 'failed' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('skips processing when organizationId is missing on payment.refunded', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.refunded',
      // no organizationId
      providerData: { order_id: 'tx-uuid-9', payment_status: 'refunded' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('returns 500 when processing throws an error', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'cus_np_err',
      periodStart: new Date(),
      periodEnd: new Date(),
      providerData: { order_id: 'tx-uuid-err', payment_status: 'finished' },
    });
    mockActivateSubscription.mockRejectedValue(new Error('DB connection failed'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Processing failed');
  });

  it('returns 200 for unknown event types without side effects', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'some.unknown.event',
      organizationId: 'org-5',
      providerData: { order_id: 'tx-uuid-unk', payment_status: 'unknown' },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(mockActivateSubscription).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(sendOrgNotification).not.toHaveBeenCalled();
  });
});
