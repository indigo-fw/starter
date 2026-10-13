import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ProviderChecker,
  type ReconcilableTransaction,
  buildRecoveredPaymentEvent,
  fulfilRecoveredPayment,
  reconcileRecentApprovals,
  reconcileStalePendingTransactions,
  reconciliationEventId,
} from '@/core-payments/lib/reconciliation-service';
import {
  clearPaymentWebhookHandlers,
  registerPaymentWebhookHandler,
} from '@/core-payments/lib/webhook-registry';
import {
  saasPaymentTransactions,
  saasSubscriptionEvents,
} from '@/core-payments/schema/payments';
import type { DrizzleDB } from '@/server/db';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const dialect = new PgDialect();
const HOUR = 60 * 60 * 1000;

// Minimal drizzle-shaped fake: one SELECT result, one UPDATE result per call,
// plus INSERT/DELETE for the idempotency claim.
const mockLimit = vi.fn();
const mockOrderBy = vi.fn((..._args: unknown[]) => ({ limit: mockLimit }));
const mockSelectWhere = vi.fn((..._args: unknown[]) => ({
  limit: mockLimit,
  orderBy: mockOrderBy,
}));
const mockFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockReturning = vi.fn();
const mockUpdateWhere = vi.fn((..._args: unknown[]) => ({
  returning: mockReturning,
}));
const mockSet = vi.fn((..._args: unknown[]) => ({ where: mockUpdateWhere }));
const mockValues = vi.fn();
const mockDeleteWhere = vi.fn();
const fakeDb = {
  select: vi.fn(() => ({ from: mockFrom })),
  update: vi.fn(() => ({ set: mockSet })),
  insert: vi.fn(() => ({ values: mockValues })),
  delete: vi.fn(() => ({ where: mockDeleteWhere })),
} as unknown as DrizzleDB;

function row(
  overrides: Partial<ReconcilableTransaction> = {}
): ReconcilableTransaction {
  return {
    id: 'tx-1',
    organizationId: 'org-1',
    userId: 'user-1',
    providerId: 'stripe',
    providerTxId: 'cs_123',
    amountCents: 4900,
    currency: 'usd',
    planId: 'pro',
    interval: 'yearly',
    rawRequest: { userId: 'user-1', discountUsageId: 'du-1' },
    createdAt: new Date(Date.now() - 48 * HOUR),
    ...overrides,
  };
}

