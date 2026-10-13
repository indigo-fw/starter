import { createTRPCRouter, sectionProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { and, desc, count as drizzleCount, eq, like, or } from 'drizzle-orm';
import { z } from 'zod';

import { paginatedResult, parsePagination } from '@/core/crud/admin-crud';
import { MAX_PAGE } from '@/core/crud/router-schemas';
import {
  type RedirectTarget,
  resolveCurrentSlug,
  resolveRedirectTargets,
} from '@/core/crud/slug-redirects';
import { logAudit } from '@/core/lib/infra/audit';
import { cmsSlugRedirects } from '@/server/db/schema';

const proc = sectionProcedure('content');

export const redirectsRouter = createTRPCRouter({
  /** List redirects with search + pagination */
  list: proc
    .input(
      z
        .object({
          search: z.string().max(200).optional(),
          page: z.number().int().min(1).max(MAX_PAGE).optional(),
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

      // Resolve target titles through the same registry the public route uses
      // (one batched query per contentType), so portfolio/showcase and any
      // future type get real titles instead of "(deleted)".
      const idsByType = new Map<string, string[]>();
      for (const item of items) {
        const ids = idsByType.get(item.contentType) ?? [];
        ids.push(item.contentId);
        idsByType.set(item.contentType, ids);
      }
      const targets = new Map<string, RedirectTarget>();
      await Promise.all(
        [...idsByType].map(async ([contentType, ids]) => {
          const resolved = await resolveRedirectTargets(
            ctx.db,
            contentType,
            ids
          );
          for (const [id, target] of resolved) {
            targets.set(`${contentType}:${id}`, target);
          }
        })
      );

      const enriched = items.map((item) => {
        const target = targets.get(`${item.contentType}:${item.contentId}`);
        return {
          ...item,
          targetTitle: target?.title ?? '(deleted)',
          targetSlug: target?.slug ?? '',
        };
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

        // Same registry the public route uses, so portfolio/showcase (and any
        // future type) chains are detected instead of being looked up in cmsPosts.
        const resolvedSlug = await resolveCurrentSlug(
          ctx.db,
          next.contentType,
          next.contentId
        );

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
