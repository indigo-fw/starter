import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import { desc, eq, count } from 'drizzle-orm';
import { z } from 'zod';

import { cmsWebhooks, cmsWebhookDeliveries } from '@/server/db/schema';
import { fetchOrNotFound, parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/infra/audit';
import { getDeliveryStats } from '@/core/lib/webhooks/delivery-log';
import { createTRPCRouter, sectionProcedure } from '../trpc';

const settingsProcedure = sectionProcedure('settings');

export const webhooksRouter = createTRPCRouter({
  /** List all webhooks */
  list: settingsProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(cmsWebhooks)
      .orderBy(cmsWebhooks.createdAt)
      .limit(100);
  }),

  /** Get a single webhook */
  get: settingsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return fetchOrNotFound<typeof cmsWebhooks.$inferSelect>(
        ctx.db, cmsWebhooks, input.id, 'Webhook'
      );
    }),

  /** Create a webhook */
  create: settingsProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        url: z.string().url().max(1024),
        events: z.array(z.string().max(50)).min(1).max(20),
        active: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const secret = crypto.randomBytes(32).toString('hex');

      const [hook] = await ctx.db
        .insert(cmsWebhooks)
        .values({
          name: input.name,
          url: input.url,
          secret,
          events: input.events,
          active: input.active,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'webhook.create',
        entityType: 'webhook',
        entityId: hook!.id,
        entityTitle: input.name,
      });

      return hook!;
    }),

  /** Update a webhook */
  update: settingsProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        url: z.string().url().max(1024).optional(),
        events: z.array(z.string().max(50)).min(1).max(20).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      await fetchOrNotFound<typeof cmsWebhooks.$inferSelect>(ctx.db, cmsWebhooks, id, 'Webhook');

      await ctx.db
        .update(cmsWebhooks)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(cmsWebhooks.id, id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'webhook.update',
        entityType: 'webhook',
        entityId: id,
      });

      return { success: true };
    }),

  /** Delete a webhook */
  delete: settingsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await fetchOrNotFound<typeof cmsWebhooks.$inferSelect>(ctx.db, cmsWebhooks, input.id, 'Webhook');

      await ctx.db.delete(cmsWebhooks).where(eq(cmsWebhooks.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'webhook.delete',
        entityType: 'webhook',
        entityId: input.id,
      });

      return { success: true };
    }),

  /** Get delivery history for a webhook */
  deliveries: settingsProcedure
    .input(
      z.object({
        webhookId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = eq(cmsWebhookDeliveries.webhookId, input.webhookId);

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsWebhookDeliveries)
          .where(conditions)
          .orderBy(desc(cmsWebhookDeliveries.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(cmsWebhookDeliveries)
          .where(conditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      return paginatedResult(items, total, page, pageSize);
    }),

  /** Get delivery stats for a webhook */
  deliveryStats: settingsProcedure
    .input(z.object({ webhookId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getDeliveryStats(ctx.db, cmsWebhookDeliveries, input.webhookId);
    }),

  /** Test a webhook by sending a test payload */
  test: settingsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const hook = await fetchOrNotFound<typeof cmsWebhooks.$inferSelect>(
        ctx.db, cmsWebhooks, input.id, 'Webhook'
      );

      const body = JSON.stringify({
        event: 'test',
        timestamp: new Date().toISOString(),
        data: { message: 'This is a test webhook from Indigo' },
      });

      const signature = crypto
        .createHmac('sha256', hook.secret)
        .update(body)
        .digest('hex');

      try {
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          body,
        });
        return { success: true, status: res.status };
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to reach webhook URL',
        });
      }
    }),
});
