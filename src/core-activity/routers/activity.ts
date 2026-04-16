import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { activityEvents } from '../schema/activity';
import { user } from '@/server/db/schema/auth';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { getActivityDeps } from '../deps';

const dashboardProcedure = sectionProcedure('dashboard');

export const activityRouter = createTRPCRouter({
  // ─── Public ────────────────────────────────────────────────────────────────

  /** Public activity feed — only isPublic=true events, cursor-paginated */
  publicFeed: publicProcedure
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      const conditions = [eq(activityEvents.isPublic, true)];

      // Cursor-based pagination: fetch createdAt of cursor event
      if (cursor) {
        const [cursorEvent] = await ctx.db
          .select({ createdAt: activityEvents.createdAt })
          .from(activityEvents)
          .where(eq(activityEvents.id, cursor))
          .limit(1);

        if (cursorEvent) {
          conditions.push(lt(activityEvents.createdAt, cursorEvent.createdAt));
        }
      }

      const items = await ctx.db
        .select({
          id: activityEvents.id,
          actorId: activityEvents.actorId,
          actorType: activityEvents.actorType,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          targetLabel: activityEvents.targetLabel,
          metadata: activityEvents.metadata,
          organizationId: activityEvents.organizationId,
          isPublic: activityEvents.isPublic,
          createdAt: activityEvents.createdAt,
          actorName: user.name,
          actorImage: user.image,
        })
        .from(activityEvents)
        .leftJoin(user, eq(activityEvents.actorId, user.id))
        .where(and(...conditions))
        .orderBy(desc(activityEvents.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const results = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { items: results, nextCursor };
    }),

  // ─── Protected (logged-in user) ────────────────────────────────────────────

  /** Current user's activity feed */
  myFeed: protectedProcedure
    .input(
      z.object({
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;
      const userId = ctx.session.user.id;

      const conditions = [eq(activityEvents.actorId, userId)];

      if (cursor) {
        const [cursorEvent] = await ctx.db
          .select({ createdAt: activityEvents.createdAt })
          .from(activityEvents)
          .where(eq(activityEvents.id, cursor))
          .limit(1);

        if (cursorEvent) {
          conditions.push(lt(activityEvents.createdAt, cursorEvent.createdAt));
        }
      }

      const items = await ctx.db
        .select({
          id: activityEvents.id,
          actorId: activityEvents.actorId,
          actorType: activityEvents.actorType,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          targetLabel: activityEvents.targetLabel,
          metadata: activityEvents.metadata,
          organizationId: activityEvents.organizationId,
          isPublic: activityEvents.isPublic,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(and(...conditions))
        .orderBy(desc(activityEvents.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const results = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { items: results, nextCursor };
    }),

  /** Organization activity feed */
  orgFeed: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { organizationId, cursor, limit } = input;

      // Validate that user belongs to the org
      const resolvedOrgId = await getActivityDeps().resolveOrgId(
        organizationId,
        ctx.session.user.id,
      );

      if (resolvedOrgId !== organizationId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        });
      }

      const conditions = [eq(activityEvents.organizationId, organizationId)];

      if (cursor) {
        const [cursorEvent] = await ctx.db
          .select({ createdAt: activityEvents.createdAt })
          .from(activityEvents)
          .where(eq(activityEvents.id, cursor))
          .limit(1);

        if (cursorEvent) {
          conditions.push(lt(activityEvents.createdAt, cursorEvent.createdAt));
        }
      }

      const items = await ctx.db
        .select({
          id: activityEvents.id,
          actorId: activityEvents.actorId,
          actorType: activityEvents.actorType,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          targetLabel: activityEvents.targetLabel,
          metadata: activityEvents.metadata,
          organizationId: activityEvents.organizationId,
          isPublic: activityEvents.isPublic,
          createdAt: activityEvents.createdAt,
          actorName: user.name,
          actorImage: user.image,
        })
        .from(activityEvents)
        .leftJoin(user, eq(activityEvents.actorId, user.id))
        .where(and(...conditions))
        .orderBy(desc(activityEvents.createdAt))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const results = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { items: results, nextCursor };
    }),

  /** Activity for a specific entity */
  forTarget: protectedProcedure
    .input(
      z.object({
        targetType: z.string().max(50),
        targetId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select({
          id: activityEvents.id,
          actorId: activityEvents.actorId,
          actorType: activityEvents.actorType,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          targetLabel: activityEvents.targetLabel,
          metadata: activityEvents.metadata,
          organizationId: activityEvents.organizationId,
          isPublic: activityEvents.isPublic,
          createdAt: activityEvents.createdAt,
          actorName: user.name,
          actorImage: user.image,
        })
        .from(activityEvents)
        .leftJoin(user, eq(activityEvents.actorId, user.id))
        .where(
          and(
            eq(activityEvents.targetType, input.targetType),
            eq(activityEvents.targetId, input.targetId),
          ),
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit);

      return items;
    }),

  // ─── Admin (dashboard section) ─────────────────────────────────────────────

  /** Admin feed with filters and offset pagination */
  adminFeed: dashboardProcedure
    .input(
      z.object({
        action: z.string().max(100).optional(),
        actorId: z.string().uuid().optional(),
        targetType: z.string().max(50).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.action) conditions.push(eq(activityEvents.action, input.action));
      if (input.actorId) conditions.push(eq(activityEvents.actorId, input.actorId));
      if (input.targetType) conditions.push(eq(activityEvents.targetType, input.targetType));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: activityEvents.id,
            actorId: activityEvents.actorId,
            actorType: activityEvents.actorType,
            action: activityEvents.action,
            targetType: activityEvents.targetType,
            targetId: activityEvents.targetId,
            targetLabel: activityEvents.targetLabel,
            metadata: activityEvents.metadata,
            organizationId: activityEvents.organizationId,
            isPublic: activityEvents.isPublic,
            createdAt: activityEvents.createdAt,
            actorName: user.name,
            actorEmail: user.email,
            actorImage: user.image,
          })
          .from(activityEvents)
          .leftJoin(user, eq(activityEvents.actorId, user.id))
          .where(where)
          .orderBy(desc(activityEvents.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(activityEvents).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),
});
