import {
  appealProcedure,
  createTRPCRouter,
  logTrpcError,
  protectedProcedure,
  publicProcedure,
} from '../../trpc';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { markLogged } from '@/core/lib/infra/logger';

// ---------------------------------------------------------------------------
// Mocks (hoisted so the logger factory can hand back one shared instance)
// ---------------------------------------------------------------------------

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/core/lib/infra/logger', () => {
  const LOGGED = Symbol.for('indigo.error.logged');
  return {
    createLogger: () => mockLogger,
    markLogged: <T>(err: T) => {
      if (err && typeof err === 'object')
        (err as Record<symbol, unknown>)[LOGGED] = true;
      return err;
    },
    wasLogged: (err: unknown) =>
      Boolean(
        err &&
        typeof err === 'object' &&
        (err as Record<symbol, unknown>)[LOGGED]
      ),
  };
});

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/core/lib/auth/session-invalidation', () => ({
  isSessionInvalidated: vi.fn().mockReturnValue(false),
}));
vi.mock('@/core/lib/module/module-hooks', () => ({
  runAuthMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/email-verification', () => ({
  isEmailVerificationRequired: vi.fn().mockReturnValue(false),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const router = createTRPCRouter({
  boom: publicProcedure.query(() => {
    throw new Error('db exploded');
  }),
  missing: publicProcedure.query(() => {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'nope' });
  }),
  preLogged: publicProcedure.query(() => {
    throw markLogged(
      new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'seen' })
    );
  }),
  fine: publicProcedure.query(() => 'ok'),
  guarded: protectedProcedure.query(({ ctx }) => ctx.session.user.id),
  appeal: appealProcedure.query(({ ctx }) => ctx.session.user.id),
});

function ctx(session: unknown = null) {
  return {
    session,
    db: {},
    headers: new Headers(),
    activeOrganizationId: null,
  } as never;
}

const bannedSession = {
  user: {
    id: 'u-banned',
    email: 'b@test.com',
    role: 'user',
    banned: true,
    emailVerified: true,
    createdAt: new Date().toISOString(),
  },
};

describe('tRPC logging middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs unexpected errors at error level with cause details', async () => {
    const caller = router.createCaller(ctx());
    await expect(caller.boom()).rejects.toThrow('db exploded');

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    const [msg, data] = mockLogger.error.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(msg).toContain('boom');
    expect(data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'db exploded',
      causeMessage: 'db exploded',
    });
    expect(typeof data.causeStack).toBe('string');
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('logs expected client-fault codes at debug only', async () => {
    const caller = router.createCaller(ctx());
    await expect(caller.missing()).rejects.toThrow('nope');

    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    expect(String(mockLogger.debug.mock.calls[0]?.[0])).toContain('NOT_FOUND');
  });

  it('stays quiet for errors an inner handler already logged', async () => {
    const caller = router.createCaller(ctx());
    await expect(caller.preLogged()).rejects.toThrow('seen');

    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });

  it('does not log successful calls at error level', async () => {
    const caller = router.createCaller(ctx());
    await expect(caller.fine()).resolves.toBe('ok');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('also covers middleware failures (UNAUTHORIZED from the auth gate)', async () => {
    const caller = router.createCaller(ctx());
    await expect(caller.guarded()).rejects.toThrow('You must be logged in');
    expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logTrpcError marks the error so a second sighting is silent', () => {
    const err = new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'once',
    });
    logTrpcError(err, { path: undefined, type: 'unknown' });
    logTrpcError(err, { path: undefined, type: 'unknown' });
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(String(mockLogger.error.mock.calls[0]?.[0])).toContain('<no-path>');
  });
});

describe('appealProcedure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects banned users on protectedProcedure', async () => {
    const caller = router.createCaller(ctx(bannedSession));
    await expect(caller.guarded()).rejects.toThrow(
      'Your account has been suspended'
    );
  });

  it('lets banned users through on appealProcedure', async () => {
    const caller = router.createCaller(ctx(bannedSession));
    await expect(caller.appeal()).resolves.toBe('u-banned');
  });

  it('still requires a session', async () => {
    const caller = router.createCaller(ctx());
    await expect(caller.appeal()).rejects.toThrow('You must be logged in');
  });
});
