import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/db', () => ({
  db: {},
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/webhooks/webhooks', () => ({
  dispatchWebhook: vi.fn(),
}));

vi.mock('@/core/lib/infra/queue', () => ({
  createQueue: vi.fn().mockReturnValue(null),
  createWorker: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let registerScheduledPublishTarget: typeof import('../content/scheduled-publish').registerScheduledPublishTarget;
let processScheduledContent: typeof import('../content/scheduled-publish').processScheduledContent;
let logAudit: ReturnType<typeof vi.fn>;
let dispatchWebhook: ReturnType<typeof vi.fn>;

describe('scheduled publish registry', () => {
  beforeEach(async () => {
    vi.resetModules();

    // Re-mock after reset
    vi.doMock('@/server/db', () => ({ db: {} }));
    vi.doMock('@/core/lib/infra/audit', () => ({ logAudit: vi.fn() }));
    vi.doMock('@/core/lib/webhooks/webhooks', () => ({ dispatchWebhook: vi.fn() }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn().mockReturnValue(null),
      createWorker: vi.fn().mockReturnValue(null),
    }));
    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: vi.fn().mockReturnValue({
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
      }),
    }));

    const mod = await import('../content/scheduled-publish');
    registerScheduledPublishTarget = mod.registerScheduledPublishTarget;
    processScheduledContent = mod.processScheduledContent;

    const audit = await import('@/core/lib/infra/audit');
    logAudit = audit.logAudit as ReturnType<typeof vi.fn>;

    const webhooks = await import('@/core/lib/webhooks/webhooks');
    dispatchWebhook = webhooks.dispatchWebhook as ReturnType<typeof vi.fn>;
  });

  it('publishes scheduled entries and logs audit', async () => {
    const publishFn = vi.fn();

    registerScheduledPublishTarget({
      name: 'posts',
      entityType: 'post',
      webhookEventPrefix: 'post',
      findScheduled: async () => [
        { id: '1', title: 'Draft Post' },
      ],
      publish: publishFn,
    });

    await processScheduledContent();

    expect(publishFn).toHaveBeenCalledWith('1');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'publish',
        entityType: 'post',
        entityId: '1',
        entityTitle: 'Draft Post',
        userId: 'system',
      }),
    );
    expect(dispatchWebhook).toHaveBeenCalledWith(
      expect.anything(),
      'post.published',
      expect.objectContaining({ id: '1', title: 'Draft Post' }),
    );
  });

  it('handles no scheduled entries gracefully', async () => {
    registerScheduledPublishTarget({
      name: 'empty',
      entityType: 'thing',
      webhookEventPrefix: 'thing',
      findScheduled: async () => [],
      publish: vi.fn(),
    });

    await expect(processScheduledContent()).resolves.not.toThrow();
  });

  it('processes multiple targets', async () => {
    const publishA = vi.fn();
    const publishB = vi.fn();

    registerScheduledPublishTarget({
      name: 'a',
      entityType: 'a',
      webhookEventPrefix: 'a',
      findScheduled: async () => [{ id: 'a1', title: 'A1' }],
      publish: publishA,
    });

    registerScheduledPublishTarget({
      name: 'b',
      entityType: 'b',
      webhookEventPrefix: 'b',
      findScheduled: async () => [{ id: 'b1', title: 'B1' }],
      publish: publishB,
    });

    await processScheduledContent();

    expect(publishA).toHaveBeenCalledWith('a1');
    expect(publishB).toHaveBeenCalledWith('b1');
  });
});