function setCalls(): Record<string, unknown>[] {
  return mockSet.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

const baseResult = {
  checked: 1,
  recovered: 0,
  failed: 0,
  abandoned: 0,
  fulfilmentFailed: 0,
};

describe('reconcileStalePendingTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPaymentWebhookHandlers();
    mockLimit.mockResolvedValue([row()]);
    mockReturning.mockResolvedValue([{ id: 'tx-1' }]);
  });

  it('marks a provider-confirmed payment `successful` and fulfils it exactly once', async () => {
    const tx = row();
    mockLimit.mockResolvedValue([tx]);
    const fulfil = vi.fn(async () => {});
    const check = {
      status: 'successful' as const,
      providerData: { payment_status: 'paid' },
    };

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => check },
      { fulfil }
    );

    expect(result).toEqual({ ...baseResult, recovered: 1 });
    // Revenue queries filter on 'successful' — any other spelling makes the money vanish from reports.
    expect(setCalls()[0]).toMatchObject({
      status: 'successful',
      rawResponse: {
        payment_status: 'paid',
        reconciliation: { outcome: 'recovered' },
      },
    });
    expect(fulfil).toHaveBeenCalledTimes(1);
    expect(fulfil).toHaveBeenCalledWith({ tx, check });
  });

  it('a lost CAS (late webhook already moved the row) does not fulfil or count', async () => {
    mockReturning.mockResolvedValue([]);
    const fulfil = vi.fn(async () => {});

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      { fulfil }
    );

    expect(result).toEqual(baseResult);
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('a throwing fulfil keeps the row SUCCESSFUL, records the failure, and is counted', async () => {
    const fulfil = vi.fn(async () => {
      throw new Error('token grant exploded');
    });

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      { fulfil }
    );

    expect(result).toEqual({
      ...baseResult,
      recovered: 1,
      fulfilmentFailed: 1,
    });
    const [cas, note] = setCalls();
    expect(cas).toMatchObject({ status: 'successful' });
    // Money was taken: status must not flip back, only the breadcrumb lands.
    expect(note).not.toHaveProperty('status');
    expect(note).toMatchObject({
      rawResponse: {
        reconciliation: {
          fulfilment: 'failed',
          error: expect.stringContaining('token grant exploded'),
        },
      },
    });
  });

  it('marks a provider-rejected payment `failed` without fulfilling', async () => {
    const fulfil = vi.fn(async () => {});

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'failed' },
      { fulfil }
    );

    expect(result).toEqual({ ...baseResult, failed: 1 });
    expect(setCalls()[0]).toMatchObject({
      status: 'failed',
      rawResponse: { reconciliation: { outcome: 'failed' } },
    });
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('only updates rows that are still pending (a late webhook wins the race)', async () => {
    await reconcileStalePendingTransactions(fakeDb, saasPaymentTransactions, {
      stripe: async () => 'successful',
    });

    const where = mockUpdateWhere.mock.calls[0]?.[0] as SQL;
    const { sql, params } = dialect.sqlToQuery(where);
    expect(sql).toMatch(/"id" = \$1 and .*"status" = \$2/);
    expect(params).toEqual(['tx-1', 'pending']);
  });

  it('abandons a row the provider still reports pending once it is past the abandon window', async () => {
    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { abandonAfterHours: 24 }
    );

    expect(result).toEqual({ ...baseResult, abandoned: 1 });
    expect(setCalls()[0]).toMatchObject({
      status: 'failed',
      rawResponse: {
        reconciliation: {
          outcome: 'abandoned',
          reason: expect.stringContaining('pending'),
        },
      },
    });
  });

  it('leaves a still-pending row alone while inside the abandon window', async () => {
    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { abandonAfterHours: 72 }
    );

    expect(result).toEqual(baseResult);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('never abandons on `unknown` (provider unreachable), however old the row', async () => {
    mockLimit.mockResolvedValue([
      row({ createdAt: new Date(Date.now() - 30 * 24 * HOUR) }),
    ]);

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'unknown' }
    );

    expect(result).toEqual(baseResult);
    expect(mockSet).not.toHaveBeenCalled();
  });

  describe('rows without a provider transaction id', () => {
    it('abandons after the window when the checker has no merchant-reference lookup', async () => {
      mockLimit.mockResolvedValue([row({ providerTxId: null })]);
      const check = vi.fn(async () => 'successful' as const);

      const result = await reconcileStalePendingTransactions(
        fakeDb,
        saasPaymentTransactions,
        { stripe: check }
      );

      expect(result).toEqual({ ...baseResult, abandoned: 1 });
      expect(check).not.toHaveBeenCalled();
      expect(setCalls()[0]).toMatchObject({
        status: 'failed',
        rawResponse: {
          reconciliation: {
            outcome: 'abandoned',
            reason: expect.stringContaining('no provider transaction id'),
          },
        },
      });
    });

    it('recovers via merchant reference: stores the provider id, marks successful, fulfils', async () => {
      mockLimit.mockResolvedValue([row({ providerTxId: null })]);
      const fulfil = vi.fn(async () => {});
      const checker: ProviderChecker = {
        check: vi.fn(async () => 'unknown' as const),
        findByMerchantReference: vi.fn(async (tx: ReconcilableTransaction) => ({
          status: 'successful' as const,
          providerTxId: `cs_for_${tx.id}`,
          providerData: { payment_status: 'paid' },
        })),
      };

      const result = await reconcileStalePendingTransactions(
        fakeDb,
        saasPaymentTransactions,
        { stripe: checker },
        { fulfil }
      );

      expect(result).toEqual({ ...baseResult, recovered: 1 });
      expect(checker.check).not.toHaveBeenCalled();
      expect(setCalls()[0]).toMatchObject({
        status: 'successful',
        providerTxId: 'cs_for_tx-1',
      });
      expect(fulfil).toHaveBeenCalledTimes(1);
    });

    it('abandons after the window when the merchant-reference lookup finds nothing', async () => {
      mockLimit.mockResolvedValue([row({ providerTxId: null })]);
      const checker: ProviderChecker = {
        check: async () => 'unknown',
        findByMerchantReference: async () => null,
      };

      const result = await reconcileStalePendingTransactions(
        fakeDb,
        saasPaymentTransactions,
        { stripe: checker },
        { abandonAfterHours: 24 }
      );

      expect(result).toEqual({ ...baseResult, abandoned: 1 });
      expect(setCalls()[0]).toMatchObject({ status: 'failed' });
    });

    it('waits (no write) when the lookup finds nothing but the row is inside the window', async () => {
      mockLimit.mockResolvedValue([row({ providerTxId: null })]);
      const checker: ProviderChecker = {
        check: async () => 'unknown',
        findByMerchantReference: async () => null,
      };

      const result = await reconcileStalePendingTransactions(
        fakeDb,
        saasPaymentTransactions,
        { stripe: checker },
        { abandonAfterHours: 72 }
      );

      expect(result).toEqual(baseResult);
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  it('skips providers without a checker and still-pending young rows', async () => {
    mockLimit.mockResolvedValue([
      row(),
      row({ id: 'tx-2', providerId: 'nowpayments', providerTxId: '42' }),
    ]);

    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { abandonAfterHours: 72 }
    );

    expect(result).toEqual({ ...baseResult, checked: 2 });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a throwing provider check is logged and does not abort the sweep', async () => {
    mockLimit.mockResolvedValue([
      row(),
      row({ id: 'tx-2', providerTxId: 'cs_2' }),
    ]);
    let call = 0;
    const result = await reconcileStalePendingTransactions(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => {
          if (call++ === 0) throw new Error('rate limited');
          return 'failed';
        },
      }
    );

    expect(result).toEqual({ ...baseResult, checked: 2, failed: 1 });
  });
});

