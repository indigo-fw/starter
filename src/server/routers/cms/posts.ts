import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { getContentTypeByPostType } from '@/config/cms';
import { env } from '@/lib/env';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { cmsPosts, cmsCategories, cmsTerms, cmsTermRelationships } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';
import { getMdxManagedSlugs } from '@/core/lib/content/loader';
import { getContentVarDefs } from '@/core/lib/content/vars';
import {
  buildAdminList,
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
  fetchOrNotFound,
  generateCopySlug,
  getTranslationSiblings,
  serializeExport,
  prepareTranslationCopy,
} from '@/core/crud/admin-crud';
import { adminListInput, exportBulkInput } from '@/core/crud/router-schemas';
import { updateWithRevision } from '@/core/crud/cms-helpers';
import {
  syncTermRelationships,
  getTermRelationships,
  deleteAllTermRelationships,
} from '@/core/crud/taxonomy-helpers';
import { logAudit } from '@/core/lib/infra/audit';
import { createFieldTranslator } from '@/server/translation/translate-fields';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { broadcastCmsLinkInvalidation } from '@/core/lib/content/cms-link';
import { createTRPCRouter } from '../../trpc';
import { contentProcedure, POST_SNAPSHOT_KEYS, crudCols, notifyContentPublished, logger } from './_shared';

