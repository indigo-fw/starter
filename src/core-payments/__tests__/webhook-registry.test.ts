import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type PaymentsDeps, setPaymentsDeps } from '@/core-payments/deps';
import {
  type PaymentWebhookContext,
  clearPaymentWebhookHandlers,
  dispatchPaymentEvent,
  getPaymentWebhookHandler,
  registerPaymentWebhookHandler,
} from '@/core-payments/lib/webhook-registry';
import type { WebhookEvent } from '@/core-payments/types/payment';

const ctx: PaymentWebhookContext = {
  event: { type: 'payment.completed' },
  providerId: 'stripe',
  eventId: 'evt_1',
  metadata: { type: 'token_pack', packId: 'p1' },
};

beforeEach(() => {
  clearPaymentWebhookHandlers();
});

describe('payment webhook registry', () => {
  it('routes a registered metadata type to its handler', async () => {
    registerPaymentWebhookHandler('token_pack', async (c) => ({
      handled: c.metadata.packId,
    }));
    const handler = getPaymentWebhookHandler('token_pack');
    expect(handler).toBeDefined();
    expect(await handler!(ctx)).toEqual({ handled: 'p1' });
  });

  it('returns undefined for unregistered or missing types (subscription fallthrough)', () => {
    expect(getPaymentWebhookHandler('store_order')).toBeUndefined();
    expect(getPaymentWebhookHandler(undefined)).toBeUndefined();
  });

  it('last registration wins for the same type', async () => {
    registerPaymentWebhookHandler('store_order', async () => ({ version: 1 }));
    registerPaymentWebhookHandler('store_order', async () => ({ version: 2 }));
    expect(await getPaymentWebhookHandler('store_order')!(ctx)).toEqual({
      version: 2,
    });
  });
});

describe('dispatchPaymentEvent', () => {
  const stubDeps = (overrides: Partial<PaymentsDeps> = {}): PaymentsDeps => ({
    getEnabledProviderConfigs: () => [],
    getPlan: () => undefined,
    getPlanByProviderPriceId: () => undefined,
    getProviderPriceId: () => null,
    resolveOrgId: async () => 'org-1',
    broadcastEvent: () => {},
    ...overrides,
  });

  const oneTimeEvent: WebhookEvent = {
    type: 'payment.completed',
    providerData: {
      metadata: { type: 'token_pack', packId: 'p1' },
      _eventId: 'evt_9',
    },
  };

  it('routes to the registered one-time handler with the echoed metadata', async () => {
    const handler = vi.fn(async () => ({ credited: true }));
    registerPaymentWebhookHandler('token_pack', handler);
    const handleSubscriptionWebhookEvent = vi.fn(async () => {});
    setPaymentsDeps(stubDeps({ handleSubscriptionWebhookEvent }));

    const result = await dispatchPaymentEvent({
      event: oneTimeEvent,
      providerId: 'stripe',
      eventId: 'evt_9',
    });

    expect(result).toEqual({ credited: true });
    expect(handler).toHaveBeenCalledWith({
      event: oneTimeEvent,
      providerId: 'stripe',
      eventId: 'evt_9',
      metadata: { type: 'token_pack', packId: 'p1' },
    });
    expect(handleSubscriptionWebhookEvent).not.toHaveBeenCalled();
  });

  it('falls through to the injected subscription handler when no type matches', async () => {
    const handleSubscriptionWebhookEvent = vi.fn(async () => {});
    setPaymentsDeps(stubDeps({ handleSubscriptionWebhookEvent }));
    const event: WebhookEvent = {
      type: 'subscription.activated',
      organizationId: 'org-1',
    };

    await dispatchPaymentEvent({
      event,
      providerId: 'nowpayments',
      eventId: 'reconcile:tx-1',
    });

    expect(handleSubscriptionWebhookEvent).toHaveBeenCalledWith({
      event,
      providerId: 'nowpayments',
    });
  });

  it('throws (so the caller releases its claim) when nothing can take the event', async () => {
    setPaymentsDeps(stubDeps());

    await expect(
      dispatchPaymentEvent({
        event: oneTimeEvent,
        providerId: 'stripe',
        eventId: 'evt_9',
      })
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
