import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { applyRateLimit } from '@/core/lib/api/trpc-rate-limit';
import { isSessionInvalidated } from '@/core/lib/auth/session-invalidation';
import { createLogger } from '@/core/lib/infra/logger';
import type { IndigoTrpcMeta } from '@/core/lib/mcp/types';
import { runAuthMiddleware } from '@/core/lib/module/module-hooks';
import { type AdminSection, Policy, Role, type UserRole } from '@/core/policy';
import { auth } from '@/lib/auth';
import { isEmailVerificationRequired } from '@/lib/email-verification';
import { db } from '@/server/db';

const logger = createLogger('tRPC');

/**
 * The "already logged" mark shared with `markLogged`/`wasLogged` in logger.ts.
 * It is a process-global protocol by design (`Symbol.for`), so it is read here
 * by key rather than through the helpers: this module sits under every router,
 * and most router test suites stub the logger module down to `createLogger()`.
 */
const LOGGED = Symbol.for('indigo.error.logged');

function hasLoggedMark(err: object): boolean {
  return Boolean((err as Record<symbol, unknown>)[LOGGED]);
}

function setLoggedMark(err: object): void {
  (err as Record<symbol, unknown>)[LOGGED] = true;
}

/**
 * Context for tRPC procedures — session + Drizzle DB + headers
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  let session = await auth.api.getSession({
    headers: opts.headers,
  });

  // Better Auth's cookieCache serves the session from a signed cookie for up
  // to 5 min without a DB hit, so a ban or account erasure would otherwise
  // keep working for that window. Treat voided sessions as logged out.
  if (session?.user?.id) {
    const createdAt = (
      session.session as { createdAt?: Date | string } | undefined
    )?.createdAt;
    if (isSessionInvalidated(session.user.id, createdAt)) session = null;
  }

  return {
    session,
    db,
    headers: opts.headers,
    // `auth.api.getSession()` returns the customSession shape (see src/lib/auth.ts),
    // where activeOrganizationId is nested under `session.session`, not the top level.
    activeOrganizationId:
      (session?.session as { activeOrganizationId?: string | null } | undefined)
        ?.activeOrganizationId ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

type SessionUser = {
  id: string;
  email?: string;
  role?: UserRole;
  banned?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
};

const t = initTRPC
  .context<Context>()
  .meta<IndigoTrpcMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });

export const createTRPCRouter = t.router;
export const mergeRouters = t.mergeRouters;
export const createCallerFactory = t.createCallerFactory;

/**
 * Client-fault outcomes: the auth, ownership and validation checks doing their
 * job. They are the expected answer to a bad request, not an incident, so they
 * log at debug and stay out of the production error stream (LOG_LEVEL=warn).
 */
const EXPECTED_ERROR_CODES: ReadonlySet<string> = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'BAD_REQUEST',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'PRECONDITION_FAILED',
]);

/**
 * Log a failed procedure call once, at the right level. Shared by the logging
 * middleware (every procedure) and the route handler's `onError` (failures
 * that never reach a procedure: context creation, unknown paths). Marks the
 * error so whichever of the two sees it second stays quiet.
 */
export function logTrpcError(
  error: TRPCError,
  info: { path: string | undefined; type: string; durationMs?: number }
): void {
  if (hasLoggedMark(error)) return;
  setLoggedMark(error);

  const path = info.path ?? '<no-path>';
  const { code } = error;
  if (EXPECTED_ERROR_CODES.has(code)) {
    logger.debug(`${info.type} ${path} -> ${code}`, {
      duration: info.durationMs,
    });
    return;
  }

  // `message`/`stack` are non-enumerable, so spreading the error serializes
  // to `{"cause":{}}` and erases the reason. Pull them out by hand.
  const { cause } = error;
  logger.error(`Error: ${info.type} ${path}`, {
    duration: info.durationMs,
    code,
    message: error.message,
    ...(cause instanceof Error
      ? { causeMessage: cause.message, causeStack: cause.stack }
      : {}),
    stack: error.stack,
  });
}

