import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import { auth } from '@/lib/auth';
import { type AdminSection, Policy, Role, type UserRole } from '@/core/policy';
import { db } from '@/server/db';
import { applyRateLimit } from '@/core/lib/trpc-rate-limit';
import { isEmailVerificationRequired } from '@/lib/email-verification';

/**
 * Context for tRPC procedures — session + Drizzle DB + headers
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });

  return {
    session,
    db,
    headers: opts.headers,
    activeOrganizationId: (session as Record<string, unknown> | null)?.activeOrganizationId as string | null ?? null,
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

const t = initTRPC.context<Context>().create({
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

/** Rate limit middleware for public (unauthenticated) procedures */
const publicRateLimit = t.middleware(async ({ ctx, next }) => {
  await applyRateLimit('public', ctx);
  return next();
});

/** Auth middleware — verifies session, checks for ban, narrows user type */
const authMiddleware = t.middleware(({ ctx, next }) => {
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

  if (sessionUser.banned) {
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

/** Public (unauthenticated) procedure — rate-limited */
export const publicProcedure = t.procedure.use(publicRateLimit);

/** Protected (authenticated) procedure — auth check + rate-limited */
export const protectedProcedure = t.procedure
  .use(authMiddleware)
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
