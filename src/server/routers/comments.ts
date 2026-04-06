import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql, asc, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { cmsComments, user } from '@/server/db/schema';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { Policy } from '@/core/policy';
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from '../trpc';

export const commentsRouter = createTRPCRouter({
  /** List top-level comments for a content item. */
  list: publicProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = and(
        eq(cmsComments.contentType, input.contentType),
        eq(cmsComments.contentId, input.contentId),
        isNull(cmsComments.parentId),
        isNull(cmsComments.deletedAt),
        eq(cmsComments.status, 1)
      );

      const [items, countResult] = await Promise.all([
        ctx.db
          .select({
            id: cmsComments.id,
            body: cmsComments.body,
            createdAt: cmsComments.createdAt,
            parentId: cmsComments.parentId,
            userId: cmsComments.userId,
            userName: user.name,
            userImage: user.image,
          })
          .from(cmsComments)
          .innerJoin(user, eq(cmsComments.userId, user.id))
          .where(conditions)
          .orderBy(desc(cmsComments.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsComments)
          .where(conditions),
      ]);

      // Get reply counts for these comments
      const commentIds = items.map((i) => i.id);
      const replyCounts: Record<string, number> = {};
      if (commentIds.length > 0) {
        const replyRows = await ctx.db
          .select({
            parentId: cmsComments.parentId,
            count: sql<number>`count(*)`,
          })
          .from(cmsComments)
          .where(
            and(
              inArray(cmsComments.parentId, commentIds),
              isNull(cmsComments.deletedAt),
              eq(cmsComments.status, 1)
            )
          )
          .groupBy(cmsComments.parentId);

        for (const row of replyRows) {
          if (row.parentId) replyCounts[row.parentId] = Number(row.count);
        }
      }

      const total = Number(countResult[0]?.count ?? 0);
      return paginatedResult(
        items.map((item) => ({
          ...item,
          replyCount: replyCounts[item.id] ?? 0,
        })),
        total,
        page,
        pageSize
      );
    }),

  /** List replies for a parent comment. */
  listReplies: publicProcedure
    .input(
      z.object({
        parentId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = and(
        eq(cmsComments.parentId, input.parentId),
        isNull(cmsComments.deletedAt),
        eq(cmsComments.status, 1)
      );

      const [items, countResult] = await Promise.all([
        ctx.db
          .select({
            id: cmsComments.id,
            body: cmsComments.body,
            createdAt: cmsComments.createdAt,
            parentId: cmsComments.parentId,
            userId: cmsComments.userId,
            userName: user.name,
            userImage: user.image,
          })
          .from(cmsComments)
          .innerJoin(user, eq(cmsComments.userId, user.id))
          .where(conditions)
          .orderBy(asc(cmsComments.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsComments)
          .where(conditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      return paginatedResult(items, total, page, pageSize);
    }),

  /** Create a comment or reply. */
  create: protectedProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentId: z.string().uuid(),
        parentId: z.string().uuid().optional(),
        body: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify parent exists if replying
      if (input.parentId) {
        const [parent] = await ctx.db
          .select({ id: cmsComments.id })
          .from(cmsComments)
          .where(
            and(
              eq(cmsComments.id, input.parentId),
              isNull(cmsComments.deletedAt)
            )
          )
          .limit(1);
        if (!parent) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent comment not found' });
        }
      }

      const [comment] = await ctx.db
        .insert(cmsComments)
        .values({
          userId: ctx.session.user.id,
          contentType: input.contentType,
          contentId: input.contentId,
          parentId: input.parentId ?? null,
          body: input.body,
          status: 1,
        })
        .returning();

      // Fetch user info to return with the comment
      const [userInfo] = await ctx.db
        .select({ name: user.name, image: user.image })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      return {
        ...comment!,
        userName: userInfo?.name ?? 'Unknown',
        userImage: userInfo?.image ?? null,
        replyCount: 0,
      };
    }),

  /** Delete a comment (own or staff). */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [comment] = await ctx.db
        .select({ userId: cmsComments.userId })
        .from(cmsComments)
        .where(
          and(eq(cmsComments.id, input.id), isNull(cmsComments.deletedAt))
        )
        .limit(1);

      if (!comment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
      }

      const isOwner = comment.userId === ctx.session.user.id;
      const isStaff = Policy.for(ctx.session.user.role).can('section.content');

      if (!isOwner && !isStaff) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete this comment' });
      }

      await ctx.db
        .update(cmsComments)
        .set({ deletedAt: new Date() })
        .where(eq(cmsComments.id, input.id));

      return { success: true };
    }),

  /** Get total comment count for a content item (including replies). */
  count: publicProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(cmsComments)
        .where(
          and(
            eq(cmsComments.contentType, input.contentType),
            eq(cmsComments.contentId, input.contentId),
            isNull(cmsComments.deletedAt),
            eq(cmsComments.status, 1)
          )
        );
      return { count: Number(result?.count ?? 0) };
    }),

  /** Batch get comment counts for multiple content items. */
  batchCounts: publicProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentIds: z.array(z.string().uuid()).min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          contentId: cmsComments.contentId,
          count: sql<number>`count(*)`,
        })
        .from(cmsComments)
        .where(
          and(
            eq(cmsComments.contentType, input.contentType),
            inArray(cmsComments.contentId, input.contentIds),
            isNull(cmsComments.deletedAt),
            eq(cmsComments.status, 1)
          )
        )
        .groupBy(cmsComments.contentId);

      const result: Record<string, number> = {};
      for (const id of input.contentIds) {
        result[id] = 0;
      }
      for (const row of rows) {
        result[row.contentId] = Number(row.count);
      }
      return result;
    }),
});