/**
 * Logging middleware for all procedures. Before this, production had no
 * record of failed procedures at all — the route handler only logged in dev.
 */
const loggingMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  if (!result.ok) {
    logTrpcError(result.error, { path, type, durationMs: Date.now() - start });
  }
  return result;
});

/** Base for every procedure type — logging first so it sees all middleware errors too. */
const baseProcedure = t.procedure.use(loggingMiddleware);

/** Rate limit middleware for public (unauthenticated) procedures */
const publicRateLimit = t.middleware(async ({ ctx, next }) => {
  await applyRateLimit('public', ctx);
  return next();
});

/**
 * Auth middleware — verifies session, checks for ban, narrows user type.
 * `allowBanned` lifts ONLY the ban gate (see `appealProcedure`).
 */
const createAuthMiddleware = (opts: { allowBanned: boolean }) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in',
      });
    }

    const sessionUser = ctx.session.user as unknown as SessionUser;

    if (!sessionUser.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid session',
      });
    }

    if (sessionUser.banned && !opts.allowBanned) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Your account has been suspended',
      });
    }

    // Skip verification check for staff/admin — they're promoted manually
    const isStaff = Policy.for(sessionUser.role).canAccessAdmin();
    if (
      !isStaff &&
      isEmailVerificationRequired({
        emailVerified: sessionUser.emailVerified ?? false,
        createdAt: sessionUser.createdAt ?? new Date().toISOString(),
      })
    ) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Email verification required',
      });
    }

    // Run registered auth middleware hooks (2FA, IP whitelist, etc.)
    await runAuthMiddleware({ session: { user: sessionUser } });

    return next({
      ctx: {
        ...ctx,
        session: {
          ...ctx.session,
          user: sessionUser,
        },
      },
    });
  });

const authMiddleware = createAuthMiddleware({ allowBanned: false });

/** Public (unauthenticated) procedure — rate-limited */
export const publicProcedure = baseProcedure.use(publicRateLimit);

/** Protected (authenticated) procedure — auth check + rate-limited */
export const protectedProcedure = baseProcedure
  .use(authMiddleware)
  .use(async ({ ctx, next }) => {
    await applyRateLimit('authenticated', ctx);
    return next();
  });

/**
 * Authenticated, but allowed through while BANNED.
 *
 * Every other authenticated procedure rejects a banned user, which also closed
 * GDPR erasure (`auth.deleteAccount`) to exactly the people a ban applies to —
 * Art. 17 does not stop at a ban. Everything else in the auth middleware
 * (email verification, registered auth hooks, rate limit) still runs.
 *
 * USE THIS ONLY where a banned user has a legitimate right to act on their own
 * account. Not for anything that produces content or starts conversations.
 * Handlers must still scope every query by `ctx.session.user.id` as usual —
 * this lifts the ban gate, nothing else.
 */
export const appealProcedure = baseProcedure
  .use(createAuthMiddleware({ allowBanned: true }))
  .use(async ({ ctx, next }) => {
    await applyRateLimit('authenticated', ctx);
    return next();
  });

/** Staff — requires any admin panel access */
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { user } = ctx.session;
  if (!Policy.for(user.role).canAccessAdmin()) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Staff access required',
    });
  }
  return next({ ctx });
});

/** Section procedure factory — checks Policy.for(role).can(`section.${section}`) */
export function sectionProcedure(section: AdminSection) {
  return staffProcedure.use(({ ctx, next }) => {
    const { user } = ctx.session;
    if (!Policy.for(user.role).can(`section.${section}`)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `No access to ${section} section`,
      });
    }
    return next({ ctx });
  });
}

/** Superadmin — requires role = superadmin */
export const superadminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { user } = ctx.session;
  if (user.role !== Role.SUPERADMIN) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Superadmin access required',
    });
  }
  return next({ ctx });
});