describe('reconcileRecentApprovals', () => {
  const MINUTE = 60 * 1000;
  const emptyResult = {
    checked: 1,
    fulfilled: 0,
    fulfilmentFailed: 0,
    skipped: 0,
  };

  // Timestamp params come back through the column's driver mapping (ISO
  // string), so read them as instants rather than asserting on Date objects.
  function selectWhereQuery() {
    const where = mockSelectWhere.mock.calls[0]?.[0] as SQL;
    const { sql, params } = dialect.sqlToQuery(where);
    const [status, youngest, oldest] = params as [
      string,
      string | Date,
      string | Date,
    ];
    return {
      sql,
      status,
      youngestMs: new Date(youngest).getTime(),
      oldestMs: new Date(oldest).getTime(),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clearPaymentWebhookHandlers();
    // A 48 h-old row by default: proves no age ever turns into abandon here.
    mockLimit.mockResolvedValue([row()]);
    mockReturning.mockResolvedValue([{ id: 'tx-1' }]);
    mockValues.mockResolvedValue(undefined);
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  it('fulfils a provider-confirmed payment exactly once through the same CAS note as the daily sweep', async () => {
    const tx = row();
    mockLimit.mockResolvedValue([tx]);
    const fulfil = vi.fn(async () => {});
    const check = {
      status: 'successful' as const,
      providerData: { payment_status: 'paid' },
    };

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => check },
      { fulfil }
    );

    expect(result).toEqual({ ...emptyResult, fulfilled: 1 });
    expect(setCalls()[0]).toMatchObject({
      status: 'successful',
      rawResponse: {
        payment_status: 'paid',
        reconciliation: { outcome: 'recovered' },
      },
    });
    expect(fulfil).toHaveBeenCalledTimes(1);
    expect(fulfil).toHaveBeenCalledWith({ tx, check });
  });

  it.each(['pending', 'failed', 'unknown'] as const)(
    'does nothing on provider `%s` — no write, no fulfil, however old the row',
    async (status) => {
      mockLimit.mockResolvedValue([
        row({ createdAt: new Date(Date.now() - 30 * 24 * HOUR) }),
      ]);
      const fulfil = vi.fn(async () => {});

      const result = await reconcileRecentApprovals(
        fakeDb,
        saasPaymentTransactions,
        { stripe: async () => status },
        { fulfil }
      );

      expect(result).toEqual({ ...emptyResult, skipped: 1 });
      expect(mockSet).not.toHaveBeenCalled();
      expect(fulfil).not.toHaveBeenCalled();
    }
  );

  it("never abandons a row with no provider record (null lookup) — that is the daily sweep's call", async () => {
    mockLimit.mockResolvedValue([row({ providerTxId: null })]);
    const checker: ProviderChecker = {
      check: vi.fn(async () => 'successful' as const),
      findByMerchantReference: async () => null,
    };

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: checker },
      { fulfil: async () => {} }
    );

    expect(result).toEqual({ ...emptyResult, skipped: 1 });
    expect(checker.check).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('recovers via merchant reference when the lookup confirms payment', async () => {
    mockLimit.mockResolvedValue([row({ providerTxId: null })]);
    const fulfil = vi.fn(async () => {});
    const checker: ProviderChecker = {
      check: async () => 'unknown',
      findByMerchantReference: async (tx: ReconcilableTransaction) => ({
        status: 'successful' as const,
        providerTxId: `cs_for_${tx.id}`,
      }),
    };

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: checker },
      { fulfil }
    );

    expect(result).toEqual({ ...emptyResult, fulfilled: 1 });
    expect(setCalls()[0]).toMatchObject({
      status: 'successful',
      providerTxId: 'cs_for_tx-1',
    });
    expect(fulfil).toHaveBeenCalledTimes(1);
  });

  it('selects only PENDING rows between the min and max age (defaults 10 min .. 24 h)', async () => {
    const before = Date.now();
    await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { fulfil: async () => {} }
    );

    const { sql, status, youngestMs, oldestMs } = selectWhereQuery();
    expect(sql).toMatch(
      /"status" = \$1 and .*"created_at" < \$2 and .*"created_at" >= \$3/
    );
    expect(status).toBe('pending');
    expect(before - youngestMs).toBeGreaterThanOrEqual(10 * MINUTE);
    expect(before - youngestMs).toBeLessThan(10 * MINUTE + 5_000);
    expect(before - oldestMs).toBeGreaterThanOrEqual(24 * HOUR);
    expect(before - oldestMs).toBeLessThan(24 * HOUR + 5_000);
  });

  it('honours a custom age window', async () => {
    const before = Date.now();
    await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { minAgeMinutes: 5, maxAgeHours: 6, fulfil: async () => {} }
    );

    const { youngestMs, oldestMs } = selectWhereQuery();
    expect(before - youngestMs).toBeGreaterThanOrEqual(5 * MINUTE);
    expect(before - youngestMs).toBeLessThan(5 * MINUTE + 5_000);
    expect(before - oldestMs).toBeGreaterThanOrEqual(6 * HOUR);
    expect(before - oldestMs).toBeLessThan(6 * HOUR + 5_000);
  });

  it('caps the batch (default 200) and takes the oldest rows first', async () => {
    await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { fulfil: async () => {} }
    );
    expect(mockLimit).toHaveBeenCalledWith(200);
    const orderBy = mockOrderBy.mock.calls[0]?.[0] as SQL;
    expect(dialect.sqlToQuery(orderBy).sql).toMatch(/"created_at" asc/);

    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'pending' },
      { batchSize: 50, fulfil: async () => {} }
    );
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('writes through the same CAS guard (`status = pending`) as the daily sweep', async () => {
    await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      { fulfil: async () => {} }
    );

    const where = mockUpdateWhere.mock.calls[0]?.[0] as SQL;
    const { sql, params } = dialect.sqlToQuery(where);
    expect(sql).toMatch(/"id" = \$1 and .*"status" = \$2/);
    expect(params).toEqual(['tx-1', 'pending']);
  });

  it('a lost CAS (late webhook or the daily sweep got there first) is skipped, not fulfilled', async () => {
    mockReturning.mockResolvedValue([]);
    const fulfil = vi.fn(async () => {});

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      { fulfil }
    );

    expect(result).toEqual({ ...emptyResult, skipped: 1 });
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('claims `reconcile:<txId>` when fulfilling, so the daily sweep cannot dispatch the same row again', async () => {
    const dispatch = vi.fn(async () => {});

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      {
        fulfil: (recovered) =>
          fulfilRecoveredPayment(recovered, {
            db: fakeDb,
            eventsTable: saasSubscriptionEvents,
            dispatch,
          }),
      }
    );

    expect(result).toEqual({ ...emptyResult, fulfilled: 1 });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'stripe',
        providerEventId: reconciliationEventId('tx-1'),
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'reconcile:tx-1' })
    );
  });

  it('an already-claimed idempotency key means no second dispatch', async () => {
    mockValues.mockRejectedValue(
      Object.assign(new Error('dup'), { cause: { code: '23505' } })
    );
    const dispatch = vi.fn(async () => {});

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      {
        fulfil: (recovered) =>
          fulfilRecoveredPayment(recovered, {
            db: fakeDb,
            eventsTable: saasSubscriptionEvents,
            dispatch,
          }),
      }
    );

    expect(result).toEqual({ ...emptyResult, fulfilled: 1 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a throwing fulfil keeps the row SUCCESSFUL, records the breadcrumb, and is counted', async () => {
    const fulfil = vi.fn(async () => {
      throw new Error('token grant exploded');
    });

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      { stripe: async () => 'successful' },
      { fulfil }
    );

    expect(result).toEqual({ ...emptyResult, fulfilmentFailed: 1 });
    const [cas, note] = setCalls();
    expect(cas).toMatchObject({ status: 'successful' });
    expect(note).not.toHaveProperty('status');
    expect(note).toMatchObject({
      rawResponse: {
        reconciliation: {
          fulfilment: 'failed',
          error: expect.stringContaining('token grant exploded'),
        },
      },
    });
  });

  it('skips providers without a checker and survives a throwing check', async () => {
    mockLimit.mockResolvedValue([
      row({ id: 'tx-0', providerId: 'nowpayments', providerTxId: '42' }),
      row(),
      row({ id: 'tx-2', providerTxId: 'cs_2' }),
    ]);
    let call = 0;
    const fulfil = vi.fn(async () => {});

    const result = await reconcileRecentApprovals(
      fakeDb,
      saasPaymentTransactions,
      {
        stripe: async () => {
          if (call++ === 0) throw new Error('rate limited');
          return 'successful';
        },
      },
      { fulfil }
    );

    expect(result).toEqual({
      checked: 3,
      fulfilled: 1,
      fulfilmentFailed: 0,
      skipped: 2,
    });
    expect(fulfil).toHaveBeenCalledTimes(1);
  });
});

