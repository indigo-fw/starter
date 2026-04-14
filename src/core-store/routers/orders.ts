import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure, sectionProcedure } from '@/server/trpc';
import { storeOrders, storeOrderItems, storeOrderEvents, storeDownloads, storeCartItems } from '@/core-store/schema/orders';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { updateOrderStatus, editOrder, reorderFromOrder } from '@/core-store/lib/order-service';
import { getOrCreateCart } from '@/core-store/lib/cart-service';
import { getStoreDeps } from '@/core-store/deps';

const storeAdminProcedure = sectionProcedure('settings');

export const storeOrdersRouter = createTRPCRouter({
  // ─── Customer-facing ────────────────────────────────────────────────────

  /** List my orders (placed by me) */
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
          .where(eq(storeOrders.placedByUserId, userId))
          .orderBy(desc(storeOrders.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(storeOrders).where(eq(storeOrders.placedByUserId, userId)),
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
        .where(and(eq(storeOrders.id, input.id), eq(storeOrders.placedByUserId, userId)))
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
        .where(and(eq(storeDownloads.token, input.token), eq(storeDownloads.grantedToUserId, userId)))
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

  /** Download by token only — no auth required (for guest orders + email links) */
  getDownloadByToken: publicProcedure
    .input(z.object({ token: z.string().max(100) }))
    .query(async ({ ctx, input }) => {
      const [download] = await ctx.db
        .select()
        .from(storeDownloads)
        .where(eq(storeDownloads.token, input.token))
        .limit(1);

      if (!download) throw new TRPCError({ code: 'NOT_FOUND', message: 'Download not found' });

      if (download.expiresAt && download.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Download link has expired' });
      }

      if (download.downloadLimit && download.downloadCount >= download.downloadLimit) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Download limit reached' });
      }

      await ctx.db.update(storeDownloads)
        .set({ downloadCount: download.downloadCount + 1 })
        .where(eq(storeDownloads.id, download.id));

      return { fileUrl: download.fileUrl };
    }),

  /** Guest order lookup by order number + email */
  guestOrderDetail: publicProcedure
    .input(z.object({
      orderNumber: z.string().max(50),
      email: z.string().email().max(255),
    }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select()
        .from(storeOrders)
        .where(and(
          eq(storeOrders.orderNumber, input.orderNumber),
          eq(storeOrders.guestEmail, input.email),
        ))
        .limit(1);

      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });

      const [items, events, downloads] = await Promise.all([
        ctx.db.select().from(storeOrderItems).where(eq(storeOrderItems.orderId, order.id)).limit(100),
        ctx.db.select().from(storeOrderEvents).where(eq(storeOrderEvents.orderId, order.id)).orderBy(storeOrderEvents.createdAt).limit(50),
        ctx.db.select().from(storeDownloads).where(eq(storeDownloads.orderId, order.id)).limit(50),
      ]);

      return { ...order, items, events, downloads: downloads.map((d) => ({ ...d, fileUrl: undefined, token: d.token })) };
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
      if (input.search) conditions.push(ilike(storeOrders.orderNumber, '%' + input.search + '%'));
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

      // Notify the user who placed the order
      const [order] = await ctx.db
        .select({ placedByUserId: storeOrders.placedByUserId, orderNumber: storeOrders.orderNumber })
        .from(storeOrders)
        .where(eq(storeOrders.id, input.orderId))
        .limit(1);

      if (order?.placedByUserId) {
        deps.sendNotification({
          userId: order.placedByUserId,
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

  // ─── Reorder ───────────────────────────────────────────────────────────

  /** Re-add items from a previous order to the user's cart */
  reorder: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify the order belongs to the user
      const [order] = await ctx.db
        .select({ id: storeOrders.id, placedByUserId: storeOrders.placedByUserId })
        .from(storeOrders)
        .where(eq(storeOrders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }
      if (order.placedByUserId !== userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This order does not belong to you' });
      }

      const { cartItems } = await reorderFromOrder(input.orderId);
      const cartId = await getOrCreateCart(userId, null);

      let itemsAdded = 0;
      let itemsSkipped = 0;

      for (const item of cartItems) {
        try {
          // Get current price
          let unitPriceCents: number;
          if (item.variantId) {
            const [variant] = await ctx.db
              .select({ priceCents: storeProductVariants.priceCents })
              .from(storeProductVariants)
              .where(eq(storeProductVariants.id, item.variantId))
              .limit(1);
            if (!variant) { itemsSkipped++; continue; }
            unitPriceCents = variant.priceCents;
          } else {
            const [product] = await ctx.db
              .select({ priceCents: storeProducts.priceCents })
              .from(storeProducts)
              .where(eq(storeProducts.id, item.productId))
              .limit(1);
            if (!product) { itemsSkipped++; continue; }
            unitPriceCents = product.priceCents ?? 0;
          }

          // Check if already in cart
          const existingCondition = item.variantId
            ? and(eq(storeCartItems.cartId, cartId), eq(storeCartItems.productId, item.productId), eq(storeCartItems.variantId, item.variantId))
            : and(eq(storeCartItems.cartId, cartId), eq(storeCartItems.productId, item.productId));

          const [existing] = await ctx.db
            .select({ id: storeCartItems.id, quantity: storeCartItems.quantity })
            .from(storeCartItems)
            .where(existingCondition)
            .limit(1);

          if (existing) {
            await ctx.db.update(storeCartItems)
              .set({ quantity: existing.quantity + item.quantity, unitPriceCents })
              .where(eq(storeCartItems.id, existing.id));
          } else {
            await ctx.db.insert(storeCartItems).values({
              cartId,
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPriceCents,
            });
          }
          itemsAdded++;
        } catch {
          itemsSkipped++;
        }
      }

      return { itemsAdded, itemsSkipped };
    }),

  // ─── Edit Order (Admin) ────────────────────────────────────────────────

  /** Edit a pending order — modify item quantities or notes */
  editOrder: storeAdminProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      items: z.array(z.object({
        orderItemId: z.string().uuid(),
        newQuantity: z.number().int().min(0).max(9999),
      })).max(50).optional(),
      customerNote: z.string().max(1000).optional(),
      adminNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      await editOrder(input.orderId, {
        items: input.items,
        customerNote: input.customerNote,
        adminNote: input.adminNote,
      });

      return { success: true };
    }),
});
