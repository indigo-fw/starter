import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { cmsMenus, cmsMenuItems } from '@/server/db/schema';
import { ensureSlugUnique, fetchOrNotFound } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/audit';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const contentProcedure = sectionProcedure('content');

export const menusRouter = createTRPCRouter({
  /** List all menus */
  list: contentProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(cmsMenus)
      .orderBy(asc(cmsMenus.name))
      .limit(100);
  }),

  /** Get a single menu by ID */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return fetchOrNotFound<typeof cmsMenus.$inferSelect>(ctx.db, cmsMenus, input.id, 'Menu');
    }),

  /** Create a menu */
  create: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsMenus,
          slugCol: cmsMenus.slug,
          slug: input.slug,
        },
        'Menu'
      );

      const [menu] = await ctx.db
        .insert(cmsMenus)
        .values({ name: input.name, slug: input.slug })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'menu',
        entityId: menu!.id,
        entityTitle: menu!.name,
      });

      return menu!;
    }),

  /** Update a menu */
  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [existing] = await ctx.db
        .select()
        .from(cmsMenus)
        .where(eq(cmsMenus.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Menu not found' });
      }

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsMenus,
            slugCol: cmsMenus.slug,
            slug: updates.slug,
            idCol: cmsMenus.id,
            excludeId: id,
          },
          'Menu'
        );
      }

      await ctx.db
        .update(cmsMenus)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(cmsMenus.id, id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'menu',
        entityId: id,
        entityTitle: updates.name ?? existing.name,
      });

      return { success: true };
    }),

  /** Delete a menu */
  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: cmsMenus.id, name: cmsMenus.name })
        .from(cmsMenus)
        .where(eq(cmsMenus.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Menu not found' });
      }

      await ctx.db.delete(cmsMenus).where(eq(cmsMenus.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'delete',
        entityType: 'menu',
        entityId: input.id,
        entityTitle: existing.name,
      });

      return { success: true };
    }),

  /** Get items for a menu */
  getItems: contentProcedure
    .input(z.object({ menuId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(cmsMenuItems)
        .where(eq(cmsMenuItems.menuId, input.menuId))
        .orderBy(asc(cmsMenuItems.order))
        .limit(200);
    }),

  /** Save all items for a menu (delete old, insert new) */
  saveItems: contentProcedure
    .input(
      z.object({
        menuId: z.string().uuid(),
        items: z
          .array(
            z.object({
              clientId: z.string().max(100),
              parentClientId: z.string().max(100).nullable(),
              label: z.string().min(1).max(255),
              url: z.string().max(1024).nullable(),
              contentType: z.string().max(30).nullable(),
              contentId: z.string().uuid().nullable(),
              openInNewTab: z.boolean().default(false),
              order: z.number().int().min(0),
            })
          )
          .max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        // Delete existing items
        await tx
          .delete(cmsMenuItems)
          .where(eq(cmsMenuItems.menuId, input.menuId));

        if (input.items.length === 0) return;

        // Generate server IDs and build clientId→serverId map
        const idMap = new Map<string, string>();
        const crypto = await import('crypto');
        for (const item of input.items) {
          idMap.set(item.clientId, crypto.randomUUID());
        }

        // Insert with remapped parentIds
        await tx.insert(cmsMenuItems).values(
          input.items.map((item) => ({
            id: idMap.get(item.clientId)!,
            menuId: input.menuId,
            parentId: item.parentClientId ? (idMap.get(item.parentClientId) ?? null) : null,
            label: item.label,
            url: item.url,
            contentType: item.contentType,
            contentId: item.contentId,
            openInNewTab: item.openInNewTab,
            order: item.order,
          }))
        );
      });

      return { success: true };
    }),

  /** Public: get menu by slug with items (for rendering nav) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      const [menu] = await ctx.db
        .select()
        .from(cmsMenus)
        .where(eq(cmsMenus.slug, input.slug))
        .limit(1);

      if (!menu) return null;

      const items = await ctx.db
        .select()
        .from(cmsMenuItems)
        .where(eq(cmsMenuItems.menuId, menu.id))
        .orderBy(asc(cmsMenuItems.order))
        .limit(200);

      return { ...menu, items };
    }),
});
