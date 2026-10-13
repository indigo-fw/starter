import {
  RECONCILE_APPROVALS_CRON,
  RECONCILE_APPROVALS_WINDOW,
  runRecentApprovalsReconciliation,
} from '../jobs/reconcile-approvals';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fulfilRecoveredPayment,
  reconcileRecentApprovals,
} from '@/core-payments/lib/reconciliation-service';
import { getConfiguredProviderChecks } from '@/core-payments/lib/transaction-service';
import { getNextCronRun } from '@/core/lib/infra/cron';
import { asMock } from '@/test-utils';

const { mockLog } = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/core/lib/infra/logger', () => ({ createLogger: () => mockLog }));
vi.mock('@/server/db', () => ({ db: { tag: 'db' } }));
vi.mock('@/core-payments/schema/payments', () => ({
  saasPaymentTransactions: { tag: 'transactions' },
  saasSubscriptionEvents: { tag: 'events' },
}));
vi.mock('@/core-payments/lib/transaction-service', () => ({
  getConfiguredProviderChecks: vi.fn(() => ({})),
}));
vi.mock('@/core-payments/lib/reconciliation-service', () => ({
  reconcileRecentApprovals: vi.fn(),
  fulfilRecoveredPayment: vi.fn(async () => {}),
}));

const okResult = { checked: 0, fulfilled: 0, fulfilmentFailed: 0, skipped: 0 };

describe('reconcile-approvals cron job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getConfiguredProviderChecks).mockReturnValue({});
    asMock(reconcileRecentApprovals).mockResolvedValue(okResult);
  });

  it('runs every 30 minutes under its own queue name, with a pattern the DB-queue fallback understands', () => {
    expect(RECONCILE_APPROVALS_CRON).toEqual({
      name: 'payments-reconcile-approvals',
      pattern: '*/30 * * * *',
    });
    const next = getNextCronRun(RECONCILE_APPROVALS_CRON.pattern).getTime();
    const ahead = next - Date.now();
    expect(ahead).toBeGreaterThan(29 * 60 * 1000);
    expect(ahead).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('does not sweep when no provider has credentials', async () => {
    await runRecentApprovalsReconciliation();

    expect(reconcileRecentApprovals).not.toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it('sweeps with every configured checker, the 10 min .. 24 h window, a 200-row cap, and the shared fulfilment', async () => {
    const stripe = async () => 'successful' as const;
    asMock(getConfiguredProviderChecks).mockReturnValue({ stripe });
    asMock(reconcileRecentApprovals).mockResolvedValue({
      ...okResult,
      checked: 3,
      fulfilled: 1,
      skipped: 2,
    });

    await runRecentApprovalsReconciliation();

    expect(RECONCILE_APPROVALS_WINDOW).toEqual({
      minAgeMinutes: 10,
      maxAgeHours: 24,
      batchSize: 200,
    });
    expect(reconcileRecentApprovals).toHaveBeenCalledTimes(1);
    const [db, table, checks, options] = asMock(reconcileRecentApprovals).mock
      .calls[0]!;
    expect(db).toEqual({ tag: 'db' });
    expect(table).toEqual({ tag: 'transactions' });
    expect(checks).toEqual({ stripe });
    expect(options).toMatchObject(RECONCILE_APPROVALS_WINDOW);

    // The fulfil step is the real one — same idempotency claim as the daily sweep.
    const recovered = {
      tx: { id: 'tx-1' },
      check: { status: 'successful' as const },
    } as unknown as Parameters<typeof fulfilRecoveredPayment>[0];
    await options.fulfil(recovered);
    expect(fulfilRecoveredPayment).toHaveBeenCalledWith(recovered, {
      db: { tag: 'db' },
      eventsTable: { tag: 'events' },
    });

    expect(mockLog.info).toHaveBeenCalledWith(
      'Approvals reconciliation results',
      expect.objectContaining({ checked: 3, fulfilled: 1, skipped: 2 })
    );
    expect(mockLog.error).not.toHaveBeenCalled();
  });

  it('escalates to error when a recovered payment could not be fulfilled', async () => {
    asMock(getConfiguredProviderChecks).mockReturnValue({
      stripe: async () => 'successful' as const,
    });
    asMock(reconcileRecentApprovals).mockResolvedValue({
      ...okResult,
      checked: 1,
      fulfilmentFailed: 1,
    });

    await runRecentApprovalsReconciliation();

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('could not fulfil'),
      expect.objectContaining({ fulfilmentFailed: 1 })
    );
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it('stays quiet when there was nothing to check', async () => {
    asMock(getConfiguredProviderChecks).mockReturnValue({
      stripe: async () => 'pending' as const,
    });

    await runRecentApprovalsReconciliation();

    expect(reconcileRecentApprovals).toHaveBeenCalledTimes(1);
    expect(mockLog.info).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
  });
});
