import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { env } from '@/lib/env';
import { createLogger } from '@/core/lib/infra/logger';
import { cmsCategories } from '@/server/db/schema';
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
  deleteTermRelationshipsByTerm,
  getTermRelationships,
  syncTermRelationships,
} from '@/core/crud/taxonomy-helpers';
import { logAudit } from '@/core/lib/infra/audit';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const logger = createLogger('categories-router');
const contentProcedure = sectionProcedure('content');

const CATEGORY_SNAPSHOT_KEYS = [
  'name',
  'slug',
  'title',
  'content',
  'status',
  'metaDescription',
  'seoTitle',
  'icon',
  'order',
  'noindex',
  'publishedAt',
  'lang',
] as const;

const crudCols = {
  table: cmsCategories,
  id: cmsCategories.id,
  deleted_at: cmsCategories.deletedAt,
};

export const categoriesRouter = createTRPCRouter({
  list: contentProcedure
    .input(adminListInput)
    .query(async ({ ctx, input }) => {
      return buildAdminList(
        {
          db: ctx.db,
          cols: {
            table: cmsCategories,
            id: cmsCategories.id,
            deleted_at: cmsCategories.deletedAt,
            lang: cmsCategories.lang,
            translation_group: cmsCategories.translationGroup,
          },
          input,
          searchColumns: [cmsCategories.name, cmsCategories.slug],
          sortColumns: {
            name: cmsCategories.name,
            order: cmsCategories.order,
            created_at: cmsCategories.createdAt,
            updated_at: cmsCategories.updatedAt,
          },
          defaultSort: 'updated_at',
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsCategories)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  counts: contentProcedure.query(async ({ ctx }) => {
    return buildStatusCounts(ctx.db, {
      table: cmsCategories,
      status: cmsCategories.status,
      deleted_at: cmsCategories.deletedAt,
    });
  }),

  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const category = await fetchOrNotFound<typeof cmsCategories.$inferSelect>(
        ctx.db, cmsCategories, input.id, 'Category'
      );

      const rels = await getTermRelationships(ctx.db, category.id, 'tag');
      const tagIds = rels.map((r) => r.termId);

      return { ...category, tagIds };
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
        icon: z.string().max(255).optional(),
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(255).optional(),
        order: z.number().int().default(0),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        jsonLd: z.string().max(10000).optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...catInput } = input;

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsCategories,
          slugCol: cmsCategories.slug,
          slug: catInput.slug,
          langCol: cmsCategories.lang,
          lang: catInput.lang,
          deletedAtCol: cmsCategories.deletedAt,
        },
        'Category'
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [category] = await ctx.db
        .insert(cmsCategories)
        .values({
          name: catInput.name,
          slug: catInput.slug,
          lang: catInput.lang,
          title: catInput.title,
          content: catInput.content,
          status: catInput.status,
          icon: catInput.icon ?? null,
          metaDescription: catInput.metaDescription ?? null,
          seoTitle: catInput.seoTitle ?? null,
          order: catInput.order,
          noindex: catInput.noindex,
          publishedAt: catInput.publishedAt ? new Date(catInput.publishedAt) : null,
          previewToken,
          translationGroup: catInput.translationGroup ?? null,
          fallbackToDefault: catInput.fallbackToDefault ?? null,
          jsonLd: catInput.jsonLd ?? null,
        })
        .returning();

      if (tagIds?.length && category) {
        await syncTermRelationships(ctx.db, category.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'category',
        entityId: category!.id,
        entityTitle: category!.name,
      });

      return category!;
    }),

  /** Duplicate a category */
  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const original = await fetchOrNotFound<typeof cmsCategories.$inferSelect>(
        ctx.db, cmsCategories, input.id, 'Category'
      );

      const copySlug = await generateCopySlug(
        ctx.db, cmsCategories, cmsCategories.slug, cmsCategories.deletedAt,
        original.slug, cmsCategories.lang, original.lang,
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [copy] = await ctx.db
        .insert(cmsCategories)
        .values({
          name: original.name + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          title: original.title + ' (Copy)',
          content: original.content,
          status: ContentStatus.DRAFT,
          icon: original.icon,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          order: original.order,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          jsonLd: original.jsonLd,
        })
        .returning();

      // Copy taxonomy relationships (tags) from the original
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
        entityType: 'category',
        entityId: copy!.id,
        entityTitle: copy!.name,
        metadata: { originalId: input.id },
      });

      return copy!;
    }),

  /** Duplicate a category as a translation in another language */
  duplicateAsTranslation: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        targetLang: z.string().min(2).max(5),
        autoTranslate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await fetchOrNotFound<typeof cmsCategories.$inferSelect>(
        ctx.db, cmsCategories, input.id, 'Category'
      );

      let name = source.name;
      let title = source.title;
      let content = source.content;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? 'en';
        const tl = input.targetLang;
        const safe = createFieldTranslator(tl, sl, logger);
        [name, title, content, metaDescription, seoTitle] = await Promise.all([
          safe('name', name),
          safe('title', title),
          safe('text', content),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
        ]);
      }

      const { slug, translationGroup, previewToken } = await prepareTranslationCopy(
        ctx.db, cmsCategories,
        { id: cmsCategories.id, slug: cmsCategories.slug, lang: cmsCategories.lang, deletedAt: cmsCategories.deletedAt, translationGroup: cmsCategories.translationGroup },
        input.id, source.slug, source.translationGroup, input.targetLang,
      );

      const [newCategory] = await ctx.db
        .insert(cmsCategories)
        .values({
          name,
          slug,
          lang: input.targetLang,
          title,
          content,
          status: ContentStatus.DRAFT,
          icon: source.icon,
          metaDescription,
          seoTitle,
          order: source.order,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          jsonLd: source.jsonLd,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'category',
        entityId: newCategory!.id,
        entityTitle: newCategory!.name,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newCategory!.id, slug: newCategory!.slug };
    }),

  /** Get translation siblings for a category */
  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getTranslationSiblings(
        ctx.db, cmsCategories,
        cmsCategories.id, cmsCategories.translationGroup, cmsCategories.lang,
        cmsCategories.slug, cmsCategories.deletedAt, input.id,
      );
    }),

  /** Export specific categories by ID array */
  exportBulk: contentProcedure
    .input(exportBulkInput)
    .query(async ({ ctx, input }) => {
      const cats = await ctx.db
        .select({
          id: cmsCategories.id,
          name: cmsCategories.name,
          slug: cmsCategories.slug,
          title: cmsCategories.title,
          content: cmsCategories.content,
          status: cmsCategories.status,
          lang: cmsCategories.lang,
          metaDescription: cmsCategories.metaDescription,
          seoTitle: cmsCategories.seoTitle,
          publishedAt: cmsCategories.publishedAt,
          createdAt: cmsCategories.createdAt,
          updatedAt: cmsCategories.updatedAt,
        })
        .from(cmsCategories)
        .where(inArray(cmsCategories.id, input.ids));

      const headers = ['id', 'name', 'slug', 'title', 'status', 'lang', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'content'];
      return serializeExport(cats as Record<string, unknown>[], headers, input.format);
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
        icon: z.string().max(255).optional().nullable(),
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(255).optional().nullable(),
        order: z.number().int().optional(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        jsonLd: z.string().max(10000).optional().nullable(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...updates } = input;

      const existing = await fetchOrNotFound<typeof cmsCategories.$inferSelect>(
        ctx.db, cmsCategories, id, 'Category'
      );

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsCategories,
            slugCol: cmsCategories.slug,
            slug: updates.slug,
            idCol: cmsCategories.id,
            excludeId: id,
            langCol: cmsCategories.lang,
            lang: existing.lang,
            deletedAtCol: cmsCategories.deletedAt,
          },
          'Category'
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: 'category',
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...CATEGORY_SNAPSHOT_KEYS],
        userId: ctx.session.user.id,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: '/category/',
        doUpdate: async (db) => {
          await db
            .update(cmsCategories)
            .set({
              ...updates,
              publishedAt:
                updates.publishedAt !== undefined
                  ? updates.publishedAt
                    ? new Date(updates.publishedAt)
                    : null
                  : undefined,
              updatedAt: new Date(),
            })
            .where(eq(cmsCategories.id, id));
        },
      });

      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'category',
        entityId: id,
        entityTitle: updates.name ?? existing.name,
      });

      return { success: true };
    }),

  /** Update just the status of a category (for bulk actions) */
  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateContentStatus(
        ctx.db, cmsCategories,
        cmsCategories.id, cmsCategories.status, cmsCategories.publishedAt, cmsCategories.updatedAt,
        input.id, input.status, 'Category',
      );

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action,
        entityType: 'category',
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
      await permanentDelete(ctx.db, crudCols, input.id, 'category', async (tx) => {
        await deleteTermRelationshipsByTerm(tx, input.id, 'category');
      });
      return { success: true };
    }),

  /** Public: get a published category by slug */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        lang: z.string().max(2).default('en'),
      })
    )
    .query(async ({ ctx, input }) => {
      const [category] = await ctx.db
        .select()
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.slug, input.slug),
            eq(cmsCategories.lang, input.lang),
            eq(cmsCategories.status, ContentStatus.PUBLISHED),
            isNull(cmsCategories.deletedAt)
          )
        )
        .limit(1);

      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        });
      }
      const { previewToken: _pt, ...rest } = category;
      return rest;
    }),

  /** Public: list published categories */
  listPublished: publicProcedure
    .input(
      z.object({
        lang: z.string().max(2).default('en'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input, 100);

      const where = and(
        eq(cmsCategories.lang, input.lang),
        eq(cmsCategories.status, ContentStatus.PUBLISHED),
        isNull(cmsCategories.deletedAt)
      );

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsCategories)
          .where(where)
          .orderBy(cmsCategories.order)
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsCategories)
          .where(where),
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
