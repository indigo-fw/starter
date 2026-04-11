import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { env } from '@/lib/env';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { createLogger } from '@/core/lib/infra/logger';
import { cmsShowcase } from '@/server/db/schema';
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

const logger = createLogger('showcase-router');
const contentProcedure = sectionProcedure('content');

const CARD_TYPES = ['video', 'image', 'richtext'] as const;
const VARIANTS = ['shorts', 'contained', 'full'] as const;

const SHOWCASE_SNAPSHOT_KEYS = [
  'title',
  'slug',
  'description',
  'cardType',
  'variant',
  'mediaUrl',
  'thumbnailUrl',
  'status',
  'sortOrder',
  'metaDescription',
  'seoTitle',
  'noindex',
  'publishedAt',
  'lang',
] as const;

const crudCols = {
  table: cmsShowcase,
  id: cmsShowcase.id,
  deleted_at: cmsShowcase.deletedAt,
};

export const showcaseRouter = createTRPCRouter({
  list: contentProcedure
    .input(adminListInput)
    .query(async ({ ctx, input }) => {
      return buildAdminList(
        {
          db: ctx.db,
          cols: {
            table: cmsShowcase,
            id: cmsShowcase.id,
            deleted_at: cmsShowcase.deletedAt,
            lang: cmsShowcase.lang,
            translation_group: cmsShowcase.translationGroup,
          },
          input,
          searchColumns: [cmsShowcase.title, cmsShowcase.slug],
          sortColumns: {
            title: cmsShowcase.title,
            created_at: cmsShowcase.createdAt,
            updated_at: cmsShowcase.updatedAt,
            sort_order: cmsShowcase.sortOrder,
          },
          defaultSort: 'updated_at',
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsShowcase)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  counts: contentProcedure.query(async ({ ctx }) => {
    return buildStatusCounts(ctx.db, {
      table: cmsShowcase,
      status: cmsShowcase.status,
      deleted_at: cmsShowcase.deletedAt,
    });
  }),

  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await fetchOrNotFound<typeof cmsShowcase.$inferSelect>(
        ctx.db, cmsShowcase, input.id, 'Showcase item'
      );
      const rels = await getTermRelationships(ctx.db, item.id, 'tag');
      const tagIds = rels.map((r) => r.termId);
      return { ...item, tagIds };
    }),

  create: contentProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        slug: z.string().min(1).max(255),
        lang: z.string().min(2).max(2),
        description: z.string().default(''),
        cardType: z.enum(CARD_TYPES).default('richtext'),
        variant: z.enum(VARIANTS).default('full'),
        mediaUrl: z.string().max(2048).optional(),
        thumbnailUrl: z.string().max(2048).optional(),
        status: z.number().int().default(ContentStatus.DRAFT),
        sortOrder: z.number().int().min(0).max(32767).default(0),
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(255).optional(),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tagIds, ...itemInput } = input;

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsShowcase,
          slugCol: cmsShowcase.slug,
          slug: itemInput.slug,
          langCol: cmsShowcase.lang,
          lang: itemInput.lang,
          deletedAtCol: cmsShowcase.deletedAt,
        },
        'Showcase item'
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [item] = await ctx.db
        .insert(cmsShowcase)
        .values({
          title: itemInput.title,
          slug: itemInput.slug,
          lang: itemInput.lang,
          description: itemInput.description,
          cardType: itemInput.cardType,
          variant: itemInput.variant,
          mediaUrl: itemInput.mediaUrl ?? null,
          thumbnailUrl: itemInput.thumbnailUrl ?? null,
          status: itemInput.status,
          sortOrder: itemInput.sortOrder,
          metaDescription: itemInput.metaDescription ?? null,
          seoTitle: itemInput.seoTitle ?? null,
          noindex: itemInput.noindex,
          publishedAt: itemInput.publishedAt ? new Date(itemInput.publishedAt) : null,
          previewToken,
          translationGroup: itemInput.translationGroup ?? null,
          fallbackToDefault: itemInput.fallbackToDefault ?? null,
          createdBy: ctx.session.user.id,
        })
        .returning();

      if (tagIds?.length && item) {
        await syncTermRelationships(ctx.db, item.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'showcase',
        entityId: item!.id,
        entityTitle: item!.title,
      });

      return item!;
    }),

  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const original = await fetchOrNotFound<typeof cmsShowcase.$inferSelect>(
        ctx.db, cmsShowcase, input.id, 'Showcase item'
      );

      const copySlug = await generateCopySlug(
        ctx.db, cmsShowcase, cmsShowcase.slug, cmsShowcase.deletedAt,
        original.slug, cmsShowcase.lang, original.lang,
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [copy] = await ctx.db
        .insert(cmsShowcase)
        .values({
          title: original.title + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          description: original.description,
          cardType: original.cardType,
          variant: original.variant,
          mediaUrl: original.mediaUrl,
          thumbnailUrl: original.thumbnailUrl,
          status: ContentStatus.DRAFT,
          sortOrder: original.sortOrder,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          createdBy: ctx.session.user.id,
        })
        .returning();

      // Copy tag relationships
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
        entityType: 'showcase',
        entityId: copy!.id,
        entityTitle: copy!.title,
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
      const source = await fetchOrNotFound<typeof cmsShowcase.$inferSelect>(
        ctx.db, cmsShowcase, input.id, 'Showcase item'
      );

      let title = source.title;
      let description = source.description;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? DEFAULT_LOCALE;
        const tl = input.targetLang;
        const safe = createFieldTranslator(tl, sl, logger);
        [title, description, metaDescription, seoTitle] = await Promise.all([
          safe('title', title),
          safe('description', description),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
        ]);
      }

      const { slug, translationGroup, previewToken } = await prepareTranslationCopy(
        ctx.db, cmsShowcase,
        { id: cmsShowcase.id, slug: cmsShowcase.slug, lang: cmsShowcase.lang, deletedAt: cmsShowcase.deletedAt, translationGroup: cmsShowcase.translationGroup },
        input.id, source.slug, source.translationGroup, input.targetLang,
      );

      const [newItem] = await ctx.db
        .insert(cmsShowcase)
        .values({
          title,
          slug,
          lang: input.targetLang,
          description,
          cardType: source.cardType,
          variant: source.variant,
          mediaUrl: source.mediaUrl,
          thumbnailUrl: source.thumbnailUrl,
          status: ContentStatus.DRAFT,
          sortOrder: source.sortOrder,
          metaDescription,
          seoTitle,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          createdBy: ctx.session.user.id,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'showcase',
        entityId: newItem!.id,
        entityTitle: newItem!.title,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newItem!.id, slug: newItem!.slug };
    }),

  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getTranslationSiblings(
        ctx.db, cmsShowcase,
        cmsShowcase.id, cmsShowcase.translationGroup, cmsShowcase.lang,
        cmsShowcase.slug, cmsShowcase.deletedAt, input.id,
      );
    }),

  exportBulk: contentProcedure
    .input(exportBulkInput)
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select({
          id: cmsShowcase.id,
          title: cmsShowcase.title,
          slug: cmsShowcase.slug,
          description: cmsShowcase.description,
          cardType: cmsShowcase.cardType,
          variant: cmsShowcase.variant,
          mediaUrl: cmsShowcase.mediaUrl,
          thumbnailUrl: cmsShowcase.thumbnailUrl,
          status: cmsShowcase.status,
          sortOrder: cmsShowcase.sortOrder,
          lang: cmsShowcase.lang,
          metaDescription: cmsShowcase.metaDescription,
          seoTitle: cmsShowcase.seoTitle,
          publishedAt: cmsShowcase.publishedAt,
          createdAt: cmsShowcase.createdAt,
          updatedAt: cmsShowcase.updatedAt,
        })
        .from(cmsShowcase)
        .where(inArray(cmsShowcase.id, input.ids));

      const headers = ['id', 'title', 'slug', 'cardType', 'variant', 'status', 'lang', 'sortOrder', 'mediaUrl', 'thumbnailUrl', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'description'];
      return serializeExport(items as Record<string, unknown>[], headers, input.format);
    }),

  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        cardType: z.enum(CARD_TYPES).optional(),
        variant: z.enum(VARIANTS).optional(),
        mediaUrl: z.string().max(2048).optional().nullable(),
        thumbnailUrl: z.string().max(2048).optional().nullable(),
        status: z.number().int().optional(),
        sortOrder: z.number().int().min(0).max(32767).optional(),
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(255).optional().nullable(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tagIds, ...updates } = input;

      const existing = await fetchOrNotFound<typeof cmsShowcase.$inferSelect>(
        ctx.db, cmsShowcase, id, 'Showcase item'
      );

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsShowcase,
            slugCol: cmsShowcase.slug,
            slug: updates.slug,
            idCol: cmsShowcase.id,
            excludeId: id,
            langCol: cmsShowcase.lang,
            lang: existing.lang,
            deletedAtCol: cmsShowcase.deletedAt,
          },
          'Showcase item'
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: 'showcase',
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...SHOWCASE_SNAPSHOT_KEYS],
        userId: ctx.session.user.id,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: '/showcase/',
        doUpdate: async (db) => {
          await db
            .update(cmsShowcase)
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
            .where(eq(cmsShowcase.id, id));
        },
      });

      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'showcase',
        entityId: id,
        entityTitle: updates.title ?? existing.title,
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
        ctx.db, cmsShowcase,
        cmsShowcase.id, cmsShowcase.status, cmsShowcase.publishedAt, cmsShowcase.updatedAt,
        input.id, input.status, 'Showcase item',
      );

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action,
        entityType: 'showcase',
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
      await permanentDelete(ctx.db, crudCols, input.id, 'showcase', async (tx) => {
        await deleteAllTermRelationships(tx, input.id);
      });
      return { success: true };
    }),

  /** Public: get a published showcase item by slug */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        previewToken: z.string().max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.previewToken) {
        const [item] = await ctx.db
          .select()
          .from(cmsShowcase)
          .where(
            and(
              eq(cmsShowcase.slug, input.slug),
              eq(cmsShowcase.lang, input.lang),
              eq(cmsShowcase.previewToken, input.previewToken),
              isNull(cmsShowcase.deletedAt)
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
        .from(cmsShowcase)
        .where(
          and(
            eq(cmsShowcase.slug, input.slug),
            eq(cmsShowcase.lang, input.lang),
            eq(cmsShowcase.status, ContentStatus.PUBLISHED),
            isNull(cmsShowcase.deletedAt)
          )
        )
        .limit(1);

      if (!item) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Showcase item not found',
        });
      }
      const { previewToken: _pt, ...rest } = item;
      return rest;
    }),

  /** Public: list published showcase items ordered by sortOrder */
  listPublished: publicProcedure
    .input(
      z.object({
        lang: z.string().max(2).default(DEFAULT_LOCALE),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input, 100);

      const baseConditions = and(
        eq(cmsShowcase.lang, input.lang),
        eq(cmsShowcase.status, ContentStatus.PUBLISHED),
        isNull(cmsShowcase.deletedAt)
      );

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsShowcase)
          .where(baseConditions)
          .orderBy(cmsShowcase.sortOrder, desc(cmsShowcase.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsShowcase)
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
