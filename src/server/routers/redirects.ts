import { TRPCError } from '@trpc/server';
import { and, count as drizzleCount, desc, eq, inArray, like, or } from 'drizzle-orm';
import { z } from 'zod';

import { cmsSlugRedirects, cmsPosts, cmsCategories } from '@/server/db/schema';
import { logAudit } from '@/core/lib/audit';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { createTRPCRouter, sectionProcedure } from '../trpc';

const proc = sectionProcedure('content');

export const redirectsRouter = createTRPCRouter({
  /** List redirects with search + pagination */
  list: proc
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input?.search) {
        conditions.push(
          or(
            like(cmsSlugRedirects.oldSlug, `%${input.search}%`),
            like(cmsSlugRedirects.contentType, `%${input.search}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsSlugRedirects)
          .where(where)
          .orderBy(desc(cmsSlugRedirects.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ count: drizzleCount() })
          .from(cmsSlugRedirects)
          .where(where),
      ]);

      // Resolve target titles — batch by contentType to avoid N+1
      const categoryIds = items
        .filter((i) => i.contentType === 'category')
        .map((i) => i.contentId);
      const postIds = items
        .filter((i) => i.contentType !== 'category')
        .map((i) => i.contentId);

      const [categoryRows, postRows] = await Promise.all([
        categoryIds.length > 0
          ? ctx.db
              .select({ id: cmsCategories.id, name: cmsCategories.name, slug: cmsCategories.slug })
              .from(cmsCategories)
              .where(inArray(cmsCategories.id, categoryIds))
          : Promise.resolve([]),
        postIds.length > 0
          ? ctx.db
              .select({ id: cmsPosts.id, title: cmsPosts.title, slug: cmsPosts.slug })
              .from(cmsPosts)
              .where(inArray(cmsPosts.id, postIds))
          : Promise.resolve([]),
      ]);

      const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));
      const postMap = new Map(postRows.map((p) => [p.id, p]));

      const enriched = items.map((item) => {
        if (item.contentType === 'category') {
          const cat = categoryMap.get(item.contentId);
          return { ...item, targetTitle: cat?.name ?? '(deleted)', targetSlug: cat?.slug ?? '' };
        }
        const post = postMap.get(item.contentId);
        return { ...item, targetTitle: post?.title ?? '(deleted)', targetSlug: post?.slug ?? '' };
      });

      return paginatedResult(
        enriched,
        countResult[0]?.count ?? 0,
        page,
        pageSize
      );
    }),

  /** Create a redirect with chain detection */
  create: proc
    .input(
      z.object({
        oldSlug: z.string().min(1).max(255),
        contentType: z.string().min(1).max(30),
        contentId: z.string().uuid(),
        urlPrefix: z.string().max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate: same oldSlug + urlPrefix already exists
      const existing = await ctx.db.query.cmsSlugRedirects.findFirst({
        where: and(
          eq(cmsSlugRedirects.oldSlug, input.oldSlug),
          eq(cmsSlugRedirects.urlPrefix, input.urlPrefix)
        ),
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A redirect for "${input.oldSlug}" with prefix "${input.urlPrefix}" already exists`,
        });
      }

      // Chain detection: follow redirects max 10 hops
      let currentSlug = input.oldSlug;
      const chain: string[] = [currentSlug];

      for (let i = 0; i < 10; i++) {
        const next = await ctx.db.query.cmsSlugRedirects.findFirst({
          where: and(
            eq(cmsSlugRedirects.oldSlug, currentSlug),
            eq(cmsSlugRedirects.urlPrefix, input.urlPrefix)
          ),
        });
        if (!next) break;

        // Resolve current slug of the target
        let resolvedSlug = '';
        if (next.contentType === 'category') {
          const cat = await ctx.db.query.cmsCategories.findFirst({
            where: eq(cmsCategories.id, next.contentId),
            columns: { slug: true },
          });
          resolvedSlug = cat?.slug ?? '';
        } else {
          const post = await ctx.db.query.cmsPosts.findFirst({
            where: eq(cmsPosts.id, next.contentId),
            columns: { slug: true },
          });
          resolvedSlug = post?.slug ?? '';
        }

        if (!resolvedSlug || chain.includes(resolvedSlug)) break;
        chain.push(resolvedSlug);
        currentSlug = resolvedSlug;
      }

      const [created] = await ctx.db
        .insert(cmsSlugRedirects)
        .values({
          oldSlug: input.oldSlug,
          contentType: input.contentType,
          contentId: input.contentId,
          urlPrefix: input.urlPrefix,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id!,
        action: 'create',
        entityType: 'redirect',
        entityId: created.id,
        entityTitle: input.oldSlug,
      });

      return { ...created, chain: chain.length > 1 ? chain : undefined };
    }),

  /** Delete a redirect */
  delete: proc
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(cmsSlugRedirects)
        .where(eq(cmsSlugRedirects.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Redirect not found',
        });
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id!,
        action: 'delete',
        entityType: 'redirect',
        entityId: input.id,
        entityTitle: deleted.oldSlug,
      });

      return { success: true };
    }),
});
