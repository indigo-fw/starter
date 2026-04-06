import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';

import { user, session, cmsUserPreferences } from '@/server/db/schema';
import { ROLES, Role, isSuperAdmin } from '@/core/policy';
import { parsePagination, paginatedResult, fetchOrNotFound } from '@/core/crud/admin-crud';
import { anonymizeUser } from '@/core/lib/gdpr';
import { logAudit } from '@/core/lib/audit';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '../trpc';

const usersProcedure = sectionProcedure('users');

export const usersRouter = createTRPCRouter({
  /** List users with search + pagination */
  list: usersProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        role: z.string().max(20).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.search) {
        conditions.push(
          or(
            ilike(user.name, `%${input.search}%`),
            ilike(user.email, `%${input.search}%`)
          )
        );
      }
      if (input.role) {
        conditions.push(eq(user.role, input.role));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            banned: user.banned,
            banReason: user.banReason,
            createdAt: user.createdAt,
            image: user.image,
          })
          .from(user)
          .where(where)
          .orderBy(desc(user.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(user)
          .where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get single user */
  get: usersProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return fetchOrNotFound<typeof user.$inferSelect>(ctx.db, user, input.id, 'User');
    }),

  /** Update user role */
  updateRole: usersProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.enum(ROLES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actorRole = ctx.session.user.role as string;

      // Only superadmin can promote to/demote from superadmin
      const [target] = await ctx.db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      if (
        (target.role === Role.SUPERADMIN || input.role === Role.SUPERADMIN) &&
        !isSuperAdmin(actorRole)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only superadmin can promote to or demote from superadmin',
        });
      }

      await ctx.db
        .update(user)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(user.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'user.updateRole',
        entityType: 'user',
        entityId: input.id,
        metadata: { from: target.role, to: input.role },
      });

      return { success: true };
    }),

  /** Ban a user */
  ban: usersProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      if (isSuperAdmin(target.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot ban a superadmin',
        });
      }

      await ctx.db
        .update(user)
        .set({
          banned: true,
          banReason: input.reason ?? null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'user.ban',
        entityType: 'user',
        entityId: input.id,
        metadata: { reason: input.reason },
      });

      return { success: true };
    }),

  /** Unban a user */
  unban: usersProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({
          banned: false,
          banReason: null,
          banExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'user.unban',
        entityType: 'user',
        entityId: input.id,
      });

      return { success: true };
    }),

  /** GDPR: anonymize a user (delete PII, ban account) */
  gdprAnonymize: usersProcedure
    .input(
      z.object({
        id: z.string(),
        mode: z.enum(['full', 'pseudonymize']).default('full'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await anonymizeUser(ctx.db, input.id, ctx.session.user.id, input.mode);
        return { success: true };
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Anonymization failed',
        });
      }
    }),

  /** Update user profile fields */
  update: usersProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().max(100).optional(),
        email: z.string().email().max(255).optional(),
        role: z.enum(ROLES).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, input.id))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Role change RBAC — same as updateRole
      if (input.role && input.role !== target.role) {
        const actorRole = ctx.session.user.role as string;
        if (
          (target.role === Role.SUPERADMIN || input.role === Role.SUPERADMIN) &&
          !isSuperAdmin(actorRole)
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only superadmin can promote to or demote from superadmin',
          });
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.email !== undefined) updates.email = input.email;
      if (input.role !== undefined) updates.role = input.role;

      await ctx.db
        .update(user)
        .set(updates)
        .where(eq(user.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'user.update',
        entityType: 'user',
        entityId: input.id,
        metadata: { fields: Object.keys(updates).filter((k) => k !== 'updatedAt') },
      });

      return { success: true };
    }),

  /** Login history (sessions) for a user */
  loginHistory: usersProcedure
    .input(
      z.object({
        userId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: session.id,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
          })
          .from(session)
          .where(eq(session.userId, input.userId))
          .orderBy(desc(session.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(session)
          .where(eq(session.userId, input.userId)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Count users by role */
  counts: usersProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        role: user.role,
        count: count(),
      })
      .from(user)
      .groupBy(user.role);

    const result: Record<string, number> = { all: 0 };
    for (const row of rows) {
      result[row.role] = row.count;
      result.all += row.count;
    }
    return result;
  }),

  // ─── User Preferences ──────────────────────────────────────────────────────
  // Every authenticated user can read/write their own preferences (not section-gated).

  /** Get current user's preferences */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [row] = await ctx.db
      .select({ data: cmsUserPreferences.data })
      .from(cmsUserPreferences)
      .where(eq(cmsUserPreferences.userId, userId))
      .limit(1);

    return (row?.data ?? {}) as Record<string, unknown>;
  }),

  /** Set a single preference key */
  setPreference: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(200),
        value: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Read existing, merge, upsert
      const [existing] = await ctx.db
        .select({ data: cmsUserPreferences.data })
        .from(cmsUserPreferences)
        .where(eq(cmsUserPreferences.userId, userId))
        .limit(1);

      const merged = {
        ...((existing?.data as Record<string, unknown>) ?? {}),
        [input.key]: input.value,
      };

      await ctx.db
        .insert(cmsUserPreferences)
        .values({ userId, data: merged, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: cmsUserPreferences.userId,
          set: { data: merged, updatedAt: new Date() },
        });

      return { success: true };
    }),

  /** Batch update multiple preference keys */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        preferences: z.record(z.string().max(200), z.unknown()).refine(
          (obj) => Object.keys(obj).length <= 30,
          { message: 'Max 30 keys per batch' }
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [existing] = await ctx.db
        .select({ data: cmsUserPreferences.data })
        .from(cmsUserPreferences)
        .where(eq(cmsUserPreferences.userId, userId))
        .limit(1);

      const merged = {
        ...((existing?.data as Record<string, unknown>) ?? {}),
        ...input.preferences,
      };

      await ctx.db
        .insert(cmsUserPreferences)
        .values({ userId, data: merged, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: cmsUserPreferences.userId,
          set: { data: merged, updatedAt: new Date() },
        });

      return { success: true };
    }),
});
