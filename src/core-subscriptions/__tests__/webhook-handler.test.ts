import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  activateSubscriptionMock,
  updateSubscriptionMock,
  cancelSubscriptionMock,
  getOrgByProviderSubscriptionMock,
  finalizeUsageMock,
  grantTokensMock,
  sendOrgNotificationMock,
  runHookMock,
  tagSubscriberMock,
  dbRowsRef,
} = vi.hoisted(() => ({
  activateSubscriptionMock: vi.fn(),
  updateSubscriptionMock: vi.fn(),
  cancelSubscriptionMock: vi.fn(),
  getOrgByProviderSubscriptionMock: vi.fn().mockResolvedValue('org-1'),
  finalizeUsageMock: vi.fn(),
  grantTokensMock: vi.fn(),
  sendOrgNotificationMock: vi.fn(),
  runHookMock: vi.fn(),
  tagSubscriberMock: vi.fn(),
  dbRowsRef: { current: [] as Array<Record<string, unknown>> },
}));

// Self-chaining select mock: every builder method returns the chain; `limit`
// resolves to dbRowsRef (used for the user-email and org-owner lookups).
vi.mock('@/server/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    limit: () => Promise.resolve(dbRowsRef.current),
  };
  return { db: { select: () => chain } };
});
vi.mock('@/server/db/schema', () => ({ user: {} }));
vi.mock('@/server/db/schema/organization', () => ({ member: {} }));
vi.mock('@/core-subscriptions/lib/subscription-service', () => ({
  activateSubscription: activateSubscriptionMock,
  updateSubscription: updateSubscriptionMock,
  cancelSubscription: cancelSubscriptionMock,
  getOrgByProviderSubscription: getOrgByProviderSubscriptionMock,
}));
vi.mock('@/core-subscriptions/lib/discount-service', () => ({ finalizeUsage: finalizeUsageMock }));
vi.mock('@/core-subscriptions/lib/token-grants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core-subscriptions/lib/token-grants')>()),
  grantSubscriptionTokensForOrg: grantTokensMock,
}));
vi.mock('@/core-subscriptions/deps', () => ({
  getSubscriptionsDeps: () => ({
    getPlanByProviderPriceId: (_providerId: string, priceId: string) =>
      ['price_m', 'price_y'].includes(priceId)
        ? {
            id: 'pro',
            name: 'Pro',
            priceMonthly: 4900,
            priceYearly: 49000,
            providerPrices: { stripe: { monthly: 'price_m', yearly: 'price_y' } },
          }
        : undefined,
    sendOrgNotification: sendOrgNotificationMock,
  }),
}));
vi.mock('@/core/lib/infra/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/core/lib/infra/stats-cache', () => ({ invalidateStats: vi.fn() }));
vi.mock('@/core/lib/module/module-hooks', () => ({ runHook: runHookMock }));
vi.mock('@/core/lib/email-list/index', () => ({ tagSubscriber: tagSubscriberMock }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { handleSubscriptionWebhookEvent } from '@/core-subscriptions/lib/webhook-handler';
import type { WebhookEvent } from '@/core-payments/types/payment';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  getOrgByProviderSubscriptionMock.mockResolvedValue('org-1');
  dbRowsRef.current = [];
});

