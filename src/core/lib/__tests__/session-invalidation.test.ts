import {
  invalidateUserSessions,
  isSessionInvalidated,
} from '../auth/session-invalidation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above module-level consts, so the doubles they
// close over must be hoisted too.
const { warn, publish, redis } = vi.hoisted(() => {
  const publish = vi.fn();
  return {
    warn: vi.fn(),
    publish,
    redis: { publisher: { publish } as { publish: typeof publish } | null },
  };
});
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn, debug: vi.fn() }),
}));
vi.mock('@/core/lib/infra/redis', () => ({
  getPublisher: () => redis.publisher,
  getSubscriber: () => null,
}));

const USER = '11111111-1111-4111-8111-111111111111';

describe('invalidateUserSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redis.publisher = { publish };
    publish.mockResolvedValue(1);
  });

  it('voids the user locally before the broadcast settles', () => {
    const before = new Date(Date.now() - 1000);
    const pending = invalidateUserSessions(USER);
    // Synchronous effect: the next request on this instance is already rejected.
    expect(isSessionInvalidated(USER, before)).toBe(true);
    expect(pending).toBeInstanceOf(Promise);
  });

  it('resolves only after the Redis publish has been awaited', async () => {
    let resolvePublish: (() => void) | undefined;
    publish.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePublish = resolve;
      })
    );
    let settled = false;
    const pending = invalidateUserSessions(USER).then(() => {
      settled = true;
    });
    await vi.waitFor(() =>
      expect(publish).toHaveBeenCalledWith(
        'auth:session-invalidate',
        expect.stringContaining(USER)
      )
    );
    expect(settled).toBe(false);
    resolvePublish?.();
    await pending;
    expect(settled).toBe(true);
  });

  it('resolves without publishing when Redis is not configured', async () => {
    redis.publisher = null;
    await expect(invalidateUserSessions(USER)).resolves.toBeUndefined();
    expect(publish).not.toHaveBeenCalled();
  });

  it('never rejects when the publish fails — logs and resolves', async () => {
    publish.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(invalidateUserSessions(USER)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Failed to broadcast session invalidation',
      expect.objectContaining({
        userId: USER,
        error: expect.stringContaining('ECONNREFUSED'),
      })
    );
    // The local map is still updated — a broken Redis must not weaken a ban.
    expect(isSessionInvalidated(USER, new Date(Date.now() - 1000))).toBe(true);
  });

  it('leaves sessions created after the invalidation valid', async () => {
    await invalidateUserSessions(USER);
    expect(isSessionInvalidated(USER, new Date(Date.now() + 1000))).toBe(false);
    expect(isSessionInvalidated(USER, null)).toBe(true);
  });
});
