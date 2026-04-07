import { z } from 'zod';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { cmsPosts } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { cmsPortfolio } from '@/server/db/schema/portfolio';
import { cmsShowcase } from '@/server/db/schema/showcase';
import { cmsTerms } from '@/server/db/schema/terms';
import { ContentStatus } from '@/core/types/cms';
import { CONTENT_TYPES } from '@/config/cms';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { ilikePattern } from '@/core/crud/drizzle-utils';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '../trpc';

/**
 * Content search router — search across all content types for internal linking.
 * Used by the rich text editor's link picker to find pages/posts/categories.
 */
export const contentSearchRouter = createTRPCRouter({
  /**
   * Search across all published content types.
   * Returns a unified list of { type, id, title, url } results.
   */
  search: sectionProcedure('content')
    .input(
      z.object({
        query: z.string().min(1).max(200),
        lang: z.string().max(5).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, limit, lang } = input;
      const pattern = ilikePattern(query);

      type SearchResult = {
        type: string;
        id: string;
        title: string;
        url: string;
      };

      const results: SearchResult[] = [];

      // Run all 4 content type queries in parallel
      const [posts, categories, tags, portfolioItems, showcaseItems] = await Promise.all([
        // Search posts (pages + blogs)
        ctx.db
          .select({
            id: cmsPosts.id,
            type: cmsPosts.type,
            slug: cmsPosts.slug,
            title: cmsPosts.title,
          })
          .from(cmsPosts)
          .where(
            and(
              eq(cmsPosts.status, ContentStatus.PUBLISHED),
              isNull(cmsPosts.deletedAt),
              ...(lang ? [eq(cmsPosts.lang, lang)] : []),
              or(
                ilike(cmsPosts.title, pattern),
                ilike(cmsPosts.slug, pattern)
              )
            )
          )
          .limit(limit),

        // Search categories
        ctx.db
          .select({
            id: cmsCategories.id,
            slug: cmsCategories.slug,
            name: cmsCategories.name,
          })
          .from(cmsCategories)
          .where(
            and(
              eq(cmsCategories.status, ContentStatus.PUBLISHED),
              isNull(cmsCategories.deletedAt),
              ...(lang ? [eq(cmsCategories.lang, lang)] : []),
              or(
                ilike(cmsCategories.name, pattern),
                ilike(cmsCategories.slug, pattern)
              )
            )
          )
          .limit(limit),

        // Search tags
        ctx.db
          .select({
            id: cmsTerms.id,
            slug: cmsTerms.slug,
            name: cmsTerms.name,
          })
          .from(cmsTerms)
          .where(
            and(
              eq(cmsTerms.taxonomyId, 'tag'),
              eq(cmsTerms.status, ContentStatus.PUBLISHED),
              isNull(cmsTerms.deletedAt),
              ...(lang ? [eq(cmsTerms.lang, lang)] : []),
              or(
                ilike(cmsTerms.name, pattern),
                ilike(cmsTerms.slug, pattern)
              )
            )
          )
          .limit(limit),

        // Search portfolio
        ctx.db
          .select({
            id: cmsPortfolio.id,
            slug: cmsPortfolio.slug,
            name: cmsPortfolio.name,
          })
          .from(cmsPortfolio)
          .where(
            and(
              eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
              isNull(cmsPortfolio.deletedAt),
              ...(lang ? [eq(cmsPortfolio.lang, lang)] : []),
              or(
                ilike(cmsPortfolio.name, pattern),
                ilike(cmsPortfolio.slug, pattern)
              )
            )
          )
          .limit(limit),

        // Search showcase
        ctx.db
          .select({
            id: cmsShowcase.id,
            slug: cmsShowcase.slug,
            title: cmsShowcase.title,
          })
          .from(cmsShowcase)
          .where(
            and(
              eq(cmsShowcase.status, ContentStatus.PUBLISHED),
              isNull(cmsShowcase.deletedAt),
              ...(lang ? [eq(cmsShowcase.lang, lang)] : []),
              or(
                ilike(cmsShowcase.title, pattern),
                ilike(cmsShowcase.slug, pattern)
              )
            )
          )
          .limit(limit),
      ]);

      for (const post of posts) {
        const ct = CONTENT_TYPES.find((c) => c.postType === post.type);
        if (!ct) continue;
        const url =
          ct.urlPrefix === '/'
            ? `/${post.slug}`
            : `${ct.urlPrefix}${post.slug}`;
        results.push({
          type: ct.id,
          id: post.id,
          title: post.title,
          url,
        });
      }

      for (const cat of categories) {
        results.push({
          type: 'category',
          id: cat.id,
          title: cat.name,
          url: `/category/${cat.slug}`,
        });
      }

      for (const tag of tags) {
        results.push({
          type: 'tag',
          id: tag.id,
          title: tag.name,
          url: `/tag/${tag.slug}`,
        });
      }

      for (const item of portfolioItems) {
        results.push({
          type: 'portfolio',
          id: item.id,
          title: item.name,
          url: `/portfolio/${item.slug}`,
        });
      }

      for (const item of showcaseItems) {
        results.push({
          type: 'showcase',
          id: item.id,
          title: item.title,
          url: `/showcase/${item.slug}`,
        });
      }

      // Sort by relevance (exact title match first, then alphabetical)
      const lowerQuery = query.toLowerCase();
      results.sort((a, b) => {
        const aExact = a.title.toLowerCase() === lowerQuery ? 0 : 1;
        const bExact = b.title.toLowerCase() === lowerQuery ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.title.localeCompare(b.title);
      });

      return results.slice(0, limit);
    }),

  /** Public: full-text search across published posts */
  fullTextSearch: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        lang: z.string().max(2).default('en'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      // For very short queries, fall back to ILIKE
      if (input.query.length < 3) {
        const pattern = ilikePattern(input.query);
        const conditions = and(
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          eq(cmsPosts.lang, input.lang),
          isNull(cmsPosts.deletedAt),
          or(
            ilike(cmsPosts.title, pattern),
            ilike(cmsPosts.content, pattern)
          )
        );

        const [items, countResult] = await Promise.all([
          ctx.db
            .select({
              id: cmsPosts.id,
              title: cmsPosts.title,
              slug: cmsPosts.slug,
              type: cmsPosts.type,
              metaDescription: cmsPosts.metaDescription,
              publishedAt: cmsPosts.publishedAt,
            })
            .from(cmsPosts)
            .where(conditions)
            .orderBy(desc(cmsPosts.publishedAt))
            .offset(offset)
            .limit(pageSize),
          ctx.db
            .select({ count: sql<number>`count(*)` })
            .from(cmsPosts)
            .where(conditions),
        ]);

        const total = Number(countResult[0]?.count ?? 0);
        const results = items.map((item) => {
          const ct = CONTENT_TYPES.find((c) => c.postType === item.type);
          const url = ct
            ? ct.urlPrefix === '/' ? `/${item.slug}` : `${ct.urlPrefix}${item.slug}`
            : `/${item.slug}`;
          return { ...item, url, headline: item.metaDescription ?? '' };
        });
        return paginatedResult(results, total, page, pageSize);
      }

      // Full-text search with tsvector (language-aware via cms_ts_config)
      const tsConfig = sql`cms_ts_config(${input.lang})`;
      const tsQuery = sql`plainto_tsquery(${tsConfig}, ${input.query})`;
      const conditions = and(
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        eq(cmsPosts.lang, input.lang),
        isNull(cmsPosts.deletedAt),
        sql`${cmsPosts.searchVector} @@ ${tsQuery}`
      );

      const [items, countResult] = await Promise.all([
        ctx.db
          .select({
            id: cmsPosts.id,
            title: cmsPosts.title,
            slug: cmsPosts.slug,
            type: cmsPosts.type,
            metaDescription: cmsPosts.metaDescription,
            publishedAt: cmsPosts.publishedAt,
            rank: sql<number>`ts_rank(${cmsPosts.searchVector}, ${tsQuery})`.as('rank'),
            headline: sql<string>`ts_headline(${tsConfig}, regexp_replace(coalesce(${cmsPosts.content}, ''), '<[^>]*>', '', 'g'), ${tsQuery}, 'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>')`.as('headline'),
          })
          .from(cmsPosts)
          .where(conditions)
          .orderBy(desc(sql`ts_rank(${cmsPosts.searchVector}, ${tsQuery})`))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPosts)
          .where(conditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      const results = items.map((item) => {
        const ct = CONTENT_TYPES.find((c) => c.postType === item.type);
        const url = ct
          ? ct.urlPrefix === '/' ? `/${item.slug}` : `${ct.urlPrefix}${item.slug}`
          : `/${item.slug}`;
        return { ...item, url };
      });
      return paginatedResult(results, total, page, pageSize);
    }),
});