export const cmsPostsRouter = createTRPCRouter({
  /** List posts with search, pagination, status tabs */
  list: contentProcedure
    .input(adminListInput.extend({ type: z.number().int().min(1) }))
    .query(async ({ ctx, input }) => {
      return buildAdminList(
        {
          db: ctx.db,
          cols: {
            table: cmsPosts,
            id: cmsPosts.id,
            deleted_at: cmsPosts.deletedAt,
            lang: cmsPosts.lang,
            translation_group: cmsPosts.translationGroup,
          },
          input,
          searchColumns: [cmsPosts.title, cmsPosts.slug],
          sortColumns: {
            title: cmsPosts.title,
            created_at: cmsPosts.createdAt,
            updated_at: cmsPosts.updatedAt,
            published_at: cmsPosts.publishedAt,
          },
          defaultSort: 'updated_at',
          extraConditions: [eq(cmsPosts.type, input.type)],
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsPosts)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  /** Status tab counts */
  counts: contentProcedure
    .input(z.object({ type: z.number().int().min(1) }))
    .query(async ({ ctx, input }) => {
      return buildStatusCounts(
        ctx.db,
        {
          table: cmsPosts,
          status: cmsPosts.status,
          deleted_at: cmsPosts.deletedAt,
        },
        eq(cmsPosts.type, input.type)
      );
    }),

  /** Get slugs that have .mdx file overrides (not editable in admin). */
  mdxManagedSlugs: contentProcedure
    .input(z.object({ type: z.number().int().min(1), lang: z.string().length(2) }))
    .query(({ input }) => {
      const ct = getContentTypeByPostType(input.type);
      const allSlugs = getMdxManagedSlugs(input.lang);

      const prefix = ct?.urlPrefix;
      const listSegment = ct?.listSegment;
      const slugs: string[] = [];

      for (const slug of allSlugs) {
        if (prefix === '/') {
          if (!slug.includes('/')) slugs.push(slug);
        } else if (listSegment && slug.startsWith(`${listSegment}/`)) {
          slugs.push(slug.slice(listSegment.length + 1));
        }
      }

      return slugs;
    }),

  /** Get available content variables for the editor toolbar. */
  contentVars: contentProcedure.query(() => {
    return getContentVarDefs();
  }),

  /** Get single post by ID (with category + tag IDs) */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const post = await fetchOrNotFound<typeof cmsPosts.$inferSelect>(
        ctx.db, cmsPosts, input.id, 'Post'
      );

      const rels = await getTermRelationships(ctx.db, post.id);
      const categoryIds = rels
        .filter((r) => r.taxonomyId === 'category')
        .map((r) => r.termId);
      const tagIds = rels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);

      return { ...post, categoryIds, tagIds };
    }),

  /** Create a new post */
  create: contentProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
        title: z.string().min(1).max(255),
        slug: z.string().max(255),
        lang: z.string().min(2).max(2),
        content: z.string().default(''),
        status: z.number().int().default(ContentStatus.DRAFT),
        metaDescription: z.string().max(500).optional(),
        seoTitle: z.string().max(100).optional(),
        featuredImage: z.string().max(1024).optional(),
        featuredImageAlt: z.string().max(500).optional(),
        jsonLd: z.string().max(10000).optional(),
        noindex: z.boolean().default(false),
        publishedAt: z.string().datetime().optional(),
        translationGroup: z.string().uuid().optional(),
        fallbackToDefault: z.boolean().optional(),
        parentId: z.string().uuid().optional(),
        categoryIds: z.array(z.string().uuid()).max(20).optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { categoryIds, tagIds, ...postInput } = input;
      const contentType = getContentTypeByPostType(postInput.type);

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsPosts,
          slugCol: cmsPosts.slug,
          slug: input.slug,
          langCol: cmsPosts.lang,
          lang: input.lang,
          deletedAtCol: cmsPosts.deletedAt,
          extraConditions: [eq(cmsPosts.type, input.type)],
        },
        contentType.label
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [post] = await ctx.db
        .insert(cmsPosts)
        .values({
          type: postInput.type,
          title: postInput.title,
          slug: postInput.slug,
          lang: postInput.lang,
          content: postInput.content,
          status: postInput.status,
          metaDescription: postInput.metaDescription ?? null,
          seoTitle: postInput.seoTitle ?? null,
          featuredImage: postInput.featuredImage ?? null,
          featuredImageAlt: postInput.featuredImageAlt ?? null,
          jsonLd: postInput.jsonLd ?? null,
          noindex: postInput.noindex,
          publishedAt: postInput.publishedAt ? new Date(postInput.publishedAt) : null,
          previewToken,
          translationGroup: postInput.translationGroup ?? null,
          fallbackToDefault: postInput.fallbackToDefault ?? null,
          parentId: postInput.parentId ?? null,
          authorId: ctx.session.user.id,
        })
        .returning();

      if (categoryIds?.length && post) {
        await syncTermRelationships(ctx.db, post.id, 'category', categoryIds);
      }
      if (tagIds?.length && post) {
        await syncTermRelationships(ctx.db, post.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'post',
        entityId: post!.id,
        entityTitle: post!.title,
      });
      dispatchWebhook(ctx.db, 'post.created', { id: post!.id, title: post!.title, type: post!.type });
      broadcastCmsLinkInvalidation();

      if (post!.status === ContentStatus.PUBLISHED) {
        notifyContentPublished(ctx.db, post!.title, post!.slug, ctx.session.user.id, contentType);
      }

      return post!;
    }),

  /** Update a post */
  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(255).optional(),
        slug: z.string().max(255).optional(),
        content: z.string().optional(),
        status: z.number().int().optional(),
        metaDescription: z.string().max(500).optional().nullable(),
        seoTitle: z.string().max(100).optional().nullable(),
        featuredImage: z.string().max(1024).optional().nullable(),
        featuredImageAlt: z.string().max(500).optional().nullable(),
        jsonLd: z.string().max(10000).optional().nullable(),
        noindex: z.boolean().optional(),
        publishedAt: z.string().datetime().optional().nullable(),
        translationGroup: z.string().uuid().optional().nullable(),
        fallbackToDefault: z.boolean().optional().nullable(),
        parentId: z.string().uuid().optional().nullable(),
        categoryIds: z.array(z.string().uuid()).max(20).optional(),
        tagIds: z.array(z.string().uuid()).max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, categoryIds, tagIds, ...updates } = input;

      const [existing] = await ctx.db
        .select()
        .from(cmsPosts)
        .where(eq(cmsPosts.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const contentType = getContentTypeByPostType(existing.type);

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsPosts,
            slugCol: cmsPosts.slug,
            slug: updates.slug,
            idCol: cmsPosts.id,
            excludeId: id,
            langCol: cmsPosts.lang,
            lang: existing.lang,
            deletedAtCol: cmsPosts.deletedAt,
            extraConditions: [eq(cmsPosts.type, existing.type)],
          },
          contentType.label
        );
      }

      await updateWithRevision({
        db: ctx.db,
        contentType: contentType.id,
        contentId: id,
        oldRecord: existing,
        snapshotKeys: [...POST_SNAPSHOT_KEYS],
        userId: ctx.session.user.id,
        oldSlug: existing.slug,
        newSlug: updates.slug,
        urlPrefix: contentType.urlPrefix,
        doUpdate: async (db) => {
          await db
            .update(cmsPosts)
            .set({
              ...updates,
              publishedAt: updates.publishedAt !== undefined
                ? updates.publishedAt
                  ? new Date(updates.publishedAt)
                  : null
                : undefined,
              updatedAt: new Date(),
            })
            .where(eq(cmsPosts.id, id));
        },
      });

      if (categoryIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'category', categoryIds);
      }
      if (tagIds !== undefined) {
        await syncTermRelationships(ctx.db, id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'post',
        entityId: id,
        entityTitle: updates.title ?? existing.title,
      });
      dispatchWebhook(ctx.db, 'post.updated', { id, title: updates.title ?? existing.title });
      broadcastCmsLinkInvalidation();

      if (
        updates.status === ContentStatus.PUBLISHED &&
        existing.status !== ContentStatus.PUBLISHED
      ) {
        notifyContentPublished(
          ctx.db,
          updates.title ?? existing.title,
          updates.slug ?? existing.slug,
          ctx.session.user.id,
          contentType,
        );
      }

      return { success: true };
    }),

  /** Update just the status of a post (for bulk actions) */
  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          type: cmsPosts.type,
          status: cmsPosts.status,
          publishedAt: cmsPosts.publishedAt,
        })
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === ContentStatus.PUBLISHED && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }

      await ctx.db
        .update(cmsPosts)
        .set(updates)
        .where(eq(cmsPosts.id, input.id));

      const action =
        input.status === ContentStatus.PUBLISHED ? 'publish' : 'unpublish';
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action,
        entityType: 'post',
        entityId: input.id,
      });

      broadcastCmsLinkInvalidation();

      if (
        input.status === ContentStatus.PUBLISHED &&
        existing.status !== ContentStatus.PUBLISHED
      ) {
        const ct = getContentTypeByPostType(existing.type);
        notifyContentPublished(ctx.db, existing.title, existing.slug, ctx.session.user.id, ct);
      }

      return { success: true };
    }),

  /** Soft-delete (trash) a post */
  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softDelete(ctx.db, crudCols, input.id);
      broadcastCmsLinkInvalidation();
      return { success: true };
    }),

  /** Restore from trash */
  restore: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softRestore(ctx.db, crudCols, input.id);
      broadcastCmsLinkInvalidation();
      return { success: true };
    }),

  /** Permanently delete a trashed post */
  permanentDelete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [post] = await ctx.db
        .select({ type: cmsPosts.type })
        .from(cmsPosts)
        .where(eq(cmsPosts.id, input.id))
        .limit(1);

      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const contentType = getContentTypeByPostType(post.type);
      await permanentDelete(ctx.db, crudCols, input.id, contentType.id, async (tx) => {
        await deleteAllTermRelationships(tx, input.id);
      });
      broadcastCmsLinkInvalidation();
      return { success: true };
    }),

  /** Duplicate a post */
  duplicate: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const original = await fetchOrNotFound<typeof cmsPosts.$inferSelect>(
        ctx.db, cmsPosts, input.id, 'Post'
      );

      const copySlug = await generateCopySlug(
        ctx.db, cmsPosts, cmsPosts.slug, cmsPosts.deletedAt,
        original.slug, cmsPosts.lang, original.lang,
      );

      const previewToken = crypto.randomBytes(32).toString('hex');

      const [copy] = await ctx.db
        .insert(cmsPosts)
        .values({
          type: original.type,
          title: original.title + ' (Copy)',
          slug: copySlug,
          lang: original.lang,
          content: original.content,
          status: ContentStatus.DRAFT,
          metaDescription: original.metaDescription,
          seoTitle: original.seoTitle,
          featuredImage: original.featuredImage,
          featuredImageAlt: original.featuredImageAlt,
          jsonLd: original.jsonLd,
          noindex: original.noindex,
          publishedAt: null,
          previewToken,
          parentId: original.parentId,
          authorId: ctx.session.user.id,
        })
        .returning();

      const originalRels = await getTermRelationships(ctx.db, input.id);
      const categoryIds = originalRels
        .filter((r) => r.taxonomyId === 'category')
        .map((r) => r.termId);
      const tagIds = originalRels
        .filter((r) => r.taxonomyId === 'tag')
        .map((r) => r.termId);
      if (categoryIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'category', categoryIds);
      }
      if (tagIds.length > 0) {
        await syncTermRelationships(ctx.db, copy!.id, 'tag', tagIds);
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'post',
        entityId: copy!.id,
        entityTitle: copy!.title,
        metadata: { originalId: input.id },
      });

      return copy!;
    }),

  /** Validate a list of internal URLs against published CMS content */
  validateLinks: contentProcedure
    .input(z.object({ urls: z.array(z.string().max(500)).max(100) }))
    .query(async ({ ctx, input }) => {
      const results: { url: string; valid: boolean }[] = [];

      for (const url of input.urls) {
        const clean = url.startsWith('/') ? url.slice(1) : url;
        const parts = clean.split('/').filter(Boolean);

        let valid = false;

        if (parts.length === 0) {
          valid = true;
        } else if (parts.length === 1) {
          const [row] = await ctx.db
            .select({ id: cmsPosts.id })
            .from(cmsPosts)
            .where(
              and(
                eq(cmsPosts.slug, parts[0]!),
                eq(cmsPosts.status, ContentStatus.PUBLISHED),
                isNull(cmsPosts.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        } else if (parts[0] === 'blog' && parts.length === 2) {
          const [row] = await ctx.db
            .select({ id: cmsPosts.id })
            .from(cmsPosts)
            .where(
              and(
                eq(cmsPosts.slug, parts[1]!),
                eq(cmsPosts.status, ContentStatus.PUBLISHED),
                isNull(cmsPosts.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        } else if (parts[0] === 'category' && parts.length === 2) {
          const [row] = await ctx.db
            .select({ id: cmsCategories.id })
            .from(cmsCategories)
            .where(
              and(
                eq(cmsCategories.slug, parts[1]!),
                eq(cmsCategories.status, ContentStatus.PUBLISHED),
                isNull(cmsCategories.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        } else if (parts[0] === 'tag' && parts.length === 2) {
          const [row] = await ctx.db
            .select({ id: cmsTerms.id })
            .from(cmsTerms)
            .where(
              and(
                eq(cmsTerms.slug, parts[1]!),
                eq(cmsTerms.taxonomyId, 'tag'),
                isNull(cmsTerms.deletedAt)
              )
            )
            .limit(1);
          valid = !!row;
        }

        results.push({ url, valid });
      }

      return results;
    }),

  /** Duplicate a post as a translation in another language */
  duplicateAsTranslation: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        targetLang: z.string().min(2).max(5),
        autoTranslate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await fetchOrNotFound<typeof cmsPosts.$inferSelect>(
        ctx.db, cmsPosts, input.id, 'Post',
      );

      let title = source.title;
      let content = source.content;
      let metaDescription = source.metaDescription;
      let seoTitle = source.seoTitle;
      let featuredImageAlt = source.featuredImageAlt;

      if (input.autoTranslate && env.DEEPL_API_KEY) {
        const sl = source.lang ?? DEFAULT_LOCALE;
        const tl = input.targetLang;
        const safe = createFieldTranslator(tl, sl, logger);
        [title, content, metaDescription, seoTitle, featuredImageAlt] = await Promise.all([
          safe('title', title),
          safe('content', content),
          safe('metaDescription', metaDescription),
          safe('seoTitle', seoTitle),
          safe('featuredImageAlt', featuredImageAlt),
        ]);
      }

      const { slug, translationGroup, previewToken } = await prepareTranslationCopy(
        ctx.db, cmsPosts,
        { id: cmsPosts.id, slug: cmsPosts.slug, lang: cmsPosts.lang, deletedAt: cmsPosts.deletedAt, translationGroup: cmsPosts.translationGroup },
        input.id, source.slug, source.translationGroup, input.targetLang,
      );

      const [newPost] = await ctx.db
        .insert(cmsPosts)
        .values({
          type: source.type,
          title,
          slug,
          lang: input.targetLang,
          content,
          status: ContentStatus.DRAFT,
          metaDescription,
          seoTitle,
          featuredImage: source.featuredImage,
          featuredImageAlt,
          jsonLd: source.jsonLd,
          noindex: source.noindex,
          publishedAt: null,
          previewToken,
          translationGroup,
          fallbackToDefault: source.fallbackToDefault,
          parentId: source.parentId,
          authorId: ctx.session.user.id,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'duplicate',
        entityType: 'post',
        entityId: newPost!.id,
        entityTitle: newPost!.title,
        metadata: { originalId: input.id, targetLang: input.targetLang, autoTranslate: input.autoTranslate },
      });

      return { id: newPost!.id, slug: newPost!.slug };
    }),

  /** Get translation siblings for a post */
  getTranslationSiblings: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getTranslationSiblings(
        ctx.db, cmsPosts,
        cmsPosts.id, cmsPosts.translationGroup, cmsPosts.lang,
        cmsPosts.slug, cmsPosts.deletedAt, input.id,
      );
    }),

  /** Export specific posts by ID array */
  exportBulk: contentProcedure
    .input(exportBulkInput)
    .query(async ({ ctx, input }) => {
      const posts = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          content: cmsPosts.content,
          status: cmsPosts.status,
          lang: cmsPosts.lang,
          metaDescription: cmsPosts.metaDescription,
          seoTitle: cmsPosts.seoTitle,
          publishedAt: cmsPosts.publishedAt,
          createdAt: cmsPosts.createdAt,
          updatedAt: cmsPosts.updatedAt,
        })
        .from(cmsPosts)
        .where(inArray(cmsPosts.id, input.ids));

      const headers = ['id', 'title', 'slug', 'status', 'lang', 'metaDescription', 'seoTitle', 'publishedAt', 'createdAt', 'updatedAt', 'content'];
      return serializeExport(posts as Record<string, unknown>[], headers, input.format);
    }),

  /** Export posts as JSON or CSV */
  exportPosts: contentProcedure
    .input(
      z.object({
        type: z.number().int().min(1),
        format: z.enum(['json', 'csv']),
      })
    )
    .query(async ({ ctx, input }) => {
      const posts = await ctx.db
        .select({
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          content: cmsPosts.content,
          metaDescription: cmsPosts.metaDescription,
          publishedAt: cmsPosts.publishedAt,
          status: cmsPosts.status,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.type, input.type),
            eq(cmsPosts.status, ContentStatus.PUBLISHED),
            isNull(cmsPosts.deletedAt)
          )
        )
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(5000);

      if (input.format === 'json') {
        return { data: JSON.stringify(posts, null, 2), contentType: 'application/json' };
      }

      const escape = (v: string | null | undefined) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      };
      const header = 'title,slug,content,metaDescription,publishedAt,status';
      const rows = posts.map(
        (p) =>
          `${escape(p.title)},${escape(p.slug)},${escape(p.content)},${escape(p.metaDescription)},${escape(p.publishedAt?.toISOString())},${p.status}`
      );
      return { data: [header, ...rows].join('\n'), contentType: 'text/csv' };
    }),

  /** Get page tree (hierarchical pages) */
  getPageTree: contentProcedure
    .input(z.object({ lang: z.string().max(2).default(DEFAULT_LOCALE) }))
    .query(async ({ ctx, input }) => {
      const pages = await ctx.db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          parentId: cmsPosts.parentId,
          status: cmsPosts.status,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.type, PostType.PAGE),
            eq(cmsPosts.lang, input.lang),
            isNull(cmsPosts.deletedAt)
          )
        )
        .orderBy(asc(cmsPosts.title))
        .limit(500);

      const parentMap = new Map(pages.map((p) => [p.id, p.parentId]));
      function getDepth(id: string, seen = new Set<string>()): number {
        if (seen.has(id)) return 0;
        seen.add(id);
        const pid = parentMap.get(id);
        if (!pid) return 0;
        return 1 + getDepth(pid, seen);
      }

      return pages.map((p) => ({
        ...p,
        depth: getDepth(p.id),
      }));
    }),
});
