import { describe, it, expect, beforeEach } from 'vitest';

import {
  registerPaymentWebhookHandler,
  getPaymentWebhookHandler,
  clearPaymentWebhookHandlers,
  type PaymentWebhookContext,
} from '@/core-payments/lib/webhook-registry';

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
    registerPaymentWebhookHandler('token_pack', async (c) => ({ handled: c.metadata.packId }));
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
    expect(await getPaymentWebhookHandler('store_order')!(ctx)).toEqual({ version: 2 });
  });
});
