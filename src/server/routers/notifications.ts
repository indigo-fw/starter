import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { saasNotifications, saasPushSubscriptions } from '@/server/db/schema';
import { isPushEnabled } from '@/core/lib/push/web-push';

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

  // ─── Push notifications ─────────────────────────────────────────────────

  /** Check if push notifications are available (VAPID configured). */
  pushEnabled: protectedProcedure.query(async () => {
    return isPushEnabled();
  }),

  /** Register a push subscription for the current user's device. */
  pushSubscribe: protectedProcedure
    .input(z.object({
      endpoint: z.string().url().max(2000),
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      // Upsert — same endpoint = same device, just refresh keys
      await ctx.db
        .insert(saasPushSubscriptions)
        .values({
          userId: ctx.session.user.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        })
        .onConflictDoUpdate({
          target: saasPushSubscriptions.endpoint,
          set: {
            userId: ctx.session.user.id,
            p256dh: input.p256dh,
            auth: input.auth,
            updatedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /** Unsubscribe a push endpoint for the current user. */
  pushUnsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(saasPushSubscriptions)
        .where(
          and(
            eq(saasPushSubscriptions.endpoint, input.endpoint),
            eq(saasPushSubscriptions.userId, ctx.session.user.id),
          )
        );

      return { success: true };
    }),

  /** Check if the current user has any push subscriptions. */
  pushStatus: protectedProcedure.query(async ({ ctx }) => {
    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(saasPushSubscriptions)
      .where(eq(saasPushSubscriptions.userId, ctx.session.user.id));

    return { subscriptionCount: result?.count ?? 0 };
  }),
});
