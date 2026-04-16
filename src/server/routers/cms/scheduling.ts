import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';

import { cmsPosts, cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { createTRPCRouter } from '../../trpc';
import { contentProcedure } from './_shared';

export const cmsSchedulingRouter = createTRPCRouter({
  /** List upcoming scheduled posts (next to auto-publish) */
  upcomingScheduled: contentProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      return ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          postType: cmsPosts.type,
          publishedAt: cmsPosts.publishedAt,
          lang: cmsPosts.lang,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.status, ContentStatus.SCHEDULED),
            gte(cmsPosts.publishedAt, now),
            isNull(cmsPosts.deletedAt)
          )
        )
        .orderBy(asc(cmsPosts.publishedAt))
        .limit(input.limit);
    }),

  /** Get full data for a scheduled post (for preview before publish) */
  scheduledPreview: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.id, input.id),
            eq(cmsPosts.status, ContentStatus.SCHEDULED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Scheduled post not found',
        });
      }

      return post;
    }),

  /** Calendar events: posts + categories with publishedAt in a given month */
  calendarEvents: contentProcedure
    .input(z.object({
      month: z.number().int().min(1).max(12),
      year: z.number().int().min(2000).max(2100),
      lang: z.string().max(10).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const startDate = new Date(input.year, input.month - 1, 1);
      const endDate = new Date(input.year, input.month, 0, 23, 59, 59);

      const conditions = [
        isNotNull(cmsPosts.publishedAt),
        gte(cmsPosts.publishedAt, startDate),
        lte(cmsPosts.publishedAt, endDate),
        isNull(cmsPosts.deletedAt),
      ];
      if (input.lang) conditions.push(eq(cmsPosts.lang, input.lang));

      const posts = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          type: cmsPosts.type,
          status: cmsPosts.status,
          slug: cmsPosts.slug,
          publishedAt: cmsPosts.publishedAt,
        })
        .from(cmsPosts)
        .where(and(...conditions))
        .limit(500);

      // Also get categories
      const catConditions = [
        isNotNull(cmsCategories.publishedAt),
        gte(cmsCategories.publishedAt, startDate),
        lte(cmsCategories.publishedAt, endDate),
        isNull(cmsCategories.deletedAt),
      ];
      if (input.lang) catConditions.push(eq(cmsCategories.lang, input.lang));

      const cats = await ctx.db
        .select({
          id: cmsCategories.id,
          title: cmsCategories.name,
          status: cmsCategories.status,
          slug: cmsCategories.slug,
          publishedAt: cmsCategories.publishedAt,
        })
        .from(cmsCategories)
        .where(and(...catConditions))
        .limit(200);

      return [
        ...posts.map(p => ({ ...p, contentType: 'post' as const })),
        ...cats.map(c => ({ ...c, type: null, contentType: 'category' as const })),
      ];
    }),
});
