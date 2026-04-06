import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { storeOrders, storeOrderItems, storeOrderEvents, storeDownloads } from '@/core-store/schema/orders';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { updateOrderStatus } from '@/core-store/lib/order-service';
import { getStoreDeps } from '@/core-store/deps';

const storeAdminProcedure = sectionProcedure('settings');

export const storeOrdersRouter = createTRPCRouter({
  // ─── Customer-facing ────────────────────────────────────────────────────

  /** List my orders */
  myOrders: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { page, pageSize, offset } = parsePagination(input);

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: storeOrders.id,
            orderNumber: storeOrders.orderNumber,
            status: storeOrders.status,
            totalCents: storeOrders.totalCents,
            currency: storeOrders.currency,
            createdAt: storeOrders.createdAt,
          })
          .from(storeOrders)
          .where(eq(storeOrders.userId, userId))
          .orderBy(desc(storeOrders.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(storeOrders).where(eq(storeOrders.userId, userId)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get my order detail */
  myOrderDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [order] = await ctx.db
        .select()
        .from(storeOrders)
        .where(and(eq(storeOrders.id, input.id), eq(storeOrders.userId, userId)))
        .limit(1);

      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });

      const [items, events, downloads] = await Promise.all([
        ctx.db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, order.id)).limit(100),
        ctx.db.select().from(storeOrderEvents).where(eq(storeOrderEvents.orderId, order.id)).orderBy(storeOrderEvents.createdAt).limit(50),
        ctx.db.select().from(storeDownloads).where(eq(storeDownloads.orderId, order.id)).limit(50),
      ]);

      return { ...order, items, events, downloads: downloads.map((d) => ({ ...d, fileUrl: undefined })) };
    }),

  /** Get download link (validates token + limits) */
  getDownload: protectedProcedure
    .input(z.object({ token: z.string().max(100) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [download] = await ctx.db
        .select()
        .from(storeDownloads)
        .where(and(eq(storeDownloads.token, input.token), eq(storeDownloads.userId, userId)))
        .limit(1);

      if (!download) throw new TRPCError({ code: 'NOT_FOUND', message: 'Download not found' });

      if (download.expiresAt && download.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Download link has expired' });
      }

      if (download.downloadLimit && download.downloadCount >= download.downloadLimit) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Download limit reached' });
      }

      // Increment download count
      await ctx.db.update(storeDownloads)
        .set({ downloadCount: download.downloadCount + 1 })
        .where(eq(storeDownloads.id, download.id));

      return { fileUrl: download.fileUrl };
    }),

  // ─── Admin ──────────────────────────────────────────────────────────────

  /** List all orders (admin) */
  adminList: storeAdminProcedure
    .input(z.object({
      status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) conditions.push(eq(storeOrders.status, input.status));
      if (input.from) conditions.push(gte(storeOrders.createdAt, new Date(input.from)));
      if (input.to) conditions.push(lte(storeOrders.createdAt, new Date(input.to + 'T23:59:59')));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db.select().from(storeOrders).where(where).orderBy(desc(storeOrders.createdAt)).offset(offset).limit(pageSize),
        ctx.db.select({ count: count() }).from(storeOrders).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get order detail (admin) */
  adminGet: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db.select().from(storeOrders).where(eq(storeOrders.id, input.id)).limit(1);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });

      const [items, events] = await Promise.all([
        ctx.db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, order.id)).limit(100),
        ctx.db.select().from(storeOrderEvents).where(eq(storeOrderEvents.orderId, order.id)).orderBy(storeOrderEvents.createdAt).limit(50),
      ]);

      return { ...order, items, events };
    }),

  /** Update order status (admin) */
  updateStatus: storeAdminProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      status: z.enum(['processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
      note: z.string().max(1000).optional(),
      trackingNumber: z.string().max(255).optional(),
      trackingUrl: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deps = getStoreDeps();

      await updateOrderStatus(
        input.orderId,
        input.status,
        ctx.session.user.id,
        input.note,
        { trackingNumber: input.trackingNumber, trackingUrl: input.trackingUrl },
      );

      // Notify customer
      const [order] = await ctx.db
        .select({ userId: storeOrders.userId, orderNumber: storeOrders.orderNumber })
        .from(storeOrders)
        .where(eq(storeOrders.id, input.orderId))
        .limit(1);

      if (order) {
        deps.sendNotification({
          userId: order.userId,
          title: `Order ${order.orderNumber} — ${input.status}`,
          body: input.note ?? `Your order status has been updated to ${input.status}.`,
          actionUrl: `/account/orders/${input.orderId}`,
        });
      }

      return { success: true };
    }),

  /** Add admin note to order */
  addNote: storeAdminProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      note: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(storeOrders)
        .set({ adminNote: input.note, updatedAt: new Date() })
        .where(eq(storeOrders.id, input.orderId));
      return { success: true };
    }),
});
