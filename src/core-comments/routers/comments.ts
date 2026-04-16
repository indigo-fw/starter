import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure, sectionProcedure } from '@/server/trpc';
import { cmsComments, CommentStatus } from '@/core-comments/schema/comments';
import { user } from '@/server/db/schema/auth';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { createLogger } from '@/core/lib/infra/logger';
import { getCommentsDeps } from '@/core-comments/deps';

const logger = createLogger('comments-router');

const contentProcedure = sectionProcedure('content');

export const commentsRouter = createTRPCRouter({
  // ─── Public ────────────────────────────────────────────────────────────────

  /** List approved comments for a target (flat list, client handles threading via parentId) */
  list: publicProcedure
    .input(z.object({
      targetType: z.string().max(50),
      targetId: z.string().uuid(),
      cursor: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(cmsComments.targetType, input.targetType),
        eq(cmsComments.targetId, input.targetId),
        eq(cmsComments.status, CommentStatus.APPROVED),
        isNull(cmsComments.deletedAt),
      ];

      if (input.cursor) {
        // Cursor-based: get the createdAt of the cursor comment, then fetch after it
        const [cursorRow] = await ctx.db
          .select({ createdAt: cmsComments.createdAt })
          .from(cmsComments)
          .where(eq(cmsComments.id, input.cursor))
          .limit(1);

        if (cursorRow) {
          conditions.push(gt(cmsComments.createdAt, cursorRow.createdAt));
        }
      }

      const items = await ctx.db
        .select({
          id: cmsComments.id,
          parentId: cmsComments.parentId,
          userId: cmsComments.userId,
          authorName: cmsComments.authorName,
          content: cmsComments.content,
          createdAt: cmsComments.createdAt,
          userName: user.name,
          userImage: user.image,
        })
        .from(cmsComments)
        .leftJoin(user, eq(cmsComments.userId, user.id))
        .where(and(...conditions))
        .orderBy(asc(cmsComments.createdAt))
        .limit(input.limit + 1);

      const hasMore = items.length > input.limit;
      const results = hasMore ? items.slice(0, input.limit) : items;
      const nextCursor = hasMore ? results[results.length - 1]?.id : undefined;

      return { items: results, nextCursor };
    }),

  /** Count approved comments for a target */
  count: publicProcedure
    .input(z.object({
      targetType: z.string().max(50),
      targetId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ count: count() })
        .from(cmsComments)
        .where(and(
          eq(cmsComments.targetType, input.targetType),
          eq(cmsComments.targetId, input.targetId),
          eq(cmsComments.status, CommentStatus.APPROVED),
          isNull(cmsComments.deletedAt),
        ))
        .limit(1);

      return row?.count ?? 0;
    }),

  /** Batch count approved comments for multiple targets (e.g. post grids) */
  countMany: publicProcedure
    .input(z.object({
      targetType: z.string().max(50),
      targetIds: z.array(z.string().uuid()).max(100),
    }))
    .query(async ({ ctx, input }) => {
      if (input.targetIds.length === 0) return {} as Record<string, number>;

      const rows = await ctx.db
        .select({
          targetId: cmsComments.targetId,
          count: count(),
        })
        .from(cmsComments)
        .where(and(
          eq(cmsComments.targetType, input.targetType),
          inArray(cmsComments.targetId, input.targetIds),
          eq(cmsComments.status, CommentStatus.APPROVED),
          isNull(cmsComments.deletedAt),
        ))
        .groupBy(cmsComments.targetId)
        .limit(100);

      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.targetId] = row.count;
      }
      return result;
    }),

  // ─── Protected (logged in) ────────────────────────────────────────────────

  /** Create a comment (auto-approved for logged-in users) */
  create: protectedProcedure
    .input(z.object({
      targetType: z.string().max(50),
      targetId: z.string().uuid(),
      parentId: z.string().uuid().optional(),
      content: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // If replying, verify parent exists and belongs to the same target
      let parentUserId: string | null = null;
      if (input.parentId) {
        const [parent] = await ctx.db
          .select({
            id: cmsComments.id,
            targetType: cmsComments.targetType,
            targetId: cmsComments.targetId,
            userId: cmsComments.userId,
          })
          .from(cmsComments)
          .where(and(
            eq(cmsComments.id, input.parentId),
            isNull(cmsComments.deletedAt),
          ))
          .limit(1);

        if (!parent) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent comment not found' });
        }
        if (parent.targetType !== input.targetType || parent.targetId !== input.targetId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Parent comment belongs to a different target' });
        }
        parentUserId = parent.userId;
      }

      const [comment] = await ctx.db
        .insert(cmsComments)
        .values({
          targetType: input.targetType,
          targetId: input.targetId,
          parentId: input.parentId ?? null,
          userId,
          content: input.content,
          status: CommentStatus.APPROVED,
        })
        .returning();

      // Notify parent comment author on reply (skip if replying to yourself)
      if (parentUserId && parentUserId !== userId) {
        try {
          const deps = getCommentsDeps();
          await deps.sendNotification({
            userId: parentUserId,
            title: 'New reply to your comment',
            body: input.content.slice(0, 100) + (input.content.length > 100 ? '...' : ''),
          });
        } catch (err) {
          logger.error('Reply notification failed', err instanceof Error ? err : undefined);
        }
      }

      try {
        getCommentsDeps().onCommentCreated?.({
          commentId: comment!.id,
          userId,
          targetType: input.targetType,
          targetId: input.targetId,
          content: input.content,
          parentId: input.parentId ?? null,
        });
      } catch (err) {
        logger.error('onCommentCreated callback failed', err instanceof Error ? err : undefined);
      }

      return comment!;
    }),

  /** Update own comment */
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      content: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [existing] = await ctx.db
        .select({ id: cmsComments.id })
        .from(cmsComments)
        .where(and(
          eq(cmsComments.id, input.id),
          eq(cmsComments.userId, userId),
          isNull(cmsComments.deletedAt),
        ))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
      }

      await ctx.db
        .update(cmsComments)
        .set({ content: input.content, updatedAt: new Date() })
        .where(eq(cmsComments.id, input.id));

      return { success: true };
    }),

  /** Soft-delete own comment */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [existing] = await ctx.db
        .select({ id: cmsComments.id, targetType: cmsComments.targetType, targetId: cmsComments.targetId })
        .from(cmsComments)
        .where(and(
          eq(cmsComments.id, input.id),
          eq(cmsComments.userId, userId),
          isNull(cmsComments.deletedAt),
        ))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
      }

      await ctx.db
        .update(cmsComments)
        .set({ deletedAt: new Date() })
        .where(eq(cmsComments.id, input.id));

      try {
        getCommentsDeps().onCommentDeleted?.({
          commentId: input.id,
          userId,
          targetType: existing.targetType,
          targetId: existing.targetId,
        });
      } catch (err) {
        logger.error('onCommentDeleted callback failed', err instanceof Error ? err : undefined);
      }

      return { success: true };
    }),

  // ─── Admin ─────────────────────────────────────────────────────────────────

  /** Admin list with filters and pagination */
  adminList: contentProcedure
    .input(z.object({
      status: z.number().int().min(0).max(3).optional(),
      targetType: z.string().max(50).optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions: ReturnType<typeof eq>[] = [];
      if (input.status !== undefined) conditions.push(eq(cmsComments.status, input.status));
      if (input.targetType) conditions.push(eq(cmsComments.targetType, input.targetType));
      if (input.search) conditions.push(ilike(cmsComments.content, `%${input.search}%`));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: cmsComments.id,
            targetType: cmsComments.targetType,
            targetId: cmsComments.targetId,
            parentId: cmsComments.parentId,
            userId: cmsComments.userId,
            authorName: cmsComments.authorName,
            content: cmsComments.content,
            status: cmsComments.status,
            createdAt: cmsComments.createdAt,
            updatedAt: cmsComments.updatedAt,
            deletedAt: cmsComments.deletedAt,
            userName: user.name,
            userEmail: user.email,
            userImage: user.image,
          })
          .from(cmsComments)
          .leftJoin(user, eq(cmsComments.userId, user.id))
          .where(whereClause)
          .orderBy(desc(cmsComments.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(cmsComments).where(whereClause),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Update comment status (moderate) */
  updateStatus: contentProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.number().int().min(0).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .select({ id: cmsComments.id })
        .from(cmsComments)
        .where(eq(cmsComments.id, input.id))
        .limit(1);

      if (!comment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
      }

      await ctx.db
        .update(cmsComments)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(cmsComments.id, input.id));

      return { success: true };
    }),

  /** Permanently delete a comment (admin) */
  adminDelete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .select({ id: cmsComments.id })
        .from(cmsComments)
        .where(eq(cmsComments.id, input.id))
        .limit(1);

      if (!comment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
      }

      await ctx.db.delete(cmsComments).where(eq(cmsComments.id, input.id));
      return { success: true };
    }),

  /** Status counts for admin filter tabs */
  statusCounts: contentProcedure
    .query(async ({ ctx }) => {
      const [row] = await ctx.db
        .select({
          all: sql<string>`SUM(CASE WHEN ${cmsComments.deletedAt} IS NULL THEN 1 ELSE 0 END)`,
          pending: sql<string>`SUM(CASE WHEN ${cmsComments.deletedAt} IS NULL AND ${cmsComments.status} = ${CommentStatus.PENDING} THEN 1 ELSE 0 END)`,
          approved: sql<string>`SUM(CASE WHEN ${cmsComments.deletedAt} IS NULL AND ${cmsComments.status} = ${CommentStatus.APPROVED} THEN 1 ELSE 0 END)`,
          rejected: sql<string>`SUM(CASE WHEN ${cmsComments.deletedAt} IS NULL AND ${cmsComments.status} = ${CommentStatus.REJECTED} THEN 1 ELSE 0 END)`,
          spam: sql<string>`SUM(CASE WHEN ${cmsComments.deletedAt} IS NULL AND ${cmsComments.status} = ${CommentStatus.SPAM} THEN 1 ELSE 0 END)`,
          trash: sql<string>`SUM(CASE WHEN ${cmsComments.deletedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
        })
        .from(cmsComments);

      return {
        all: Number(row?.all ?? 0),
        pending: Number(row?.pending ?? 0),
        approved: Number(row?.approved ?? 0),
        rejected: Number(row?.rejected ?? 0),
        spam: Number(row?.spam ?? 0),
        trash: Number(row?.trash ?? 0),
      };
    }),
});
