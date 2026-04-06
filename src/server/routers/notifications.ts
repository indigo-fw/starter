import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { saasNotifications } from '@/server/db/schema';

export const notificationsRouter = createTRPCRouter({
  /** List notifications for the current user (cursor-paginated) */
  list: protectedProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(saasNotifications.userId, ctx.session.user.id)];

      if (input.unreadOnly) {
        conditions.push(eq(saasNotifications.read, false));
      }

      // Filter out expired notifications
      conditions.push(
        sql`(${saasNotifications.expiresAt} IS NULL OR ${saasNotifications.expiresAt} > NOW())`
      );

      const results = await ctx.db
        .select()
        .from(saasNotifications)
        .where(and(...conditions))
        .orderBy(desc(saasNotifications.createdAt))
        .limit(input.limit + 1);

      const hasMore = results.length > input.limit;
      const items = hasMore ? results.slice(0, -1) : results;

      return {
        items,
        hasMore,
        nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
      };
    }),

  /** Get unread notification count for the current user */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(saasNotifications)
      .where(
        and(
          eq(saasNotifications.userId, ctx.session.user.id),
          eq(saasNotifications.read, false),
          sql`(${saasNotifications.expiresAt} IS NULL OR ${saasNotifications.expiresAt} > NOW())`
        )
      );

    return result?.count ?? 0;
  }),

  /** Mark a single notification as read */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(saasNotifications)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            eq(saasNotifications.id, input.id),
            eq(saasNotifications.userId, ctx.session.user.id)
          )
        );
      return { success: true };
    }),

  /** Mark all unread notifications as read */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(saasNotifications)
      .set({ read: true, readAt: new Date() })
      .where(
        and(
          eq(saasNotifications.userId, ctx.session.user.id),
          eq(saasNotifications.read, false)
        )
      );
    return { success: true };
  }),

  /** Delete a single notification */
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(saasNotifications)
        .where(
          and(
            eq(saasNotifications.id, input.id),
            eq(saasNotifications.userId, ctx.session.user.id)
          )
        );
      return { success: true };
    }),
});
