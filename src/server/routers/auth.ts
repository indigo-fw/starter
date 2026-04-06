import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, ne } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { auth } from '@/lib/auth';
import { user, session } from '@/server/db/schema/auth';
import { logAudit } from '@/core/lib/audit';
import { detectGeo } from '@/core/lib/geo';
import { extractRequestContext } from '@/core/lib/request-context';
import { createLogger } from '@/core/lib/logger';
import { runHook } from '@/core/lib/module-hooks';

const geoLog = createLogger('geo-sync');

export const authRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  me: protectedProcedure.query(({ ctx }) => {
    return ctx.session.user;
  }),

  /**
   * Sync geo data (country, state, timezone, currency, IP) to the user record.
   * Called once per session from the client. Updates only if IP changed or fields are empty.
   */
  syncGeo: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const reqCtx = extractRequestContext(ctx.headers);

    // Skip if no real IP
    if (reqCtx.ip === '0.0.0.0') {
      return { synced: false };
    }

    // Check if IP changed or geo fields are missing
    const [existing] = await ctx.db
      .select({
        lastIp: user.lastIp,
        country: user.country,
        state: user.state,
        timezone: user.timezone,
        preferredCurrency: user.preferredCurrency,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!existing) return { synced: false };

    const ipChanged = existing.lastIp !== reqCtx.ip;
    const missingGeo = !existing.country || !existing.timezone;

    if (!ipChanged && !missingGeo) {
      return { synced: false };
    }

    try {
      const geo = await detectGeo(ctx.headers, reqCtx.ip);

      const updates: Record<string, unknown> = {
        lastIp: reqCtx.ip,
        updatedAt: new Date(),
      };

      // Always update if IP changed; fill missing fields if first time
      if (geo.country && (ipChanged || !existing.country)) {
        updates.country = geo.country;
      }
      if (geo.state && (ipChanged || !existing.state)) {
        updates.state = geo.state;
      }
      if (geo.timezone && (ipChanged || !existing.timezone)) {
        updates.timezone = geo.timezone;
      }
      if (geo.currency && (ipChanged || !existing.preferredCurrency)) {
        updates.preferredCurrency = geo.currency;
      }

      await ctx.db.update(user).set(updates).where(eq(user.id, userId));

      geoLog.info('Geo synced', { userId, ip: reqCtx.ip, country: geo.country });
      return { synced: true };
    } catch (err: unknown) {
      geoLog.warn('Geo sync failed', { userId, error: String(err) });
      return { synced: false };
    }
  }),


  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(6).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.changePassword({
          headers: ctx.headers,
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
        });
        return { success: true };
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Current password is incorrect',
        });
      }
    }),

  deleteAccount: protectedProcedure
    .input(
      z
        .object({ mode: z.enum(['full', 'pseudonymize']).default('full') })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const mode = input?.mode ?? 'full';
      const { anonymizeUser } = await import('@/core/lib/gdpr');

      try {
        await anonymizeUser(ctx.db, userId, userId, mode);
      } catch (err) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: err instanceof Error ? err.message : 'Account deletion failed',
        });
      }

      logAudit({
        db: ctx.db,
        userId,
        action: 'auth.deleteAccount',
        entityType: 'user',
        entityId: userId,
        metadata: { mode },
      });

      return { success: true };
    }),

  activeSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db
      .select({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
      })
      .from(session)
      .where(eq(session.userId, ctx.session.user.id))
      .limit(50);

    return sessions;
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      // Only allow revoking own sessions
      const [target] = await ctx.db
        .select({ userId: session.userId })
        .from(session)
        .where(eq(session.id, input.sessionId))
        .limit(1);

      if (!target || target.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      await ctx.db.delete(session).where(eq(session.id, input.sessionId));
      return { success: true };
    }),

  /** Capture marketing attribution after registration (ref code, UTM params, referrer, etc.)
   *  Uses module hooks — no-ops if core-affiliates is not installed. */
  captureAttribution: protectedProcedure
    .input(z.object({
      refCode: z.string().max(255).optional(),
      utmSource: z.string().max(255).optional(),
      utmMedium: z.string().max(255).optional(),
      utmCampaign: z.string().max(500).optional(),
      extra: z.record(z.string(), z.string().max(2000)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await runHook('attribution.capture', ctx.session.user.id, input);
      return { success: true };
    }),

  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    // Get current session token to exclude it
    const currentSessionToken = ctx.headers.get('cookie')?.match(/better-auth\.session_token=([^;]+)/)?.[1];

    if (currentSessionToken) {
      // Delete all sessions except the current one
      const [currentSession] = await ctx.db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.userId, ctx.session.user.id),
            eq(session.token, decodeURIComponent(currentSessionToken))
          )
        )
        .limit(1);

      if (currentSession) {
        await ctx.db
          .delete(session)
          .where(
            and(
              eq(session.userId, ctx.session.user.id),
              ne(session.id, currentSession.id)
            )
          );
        return { success: true };
      }
    }

    // Fallback: if we can't identify the current session, just delete all
    await ctx.db.delete(session).where(eq(session.userId, ctx.session.user.id));
    return { success: true };
  }),
});