describe('buildRecoveredPaymentEvent', () => {
  beforeEach(() => clearPaymentWebhookHandlers());

  it('synthesises payment.completed for a registered one-time metadata.type', () => {
    registerPaymentWebhookHandler('token_pack', async () => {});
    const tx = row({
      planId: null,
      interval: null,
      rawRequest: { type: 'token_pack', packId: 'p1', orgId: 'org-1' },
    });

    const event = buildRecoveredPaymentEvent({
      tx,
      check: { status: 'successful', providerData: { payment_status: 'paid' } },
    });

    expect(event.type).toBe('payment.completed');
    expect(event.providerData).toMatchObject({
      payment_status: 'paid',
      metadata: { type: 'token_pack', packId: 'p1', orgId: 'org-1' },
      transactionId: 'tx-1',
      userId: 'user-1',
      amountCents: 4900,
      _eventId: 'reconcile:tx-1',
      _reconciled: true,
    });
  });

  it('synthesises subscription.activated for a plan row, merging checker-provided fields', () => {
    const event = buildRecoveredPaymentEvent({
      tx: row(),
      check: {
        status: 'successful',
        event: { providerCustomerId: 'np_org_org-1' },
      },
    });

    expect(event).toMatchObject({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'np_org_org-1',
    });
    // Period length drives the handler's interval inference when no price id is known.
    const days =
      (event.periodEnd!.getTime() - event.periodStart!.getTime()) / (24 * HOUR);
    expect(days).toBe(365);
    // Checkout metadata (discountUsageId etc.) rides along like the IPN merge does.
    expect(event.providerData).toMatchObject({ discountUsageId: 'du-1' });
  });
});

