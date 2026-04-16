import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';
import {
  SEO_OVERRIDE_ROUTES,
  SEO_OVERRIDE_SLUGS,
} from '@/core/lib/seo-routes';
import { cmsPosts, cmsCategories, cmsTerms, cmsTermRelationships } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';
import {
  getTermRelationships,
  resolveTagsForPosts,
} from '@/core/crud/taxonomy-helpers';
import {
  createTRPCRouter,
  publicProcedure,
} from '../../trpc';
import { contentProcedure } from './_shared';

export const cmsPublicRouter = createTRPCRouter({
  /** Public: get a published post by slug (supports preview token) */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        type: z.number().int().min(1),
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        previewToken: z.string().max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.previewToken) {
        const [post] = await ctx.db
          .select()
          .from(cmsPosts)
          .where(
            and(
              eq(cmsPosts.slug, input.slug),
              eq(cmsPosts.type, input.type),
              eq(cmsPosts.lang, input.lang),
              eq(cmsPosts.previewToken, input.previewToken),
              isNull(cmsPosts.deletedAt)
            )
          )
          .limit(1);

        if (!post) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
        }
        const { previewToken: _pt, ...rest } = post;
        return rest;
      }

      const [post] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.slug, input.slug),
            eq(cmsPosts.type, input.type),
            eq(cmsPosts.lang, input.lang),
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }
      const { previewToken: _pt, ...rest } = post;
      return rest;
    }),

  /** Public: list published posts (optional category or tag filter) */
  listPublished: publicProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        categoryId: z.string().uuid().optional(),
        tagId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const baseConditions = and(
        eq(cmsPosts.type, input.type),
        eq(cmsPosts.lang, input.lang),
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        isNull(cmsPosts.deletedAt)
      );

      // Filter by taxonomy term (category or tag)
      const termFilter = input.categoryId
        ? { taxonomyId: 'category', termId: input.categoryId }
        : input.tagId
          ? { taxonomyId: 'tag', termId: input.tagId }
          : null;

      if (termFilter) {
        const allColumns = {
          id: cmsPosts.id,
          type: cmsPosts.type,
          status: cmsPosts.status,
          lang: cmsPosts.lang,
          slug: cmsPosts.slug,
          title: cmsPosts.title,
          content: cmsPosts.content,
          metaDescription: cmsPosts.metaDescription,
          seoTitle: cmsPosts.seoTitle,
          featuredImage: cmsPosts.featuredImage,
          featuredImageAlt: cmsPosts.featuredImageAlt,
          jsonLd: cmsPosts.jsonLd,
          noindex: cmsPosts.noindex,
          publishedAt: cmsPosts.publishedAt,
          translationGroup: cmsPosts.translationGroup,
          fallbackToDefault: cmsPosts.fallbackToDefault,
          authorId: cmsPosts.authorId,
          createdAt: cmsPosts.createdAt,
          updatedAt: cmsPosts.updatedAt,
          deletedAt: cmsPosts.deletedAt,
        };

        const joinCondition = and(
          eq(cmsPosts.id, cmsTermRelationships.objectId),
          eq(cmsTermRelationships.taxonomyId, termFilter.taxonomyId),
          eq(cmsTermRelationships.termId, termFilter.termId)
        );

        const [items, countResult] = await Promise.all([
          ctx.db
            .select(allColumns)
            .from(cmsPosts)
            .innerJoin(cmsTermRelationships, joinCondition)
            .where(baseConditions)
            .orderBy(desc(cmsPosts.publishedAt))
            .offset(offset)
            .limit(input.pageSize),
          ctx.db
            .select({ count: sql<number>`count(*)` })
            .from(cmsPosts)
            .innerJoin(cmsTermRelationships, joinCondition)
            .where(baseConditions),
        ]);

        const total = Number(countResult[0]?.count ?? 0);
        const resultsWithTags = await resolveTagsForPosts(ctx.db, items);
        return {
          results: resultsWithTags,
          total,
          page: input.page,
          pageSize: input.pageSize,
          totalPages: Math.ceil(total / input.pageSize),
        };
      }

      const [items, countResult] = await Promise.all([
        ctx.db
          .select({
            id: cmsPosts.id,
            type: cmsPosts.type,
            status: cmsPosts.status,
            lang: cmsPosts.lang,
            slug: cmsPosts.slug,
            title: cmsPosts.title,
            content: cmsPosts.content,
            metaDescription: cmsPosts.metaDescription,
            seoTitle: cmsPosts.seoTitle,
            featuredImage: cmsPosts.featuredImage,
            featuredImageAlt: cmsPosts.featuredImageAlt,
            jsonLd: cmsPosts.jsonLd,
            noindex: cmsPosts.noindex,
            publishedAt: cmsPosts.publishedAt,
            translationGroup: cmsPosts.translationGroup,
            fallbackToDefault: cmsPosts.fallbackToDefault,
            authorId: cmsPosts.authorId,
            createdAt: cmsPosts.createdAt,
            updatedAt: cmsPosts.updatedAt,
            deletedAt: cmsPosts.deletedAt,
          })
          .from(cmsPosts)
          .where(baseConditions)
          .orderBy(desc(cmsPosts.publishedAt))
          .offset(offset)
          .limit(input.pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPosts)
          .where(baseConditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      const resultsWithTags = await resolveTagsForPosts(ctx.db, items);
      return {
        results: resultsWithTags,
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  /** Status of all SEO override routes × locales (exists or missing) */
  getSeoOverrideStatus: contentProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db
      .select({ slug: cmsPosts.slug, lang: cmsPosts.lang })
      .from(cmsPosts)
      .where(eq(cmsPosts.type, PostType.PAGE));

    const existingKeys = new Set(existing.map((p) => `${p.lang}:${p.slug}`));

    const result: { slug: string; label: string; lang: string; exists: boolean }[] = [];
    for (const route of SEO_OVERRIDE_ROUTES) {
      for (const lang of LOCALES) {
        result.push({
          slug: route.slug,
          label: route.label,
          lang,
          exists: existingKeys.has(`${lang}:${route.slug}`),
        });
      }
    }
    return result;
  }),

  /** Create SEO override pages for selected coded routes × locales */
  createMissingSeoOverrides: contentProcedure
    .input(
      z.object({
        routes: z
          .array(
            z.object({
              slug: z.string().max(255),
              label: z.string().max(255),
              lang: z.string().max(2),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;

      for (const route of input.routes) {
        if (!SEO_OVERRIDE_SLUGS.has(route.slug)) continue;

        // Check if row exists (include soft-deleted to avoid re-creating trashed overrides)
        const [existing] = await ctx.db
          .select({ id: cmsPosts.id })
          .from(cmsPosts)
          .where(
            and(
              eq(cmsPosts.type, PostType.PAGE),
              eq(cmsPosts.slug, route.slug),
              eq(cmsPosts.lang, route.lang)
            )
          )
          .limit(1);

        if (existing) continue;

        const previewToken = crypto.randomBytes(32).toString('hex');
        await ctx.db.insert(cmsPosts).values({
          type: PostType.PAGE,
          status: ContentStatus.DRAFT,
          title: route.label,
          slug: route.slug,
          lang: route.lang,
          content: '',
          noindex: false,
          previewToken,
          authorId: ctx.session.user.id,
        });
        created++;
      }

      return { created };
    }),

  /** Public: get related posts by shared tags */
  getRelatedPosts: publicProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        limit: z.number().int().min(1).max(10).default(4),
      })
    )
    .query(async ({ ctx, input }) => {
      // Get this post's tag IDs
      const tagRels = await getTermRelationships(ctx.db, input.postId, 'tag');
      const tagIds = tagRels.map((r) => r.termId);

      if (tagIds.length === 0) return [];

      // Find posts sharing these tags, ordered by shared tag count
      const related = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          type: cmsPosts.type,
          metaDescription: cmsPosts.metaDescription,
          publishedAt: cmsPosts.publishedAt,
          sharedTagCount:
            sql<number>`count(${cmsTermRelationships.termId})`.as('shared_tag_count'),
        })
        .from(cmsPosts)
        .innerJoin(
          cmsTermRelationships,
          and(
            eq(cmsPosts.id, cmsTermRelationships.objectId),
            eq(cmsTermRelationships.taxonomyId, 'tag'),
            inArray(cmsTermRelationships.termId, tagIds)
          )
        )
        .where(
          and(
            ne(cmsPosts.id, input.postId),
            eq(cmsPosts.lang, input.lang),
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .groupBy(
          cmsPosts.id,
          cmsPosts.title,
          cmsPosts.slug,
          cmsPosts.type,
          cmsPosts.metaDescription,
          cmsPosts.publishedAt
        )
        .orderBy(desc(sql`count(${cmsTermRelationships.termId})`))
        .limit(input.limit);

      return related;
    }),
});