describe('subscription.activated', () => {
  const activatedEvent = (overrides: Partial<WebhookEvent> = {}): WebhookEvent => ({
    type: 'subscription.activated',
    organizationId: 'org-1',
    planId: 'pro',
    status: 'active',
    providerSubscriptionId: 'sub_1',
    providerCustomerId: 'cus_1',
    providerPriceId: 'price_y',
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 365 * DAY_MS),
    providerData: { _eventId: 'evt_1' },
    ...overrides,
  });

  it('activates with the interval resolved from the yearly price ID and grants tokens', async () => {
    await handleSubscriptionWebhookEvent({ event: activatedEvent(), providerId: 'stripe' });

    expect(activateSubscriptionMock).toHaveBeenCalledTimes(1);
    const params = activateSubscriptionMock.mock.calls[0]![0] as { interval: string; organizationId: string };
    expect(params.interval).toBe('yearly');
    expect(params.organizationId).toBe('org-1');
    expect(grantTokensMock).toHaveBeenCalledWith('org-1');
    expect(sendOrgNotificationMock).toHaveBeenCalled();
    expect(finalizeUsageMock).not.toHaveBeenCalled();
  });

  it('resolves monthly from the monthly price ID', async () => {
    await handleSubscriptionWebhookEvent({
      event: activatedEvent({ providerPriceId: 'price_m', periodEnd: new Date(Date.now() + 30 * DAY_MS) }),
      providerId: 'stripe',
    });
    const params = activateSubscriptionMock.mock.calls[0]![0] as { interval: string };
    expect(params.interval).toBe('monthly');
  });

  it('falls back to the period length when there is no price ID (NOWPayments)', async () => {
    await handleSubscriptionWebhookEvent({
      event: activatedEvent({ providerPriceId: undefined, providerSubscriptionId: undefined }),
      providerId: 'nowpayments',
    });
    const params = activateSubscriptionMock.mock.calls[0]![0] as { interval: string };
    expect(params.interval).toBe('yearly');
  });

  it('finalizes discount usage and records the affiliate conversion', async () => {
    dbRowsRef.current = [{ email: 'buyer@example.com' }];
    await handleSubscriptionWebhookEvent({
      event: activatedEvent({
        providerData: { _eventId: 'evt_1', discountUsageId: 'du-1', userId: 'user-1' },
      }),
      providerId: 'stripe',
    });

    expect(finalizeUsageMock).toHaveBeenCalledWith('du-1', 'sub_1');
    // Yearly price resolved → conversion amount is the yearly plan price
    expect(runHookMock).toHaveBeenCalledWith('payment.conversion', 'user-1', 'sub_1', 49000);
    expect(tagSubscriberMock).toHaveBeenCalledWith('buyer@example.com', ['pro']);
  });
});

describe('subscription.updated', () => {
  it('updates the subscription with the resolved interval and grants due tokens', async () => {
    await handleSubscriptionWebhookEvent({
      event: {
        type: 'subscription.updated',
        planId: 'pro',
        status: 'active',
        providerSubscriptionId: 'sub_1',
        providerPriceId: 'price_m',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * DAY_MS),
      },
      providerId: 'stripe',
    });

    expect(updateSubscriptionMock).toHaveBeenCalledWith('sub_1', expect.objectContaining({ interval: 'monthly' }));
    expect(getOrgByProviderSubscriptionMock).toHaveBeenCalledWith('sub_1');
    expect(grantTokensMock).toHaveBeenCalledWith('org-1');
  });

  it('ignores events without a provider subscription id', async () => {
    await handleSubscriptionWebhookEvent({
      event: { type: 'subscription.updated' },
      providerId: 'stripe',
    });
    expect(updateSubscriptionMock).not.toHaveBeenCalled();
    expect(grantTokensMock).not.toHaveBeenCalled();
  });
});

describe('subscription.canceled', () => {
  it('cancels, notifies, and tags the owner as churned', async () => {
    dbRowsRef.current = [{ email: 'owner@example.com' }];
    await handleSubscriptionWebhookEvent({
      event: { type: 'subscription.canceled', providerSubscriptionId: 'sub_1', status: 'canceled' },
      providerId: 'stripe',
    });

    expect(cancelSubscriptionMock).toHaveBeenCalledWith('sub_1');
    expect(sendOrgNotificationMock).toHaveBeenCalled();
    expect(tagSubscriberMock).toHaveBeenCalledWith('owner@example.com', ['churned']);
  });
});

describe('payment.failed', () => {
  it('marks the subscription past_due and notifies the org', async () => {
    await handleSubscriptionWebhookEvent({
      event: { type: 'payment.failed', providerSubscriptionId: 'sub_1', status: 'past_due' },
      providerId: 'stripe',
    });

    expect(updateSubscriptionMock).toHaveBeenCalledWith('sub_1', { status: 'past_due' });
    expect(sendOrgNotificationMock).toHaveBeenCalledWith('org-1', expect.objectContaining({ title: 'Payment failed' }));
  });

  it('uses the event organizationId when there is no subscription id (NOWPayments)', async () => {
    await handleSubscriptionWebhookEvent({
      event: { type: 'payment.failed', organizationId: 'org-9' },
      providerId: 'nowpayments',
    });

    expect(updateSubscriptionMock).not.toHaveBeenCalled();
    expect(sendOrgNotificationMock).toHaveBeenCalledWith('org-9', expect.objectContaining({ title: 'Payment failed' }));
  });
});
