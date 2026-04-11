import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { env } from '@/lib/env';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { createLogger } from '@/core/lib/infra/logger';
import { cmsPortfolio, cmsTermRelationships } from '@/server/db/schema';
import { createFieldTranslator } from '@/server/translation/translate-fields';
import { ContentStatus } from '@/core/types/cms';
import {
  buildAdminList,
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
  fetchOrNotFound,
  generateCopySlug,
  updateContentStatus,
  getTranslationSiblings,
  serializeExport,
  parsePagination,
  paginatedResult,
  prepareTranslationCopy,
} from '@/core/crud/admin-crud';
import { adminListInput, exportBulkInput } from '@/core/crud/router-schemas';
import { updateWithRevision } from '@/core/crud/cms-helpers';
import {
  deleteAllTermRelationships,
  getTermRelationships,
  syncTermRelationships,
} from '@/core/crud/taxonomy-helpers';
import { logAudit } from '@/core/lib/infra/audit';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const logger = createLogger('portfolio-router');
const contentProcedure = sectionProcedure('content');

const PORTFOLIO_SNAPSHOT_KEYS = [
  'name',
  'slug',
  'title',
  'content',
  'status',
  'metaDescription',
  'seoTitle',
  'noindex',
  'publishedAt',
  'lang',
  'clientName',
  'projectUrl',
  'techStack',
  'completedAt',
  'featuredImage',
  'featuredImageAlt',
] as const;

const crudCols = {
  table: cmsPortfolio,
  id: cmsPortfolio.id,
  deleted_at: cmsPortfolio.deletedAt,
};