describe('fulfilRecoveredPayment', () => {
  const recovered = {
    tx: row(),
    check: {
      status: 'successful' as const,
      providerData: { payment_status: 'paid' },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearPaymentWebhookHandlers();
    mockValues.mockResolvedValue(undefined);
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  it('claims `reconcile:<txId>` (not a provider event id) and dispatches once under that key', async () => {
    const dispatch = vi.fn(async () => {});

    await fulfilRecoveredPayment(recovered, {
      db: fakeDb,
      eventsTable: saasSubscriptionEvents,
      dispatch,
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'stripe',
        providerEventId: reconciliationEventId('tx-1'),
        type: 'subscription.activated',
      })
    );
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'stripe',
        eventId: 'reconcile:tx-1',
        event: expect.objectContaining({ type: 'subscription.activated' }),
      })
    );
    expect(fakeDb.delete).not.toHaveBeenCalled();
  });

  it('does not dispatch when the claim already exists', async () => {
    mockValues.mockRejectedValue(
      Object.assign(new Error('dup'), { cause: { code: '23505' } })
    );
    const dispatch = vi.fn(async () => {});

    await fulfilRecoveredPayment(recovered, {
      db: fakeDb,
      eventsTable: saasSubscriptionEvents,
      dispatch,
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('releases the claim and rethrows when dispatch fails', async () => {
    const dispatch = vi.fn(async () => {
      throw new Error('handler down');
    });

    await expect(
      fulfilRecoveredPayment(recovered, {
        db: fakeDb,
        eventsTable: saasSubscriptionEvents,
        dispatch,
      })
    ).rejects.toThrow('handler down');

    expect(fakeDb.delete).toHaveBeenCalledTimes(1);
    const where = mockDeleteWhere.mock.calls[0]?.[0] as SQL;
    const { params } = dialect.sqlToQuery(where);
    expect(params).toEqual(['stripe', 'reconcile:tx-1']);
  });
});
