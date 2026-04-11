import { and, asc, count, desc, eq, ilike, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure, sectionProcedure } from '@/server/trpc';
import { parsePagination, paginatedResult, fetchOrNotFound, ensureSlugUnique } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/infra/audit';
import { cmsAuthors, cmsAuthorRelationships } from '../schema/authors';
import { cmsPosts } from '@/server/db/schema/cms';
import { ContentStatus } from '@/core/types/cms';
import { syncAuthorRelationships, getAuthorIds, getAuthorsForObject } from '../lib/author-helpers';

const contentProcedure = sectionProcedure('content');

export const authorsRouter = createTRPCRouter({
  // ── Admin ──────────────────────────────────────────────────────────────────

  /** List authors with search + pagination */
  list: contentProcedure
    .input(
      z.object({
        search: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);
      const where = input.search ? ilike(cmsAuthors.name, `%${input.search}%`) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select()
          .from(cmsAuthors)
          .where(where)
          .orderBy(asc(cmsAuthors.name))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(cmsAuthors).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get single author by ID */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return fetchOrNotFound<typeof cmsAuthors.$inferSelect>(
        ctx.db, cmsAuthors, input.id, 'Author',
      );
    }),

  /** Create author */
  create: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().max(255),
        bio: z.string().max(5000).optional(),
        avatar: z.string().max(1024).optional(),
        socialUrls: z.string().max(2000).optional(),
        userId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureSlugUnique(
        ctx.db,
        { table: cmsAuthors, slugCol: cmsAuthors.slug, slug: input.slug },
        'Author',
      );

      const [author] = await ctx.db
        .insert(cmsAuthors)
        .values({
          name: input.name,
          slug: input.slug,
          bio: input.bio ?? null,
          avatar: input.avatar ?? null,
          socialUrls: input.socialUrls ?? null,
          userId: input.userId ?? null,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'author',
        entityId: author!.id,
        entityTitle: author!.name,
      });

      return author!;
    }),

  /** Update author */
  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().max(255).optional(),
        bio: z.string().max(5000).optional().nullable(),
        avatar: z.string().max(1024).optional().nullable(),
        socialUrls: z.string().max(2000).optional().nullable(),
        userId: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      if (updates.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsAuthors,
            slugCol: cmsAuthors.slug,
            slug: updates.slug,
            idCol: cmsAuthors.id,
            excludeId: id,
          },
          'Author',
        );
      }

      await ctx.db
        .update(cmsAuthors)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(cmsAuthors.id, id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'author',
        entityId: id,
        entityTitle: updates.name ?? '',
      });
    }),

  /** Delete author */
  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(cmsAuthors).where(eq(cmsAuthors.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'delete',
        entityType: 'author',
        entityId: input.id,
      });
    }),

  /** List authors for picker (lightweight) */
  candidates: contentProcedure
    .input(z.object({ search: z.string().max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.search ? ilike(cmsAuthors.name, `%${input.search}%`) : undefined;
      return ctx.db
        .select({ id: cmsAuthors.id, name: cmsAuthors.name, avatar: cmsAuthors.avatar })
        .from(cmsAuthors)
        .where(where)
        .orderBy(asc(cmsAuthors.name))
        .limit(50);
    }),

  /** Sync author relationships for a content object */
  syncRelationships: contentProcedure
    .input(
      z.object({
        objectId: z.string().uuid(),
        contentType: z.string().max(50),
        authorIds: z.array(z.string().uuid()).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await syncAuthorRelationships(ctx.db, input.objectId, input.contentType, input.authorIds);
    }),

  /** Get author IDs for a content object (admin form) */
  getRelationships: contentProcedure
    .input(z.object({ objectId: z.string().uuid(), contentType: z.string().max(50) }))
    .query(async ({ ctx, input }) => {
      return getAuthorIds(ctx.db, input.objectId, input.contentType);
    }),

  // ── Public ─────────────────────────────────────────────────────────────────

  /** Get author by slug (profile page) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      const [author] = await ctx.db
        .select()
        .from(cmsAuthors)
        .where(eq(cmsAuthors.slug, input.slug))
        .limit(1);

      if (!author) {
        const { TRPCError } = await import('@trpc/server');
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Author not found' });
      }
      return author;
    }),

  /** Get published posts by author (author archive page) */
  getPostsByAuthor: publicProcedure
    .input(
      z.object({
        authorId: z.string().uuid(),
        lang: z.string().max(2).default('en'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const postIds = await ctx.db
        .select({ objectId: cmsAuthorRelationships.objectId })
        .from(cmsAuthorRelationships)
        .where(eq(cmsAuthorRelationships.authorId, input.authorId));

      if (postIds.length === 0) return paginatedResult([], 0, page, pageSize);

      const ids = postIds.map((r) => r.objectId);
      const { inArray } = await import('drizzle-orm');

      const where = and(
        inArray(cmsPosts.id, ids),
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        eq(cmsPosts.lang, input.lang),
        isNull(cmsPosts.deletedAt),
      );

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: cmsPosts.id,
            type: cmsPosts.type,
            title: cmsPosts.title,
            slug: cmsPosts.slug,
            metaDescription: cmsPosts.metaDescription,
            featuredImage: cmsPosts.featuredImage,
            publishedAt: cmsPosts.publishedAt,
          })
          .from(cmsPosts)
          .where(where)
          .orderBy(desc(cmsPosts.publishedAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(cmsPosts).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get authors for a content object (frontend rendering) */
  getForObject: publicProcedure
    .input(z.object({ objectId: z.string().uuid(), contentType: z.string().max(50) }))
    .query(async ({ ctx, input }) => {
      return getAuthorsForObject(ctx.db, input.objectId, input.contentType);
    }),
});
