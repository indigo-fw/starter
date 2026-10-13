import { NowPaymentsProvider } from '../providers/nowpayments-provider';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTransaction,
  updateTransactionStatus,
} from '@/core-payments/lib/transaction-service';
import { TransactionStatus } from '@/core-payments/types/payment';
import { asMock } from '@/test-utils';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core-payments/deps', () => ({
  getPaymentsDeps: vi.fn(),
}));

vi.mock('@/core-payments/lib/transaction-service', () => ({
  createTransaction: vi.fn(),
  updateTransactionProvider: vi.fn(),
  updateTransactionStatus: vi.fn(),
  getTransaction: vi.fn(),
  getNowPaymentsApiBase: () => 'https://api.nowpayments.io',
}));

const IPN_SECRET = 'test-ipn-secret';
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

/** Build a signed IPN request the way NOWPayments does (HMAC-SHA512 over key-sorted JSON). */
function ipnRequest(
  paymentStatus: string,
  extra: Record<string, unknown> = {}
): Request {
  const body = {
    order_id: ORDER_ID,
    payment_id: 987654,
    payment_status: paymentStatus,
    ...extra,
  };
  const sig = createHmac('sha512', IPN_SECRET)
    .update(JSON.stringify(sortKeys(body)))
    .digest('hex');
  return new Request('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    headers: { 'x-nowpayments-sig': sig, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function txRow(status: TransactionStatus) {
  return {
    id: ORDER_ID,
    organizationId: 'org-1',
    providerId: 'nowpayments',
    providerTxId: '555',
    amountCents: 9900,
    currency: 'usd',
    status,
    planId: 'pro',
    interval: 'yearly',
    discountCodeId: null,
    discountAmountCents: 0,
    rawRequest: { discountUsageId: 'du-1' },
    rawResponse: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('NowPaymentsProvider.handleWebhook — status transition table', () => {
  const provider = new NowPaymentsProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOWPAYMENTS_IPN_SECRET = IPN_SECRET;
    // Default: the CAS wins. Individual cases override to simulate a lost race.
    asMock(updateTransactionStatus).mockResolvedValue(true);
  });

  it('rejects an IPN with a bad signature before touching the transaction', async () => {
    asMock(getTransaction).mockResolvedValue(txRow(TransactionStatus.PENDING));
    const req = new Request('http://localhost/api/webhooks/nowpayments', {
      method: 'POST',
      headers: { 'x-nowpayments-sig': 'deadbeef' },
      body: JSON.stringify({ order_id: ORDER_ID, payment_status: 'finished' }),
    });
    await expect(provider.handleWebhook(req)).rejects.toThrow(
      'Invalid NOWPayments IPN signature'
    );
    expect(updateTransactionStatus).not.toHaveBeenCalled();
  });

  // ── finished ────────────────────────────────────────────────────────────

  it('finished: activates when the row moves PENDING/FAILED → SUCCESSFUL', async () => {
    asMock(getTransaction).mockResolvedValue(txRow(TransactionStatus.PENDING));

    const event = await provider.handleWebhook(ipnRequest('finished'));

    expect(updateTransactionStatus).toHaveBeenCalledWith(
      ORDER_ID,
      TransactionStatus.SUCCESSFUL,
      expect.objectContaining({ payment_status: 'finished' }),
      [TransactionStatus.PENDING, TransactionStatus.FAILED]
    );
    expect(event.type).toBe('subscription.activated');
    expect(event.organizationId).toBe('org-1');
    expect(event.planId).toBe('pro');
    // Checkout metadata is merged so downstream can resolve discount usage.
    expect(event.providerData).toMatchObject({
      discountUsageId: 'du-1',
      payment_status: 'finished',
    });
  });

  it('finished: does NOT activate again when the row is already SUCCESSFUL (CAS lost)', async () => {
    asMock(getTransaction).mockResolvedValue(
      txRow(TransactionStatus.SUCCESSFUL)
    );
    asMock(updateTransactionStatus).mockResolvedValue(false);

    const event = await provider.handleWebhook(ipnRequest('finished'));

    expect(event.type).toBe('subscription.updated');
    expect(event.providerSubscriptionId).toBeUndefined();
  });

  it('finished: does NOT activate a REFUNDED row', async () => {
    asMock(getTransaction).mockResolvedValue(txRow(TransactionStatus.REFUNDED));
    asMock(updateTransactionStatus).mockResolvedValue(false);

    const event = await provider.handleWebhook(ipnRequest('finished'));

    expect(event.type).toBe('subscription.updated');
  });

  // ── confirmed / partially_paid / progress ───────────────────────────────

  it.each(['confirmed', 'confirming', 'waiting', 'sending'])(
    '%s: records progress only, never activates',
    async (status) => {
      asMock(getTransaction).mockResolvedValue(
        txRow(TransactionStatus.PENDING)
      );

      const event = await provider.handleWebhook(ipnRequest(status));

      expect(event.type).toBe('subscription.updated');
      expect(event.providerSubscriptionId).toBeUndefined();
      // Status stays PENDING; only the payload is stored, and only while pending.
      expect(updateTransactionStatus).toHaveBeenCalledWith(
        ORDER_ID,
        TransactionStatus.PENDING,
        expect.objectContaining({ payment_status: status }),
        [TransactionStatus.PENDING]
      );
    }
  );

  it('partially_paid: stores the payload and keeps waiting', async () => {
    asMock(getTransaction).mockResolvedValue(txRow(TransactionStatus.PENDING));

    const event = await provider.handleWebhook(
      ipnRequest('partially_paid', { actually_paid: 0.5, price_amount: 1 })
    );

    expect(event.type).toBe('subscription.updated');
    expect(updateTransactionStatus).toHaveBeenCalledWith(
      ORDER_ID,
      TransactionStatus.PENDING,
      expect.anything(),
      [TransactionStatus.PENDING]
    );
  });

  // ── failed / expired ────────────────────────────────────────────────────

  it.each(['failed', 'expired'])(
    '%s: fails a PENDING transaction and emits payment.failed',
    async (status) => {
      asMock(getTransaction).mockResolvedValue(
        txRow(TransactionStatus.PENDING)
      );

      const event = await provider.handleWebhook(ipnRequest(status));

      expect(updateTransactionStatus).toHaveBeenCalledWith(
        ORDER_ID,
        TransactionStatus.FAILED,
        expect.anything(),
        [TransactionStatus.PENDING]
      );
      expect(event.type).toBe('payment.failed');
      expect(event.organizationId).toBe('org-1');
    }
  );

  it.each(['failed', 'expired'])(
    '%s: is ignored for a SUCCESSFUL transaction (late IPN)',
    async (status) => {
      asMock(getTransaction).mockResolvedValue(
        txRow(TransactionStatus.SUCCESSFUL)
      );
      asMock(updateTransactionStatus).mockResolvedValue(false);

      const event = await provider.handleWebhook(ipnRequest(status));

      // No customer-facing "payment failed" notification for a paid customer.
      expect(event.type).toBe('subscription.updated');
    }
  );

  // ── refunded ────────────────────────────────────────────────────────────

  it('refunded: applies from PENDING or SUCCESSFUL and emits payment.refunded', async () => {
    asMock(getTransaction).mockResolvedValue(
      txRow(TransactionStatus.SUCCESSFUL)
    );

    const event = await provider.handleWebhook(ipnRequest('refunded'));

    expect(updateTransactionStatus).toHaveBeenCalledWith(
      ORDER_ID,
      TransactionStatus.REFUNDED,
      expect.anything(),
      [TransactionStatus.PENDING, TransactionStatus.SUCCESSFUL]
    );
    expect(event.type).toBe('payment.refunded');
  });

  it('refunded: is ignored for a FAILED (never paid) transaction', async () => {
    asMock(getTransaction).mockResolvedValue(txRow(TransactionStatus.FAILED));
    asMock(updateTransactionStatus).mockResolvedValue(false);

    const event = await provider.handleWebhook(ipnRequest('refunded'));

    expect(event.type).toBe('subscription.updated');
  });
});