export const portfolioRouter = createTRPCRouter({
  list: contentProcedure
    .input(adminListInput)
    .query(async ({ ctx, input }) => {
      return buildAdminList(
        {
          db: ctx.db,
          cols: {
            table: cmsPortfolio,
            id: cmsPortfolio.id,
            deleted_at: cmsPortfolio.deletedAt,
            lang: cmsPortfolio.lang,
            translation_group: cmsPortfolio.translationGroup,
          },
          input,
          searchColumns: [cmsPortfolio.name, cmsPortfolio.slug],
          sortColumns: {
            title: cmsPortfolio.name,
            name: cmsPortfolio.name,
            created_at: cmsPortfolio.createdAt,
            updated_at: cmsPortfolio.updatedAt,
          },
          defaultSort: 'updated_at',
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsPortfolio)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  counts: contentProcedure.query(async ({ ctx }) => {
    return buildStatusCounts(ctx.db, {
      table: cmsPortfolio,
      status: cmsPortfolio.status,
      deleted_at: cmsPortfolio.deletedAt,
    });
  }),

  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await fetchOrNotFound<typeof cmsPortfolio.$inferSelect>(
        ctx.db, cmsPortfolio, input.id, 'Portfolio item'
      );

      const rels = await getTermRelationships(ctx.db, item.id, 'tag');
      const tagIds = rels.map((r) => r.termId);

      return { ...item, tagIds };
    }),

  create: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(255),
        lang: z.string().min(2).max(2),
        title: z.string().min(1).max(255),
        content: z.string().default(''),
        status: z.number().int().default(ContentStatus.DRAFT),
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(255).optional(),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        featuredImage: z.string().optional(),
        featuredImageAlt: z.string().max(255).optional(),
        clientName: z.string().max(255).optional(),
        projectUrl: z.string().max(1024).optional(),
        techStack: z.array(z.string().max(100)).max(20).optional(),
        completedAt: z.string().datetime().optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...itemInput } = input;

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsPortfolio,
          slugCol: cmsPortfolio.slug,
          slug: itemInput.slug,
          langCol: cmsPortfolio.lang,
          lang: itemInput.lang,
          deletedAtCol: cmsPortfolio.deletedAt,
        },
        'Portfolio item'
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [item] = await ctx.db
        .insert(cmsPortfolio)
        .values({
          name: itemInput.name,
          slug: itemInput.slug,
          lang: itemInput.lang,
          title: itemInput.title,
          content: itemInput.content,
          status: itemInput.status,
          metaDescription: itemInput.metaDescription ?? null,
          seoTitle: itemInput.seoTitle ?? null,
          noindex: itemInput.noindex,
          publishedAt: itemInput.publishedAt ? new Date(itemInput.publishedAt) : null,
          previewToken,
          translationGroup: itemInput.translationGroup ?? null,
          fallbackToDefault: itemInput.fallbackToDefault ?? null,
          featuredImage: itemInput.featuredImage ?? null,
          featuredImageAlt: itemInput.featuredImageAlt ?? null,
          clientName: itemInput.clientName ?? null,
          projectUrl: itemInput.projectUrl ?? null,
          techStack: itemInput.techStack ?? [],
          completedAt: itemInput.completedAt ? new Date(itemInput.completedAt) : null,
        })
        .returning();

      if (tagIds?.length && item) {
        await syncTermRelationships(ctx.db, item.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'portfolio',
        entityId: item!.id,
        entityTitle: item!.name,
      });

      return item!;
    }),

  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const original = await fetchOrNotFound<typeof cmsPortfolio.$inferSelect>(
        ctx.db, cmsPortfolio, input.id, 'Portfolio item'
      );

      const copySlug = await generateCopySlug(
        ctx.db, cmsPortfolio, cmsPortfolio.slug, cmsPortfolio.deletedAt,
        original.slug, cmsPortfolio.lang, original.lang,
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [copy] = await ctx.db
        .insert(cmsPortfolio)
        .values({
          name: original.name + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          title: original.title + ' (Copy)',
          content: original.content,
          status: ContentStatus.DRAFT,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          featuredImage: original.featuredImage,
          featuredImageAlt: original.featuredImageAlt,
          clientName: original.clientName,
          projectUrl: original.projectUrl,
          techStack: original.techStack,
          completedAt: original.completedAt,
        })
        .returning();

      // Copy taxonomy relationships (tags)
      const originalRels = await getTermRelationships(ctx.db, input.id);
      const tagIds = originalRels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);
      if (tagIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'portfolio',
        entityId: copy!.id,
        entityTitle: copy!.name,
        metadata: { originalId: input.id },
      });

      return copy!;
    }),

  duplicateAsTranslation: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        targetLang: z.string().min(2).max(5),
        autoTranslate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await fetchOrNotFound<typeof cmsPortfolio.$inferSelect>(
        ctx.db, cmsPortfolio, input.id, 'Portfolio item'
      );

      let name = source.name;
      let title = source.title;
      let content = source.content;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;
      let featuredImageAlt = source.featuredImageAlt;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? DEFAULT_LOCALE;
        const tl = input.targetLang;
        const safe = createFieldTranslator(tl, sl, logger);
        [name, title, content, metaDescription, seoTitle, featuredImageAlt] = await Promise.all([
          safe('name', name),
          safe('title', title),
          safe('text', content),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
          safe('featuredImageAlt', featuredImageAlt),
        ]);
      }

      const { slug, translationGroup, previewToken } = await prepareTranslationCopy(
        ctx.db, cmsPortfolio,
        { id: cmsPortfolio.id, slug: cmsPortfolio.slug, lang: cmsPortfolio.lang, deletedAt: cmsPortfolio.deletedAt, translationGroup: cmsPortfolio.translationGroup },
        input.id, source.slug, source.translationGroup, input.targetLang,
      );

      const [newItem] = await ctx.db
        .insert(cmsPortfolio)
        .values({
          name,
          slug,
          lang: input.targetLang,
          title,
          content,
          status: ContentStatus.DRAFT,
          metaDescription,
          seoTitle,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          featuredImage: source.featuredImage,
          featuredImageAlt,
          clientName: source.clientName,
          projectUrl: source.projectUrl,
          techStack: source.techStack,
          completedAt: source.completedAt,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'portfolio',
        entityId: newItem!.id,
        entityTitle: newItem!.name,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newItem!.id, slug: newItem!.slug };
    }),

  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getTranslationSiblings(
        ctx.db, cmsPortfolio,
        cmsPortfolio.id, cmsPortfolio.translationGroup, cmsPortfolio.lang,
        cmsPortfolio.slug, cmsPortfolio.deletedAt, input.id,
      );
    }),

  exportBulk: contentProcedure
    .input(exportBulkInput)
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select({
          id: cmsPortfolio.id,
          name: cmsPortfolio.name,
          slug: cmsPortfolio.slug,
          title: cmsPortfolio.title,
          content: cmsPortfolio.content,
          status: cmsPortfolio.status,
          lang: cmsPortfolio.lang,
          metaDescription: cmsPortfolio.metaDescription,
          seoTitle: cmsPortfolio.seoTitle,
          clientName: cmsPortfolio.clientName,
          projectUrl: cmsPortfolio.projectUrl,
          techStack: cmsPortfolio.techStack,
          completedAt: cmsPortfolio.completedAt,
          publishedAt: cmsPortfolio.publishedAt,
          createdAt: cmsPortfolio.createdAt,
          updatedAt: cmsPortfolio.updatedAt,
        })
        .from(cmsPortfolio)
        .where(inArray(cmsPortfolio.id, input.ids));

      const headers = ['id', 'name', 'slug', 'title', 'status', 'lang', 'clientName', 'projectUrl', 'techStack', 'completedAt', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'content'];
      return serializeExport(items as Record<string, unknown>[], headers, input.format);
    }),

  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(255).optional(),
        title: z.string().min(1).max(255).optional(),
        content: z.string().optional(),
        status: z.number().int().optional(),
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(255).optional().nullable(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        featuredImage: z.string().optional().nullable(),
        featuredImageAlt: z.string().max(255).optional().nullable(),
        clientName: z.string().max(255).optional().nullable(),
        projectUrl: z.string().max(1024).optional().nullable(),
        techStack: z.array(z.string().max(100)).max(20).optional(),
        completedAt: z.string().datetime().optional().nullable(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...updates } = input;

      const existing = await fetchOrNotFound<typeof cmsPortfolio.$inferSelect>(
        ctx.db, cmsPortfolio, id, 'Portfolio item'
      );

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsPortfolio,
            slugCol: cmsPortfolio.slug,
            slug: updates.slug,
            idCol: cmsPortfolio.id,
            excludeId: id,
            langCol: cmsPortfolio.lang,
            lang: existing.lang,
            deletedAtCol: cmsPortfolio.deletedAt,
          },
          'Portfolio item'
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: 'portfolio',
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...PORTFOLIO_SNAPSHOT_KEYS],
        userId: ctx.session.user.id,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: '/portfolio/',
        doUpdate: async (db) => {
          await db
            .update(cmsPortfolio)
            .set({
              ...updates,
              publishedAt:
                updates.publishedAt !== undefined
                  ? updates.publishedAt
                    ? new Date(updates.publishedAt)
                    : null
                  : undefined,
              completedAt:
                updates.completedAt !== undefined
                  ? updates.completedAt
                    ? new Date(updates.completedAt)
                    : null
                  : undefined,
              updatedAt: new Date(),
            })
            .where(eq(cmsPortfolio.id, id));
        },
      });

      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'portfolio',
        entityId: id,
        entityTitle: updates.name ?? existing.name,
      });

      return { success: true };
    }),

  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateContentStatus(
        ctx.db, cmsPortfolio,
        cmsPortfolio.id, cmsPortfolio.status, cmsPortfolio.publishedAt, cmsPortfolio.updatedAt,
        input.id, input.status, 'Portfolio item',
      );

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action,
        entityType: 'portfolio',
        entityId: input.id,
      });

      return { success: true };
    }),

  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softDelete(ctx.db, crudCols, input.id);
      return { success: true };
    }),

  restore: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softRestore(ctx.db, crudCols, input.id);
      return { success: true };
    }),

  permanentDelete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await permanentDelete(ctx.db, crudCols, input.id, 'portfolio', async (tx) => {
        await deleteAllTermRelationships(tx, input.id);
      });
      return { success: true };
    }),

  /** Public: get a published portfolio item by slug */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        previewToken: z.string().max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // If preview token provided, find by slug + token (any status)
      if (input.previewToken) {
        const [item] = await ctx.db
          .select()
          .from(cmsPortfolio)
          .where(
            and(
              eq(cmsPortfolio.slug, input.slug),
              eq(cmsPortfolio.lang, input.lang),
              eq(cmsPortfolio.previewToken, input.previewToken),
              isNull(cmsPortfolio.deletedAt)
            )
          )
          .limit(1);

        if (item) {
          const { previewToken: _pt, ...rest } = item;
          return rest;
        }
      }

      const [item] = await ctx.db
        .select()
        .from(cmsPortfolio)
        .where(
          and(
            eq(cmsPortfolio.slug, input.slug),
            eq(cmsPortfolio.lang, input.lang),
            eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
            isNull(cmsPortfolio.deletedAt)
          )
        )
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Portfolio item not found',
        });
      }
      const { previewToken: _pt, ...rest } = item;
      return rest;
    }),

  /** Public: list published portfolio items (optional tag filter) */
  listPublished: publicProcedure
    .input(
      z.object({
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        tagId: z.string().uuid().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input, 100);

      const baseConditions = and(
        eq(cmsPortfolio.lang, input.lang),
        eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
        isNull(cmsPortfolio.deletedAt)
      );

      // Filter by tag via term relationships join
      if (input.tagId) {
        const joinCondition = and(
          eq(cmsPortfolio.id, cmsTermRelationships.objectId),
          eq(cmsTermRelationships.taxonomyId, 'tag'),
          eq(cmsTermRelationships.termId, input.tagId)
        );

        const allColumns = {
          id: cmsPortfolio.id,
          name: cmsPortfolio.name,
          slug: cmsPortfolio.slug,
          lang: cmsPortfolio.lang,
          title: cmsPortfolio.title,
          content: cmsPortfolio.content,
          status: cmsPortfolio.status,
          metaDescription: cmsPortfolio.metaDescription,
          seoTitle: cmsPortfolio.seoTitle,
          noindex: cmsPortfolio.noindex,
          publishedAt: cmsPortfolio.publishedAt,
          translationGroup: cmsPortfolio.translationGroup,
          fallbackToDefault: cmsPortfolio.fallbackToDefault,
          featuredImage: cmsPortfolio.featuredImage,
          featuredImageAlt: cmsPortfolio.featuredImageAlt,
          clientName: cmsPortfolio.clientName,
          projectUrl: cmsPortfolio.projectUrl,
          techStack: cmsPortfolio.techStack,
          completedAt: cmsPortfolio.completedAt,
          createdAt: cmsPortfolio.createdAt,
          updatedAt: cmsPortfolio.updatedAt,
          deletedAt: cmsPortfolio.deletedAt,
        };

        const [items, countResult] = await Promise.all([
          ctx.db
            .select(allColumns)
            .from(cmsPortfolio)
            .innerJoin(cmsTermRelationships, joinCondition)
            .where(baseConditions)
            .orderBy(desc(cmsPortfolio.completedAt))
            .offset(offset)
            .limit(pageSize),
          ctx.db
            .select({ count: sql<number>`count(*)` })
            .from(cmsPortfolio)
            .innerJoin(cmsTermRelationships, joinCondition)
            .where(baseConditions),
        ]);

        const total = Number(countResult[0]?.count ?? 0);
        return paginatedResult(items, total, page, pageSize);
      }

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsPortfolio)
          .where(baseConditions)
          .orderBy(desc(cmsPortfolio.completedAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPortfolio)
          .where(baseConditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      return paginatedResult(
        items.map(({ previewToken: _pt, ...rest }) => rest),
        total,
        page,
        pageSize,
      );
    }),
});
