import { TRPCError } from '@trpc/server';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { cmsTerms, cmsTermRelationships } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import {
  buildAdminList,
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
  parsePagination,
  paginatedResult,
  fetchOrNotFound,
} from '@/core/crud/admin-crud';
import { adminListInput } from '@/core/crud/router-schemas';
import {
  deleteTermRelationshipsByTerm,
  resolveTagsForPosts,
} from '@/core/crud/taxonomy-helpers';
import { slugify } from '@/core/lib/slug';
import { logAudit } from '@/core/lib/audit';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const TAXONOMY_ID = 'tag';

const contentProcedure = sectionProcedure('content');

const crudCols = {
  table: cmsTerms,
  id: cmsTerms.id,
  deleted_at: cmsTerms.deletedAt,
};

export const tagsRouter = createTRPCRouter({
  /** Admin: list tags with search, pagination, status tabs */
  list: contentProcedure
    .input(adminListInput)
    .query(async ({ ctx, input }) => {
      return buildAdminList(
        {
          db: ctx.db,
          cols: {
            table: cmsTerms,
            id: cmsTerms.id,
            deleted_at: cmsTerms.deletedAt,
            lang: cmsTerms.lang,
            // Tags don't use translation_group; pass a dummy col for the interface
            translation_group: cmsTerms.id,
          },
          input,
          searchColumns: [cmsTerms.name, cmsTerms.slug],
          sortColumns: {
            name: cmsTerms.name,
            order: cmsTerms.order,
            created_at: cmsTerms.createdAt,
          },
          defaultSort: 'created_at',
          extraConditions: [eq(cmsTerms.taxonomyId, TAXONOMY_ID)],
        },
        async ({ where, orderBy, offset, limit }) => {
          return ctx.db
            .select()
            .from(cmsTerms)
            .where(where)
            .orderBy(orderBy)
            .offset(offset)
            .limit(limit);
        }
      );
    }),

  /** Admin: status tab counts */
  counts: contentProcedure.query(async ({ ctx }) => {
    return buildStatusCounts(
      ctx.db,
      {
        table: cmsTerms,
        status: cmsTerms.status,
        deleted_at: cmsTerms.deletedAt,
      },
      eq(cmsTerms.taxonomyId, TAXONOMY_ID)
    );
  }),

  /** Admin: get a single tag by ID */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return fetchOrNotFound<typeof cmsTerms.$inferSelect>(
        ctx.db, cmsTerms, input.id, 'Tag',
        [eq(cmsTerms.taxonomyId, TAXONOMY_ID)],
      );
    }),

  /** Get multiple tags by IDs (for resolving selected tags in TagInput) */
  getByIds: contentProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return [];
      return ctx.db
        .select({ id: cmsTerms.id, name: cmsTerms.name, slug: cmsTerms.slug })
        .from(cmsTerms)
        .where(
          and(
            eq(cmsTerms.taxonomyId, TAXONOMY_ID),
            inArray(cmsTerms.id, input.ids)
          )
        )
        .limit(50);
    }),

  /** Admin: create a new tag */
  create: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().max(255).optional(),
        lang: z.string().min(2).max(2).default('en'),
        status: z.number().int().default(ContentStatus.PUBLISHED),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug || slugify(input.name);

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsTerms,
          slugCol: cmsTerms.slug,
          slug,
          langCol: cmsTerms.lang,
          lang: input.lang,
          deletedAtCol: cmsTerms.deletedAt,
          extraConditions: [eq(cmsTerms.taxonomyId, TAXONOMY_ID)],
        },
        'Tag'
      );

      const [tag] = await ctx.db
        .insert(cmsTerms)
        .values({
          taxonomyId: TAXONOMY_ID,
          name: input.name,
          slug,
          lang: input.lang,
          status: input.status,
          order: input.order,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.create',
        entityType: 'tag',
        entityId: tag!.id,
        entityTitle: input.name,
      });

      return tag!;
    }),

  /** Admin: update a tag */
  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(255).optional(),
        status: z.number().int().optional(),
        order: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const existing = await fetchOrNotFound<typeof cmsTerms.$inferSelect>(
        ctx.db, cmsTerms, id, 'Tag',
        [eq(cmsTerms.taxonomyId, TAXONOMY_ID)],
      );

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsTerms,
            slugCol: cmsTerms.slug,
            slug: updates.slug,
            idCol: cmsTerms.id,
            excludeId: id,
            langCol: cmsTerms.lang,
            lang: existing.lang,
            deletedAtCol: cmsTerms.deletedAt,
            extraConditions: [eq(cmsTerms.taxonomyId, TAXONOMY_ID)],
          },
          'Tag'
        );
      }

      await ctx.db
        .update(cmsTerms)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(cmsTerms.id, id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.update',
        entityType: 'tag',
        entityId: id,
        entityTitle: existing.name,
      });

      return { success: true };
    }),

  /** Soft-delete (trash) a tag */
  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softDelete(ctx.db, crudCols, input.id);
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.delete',
        entityType: 'tag',
        entityId: input.id,
      });
      return { success: true };
    }),

  /** Restore from trash */
  restore: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await softRestore(ctx.db, crudCols, input.id);
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.restore',
        entityType: 'tag',
        entityId: input.id,
      });
      return { success: true };
    }),

  /** Permanently delete a trashed tag */
  permanentDelete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await permanentDelete(ctx.db, crudCols, input.id, 'tag', async (tx) => {
        await deleteTermRelationshipsByTerm(tx, input.id, TAXONOMY_ID);
      });
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.permanentDelete',
        entityType: 'tag',
        entityId: input.id,
      });
      return { success: true };
    }),

  /** Tag-input: get or create tag by name */
  getOrCreate: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        lang: z.string().min(2).max(2).default('en'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = slugify(input.name);

      // Try to find existing (including soft-deleted)
      const [existing] = await ctx.db
        .select()
        .from(cmsTerms)
        .where(
          and(
            eq(cmsTerms.taxonomyId, TAXONOMY_ID),
            eq(cmsTerms.slug, slug),
            eq(cmsTerms.lang, input.lang)
          )
        )
        .limit(1);

      if (existing) {
        // Restore if trashed, update name if it changed
        if (existing.deletedAt) {
          await ctx.db
            .update(cmsTerms)
            .set({
              deletedAt: null,
              name: input.name,
              status: ContentStatus.PUBLISHED,
              updatedAt: new Date(),
            })
            .where(eq(cmsTerms.id, existing.id));
          return { ...existing, deletedAt: null, name: input.name, status: ContentStatus.PUBLISHED };
        }
        return existing;
      }

      // Create — retry on unique constraint race condition
      try {
        const [tag] = await ctx.db
          .insert(cmsTerms)
          .values({
            taxonomyId: TAXONOMY_ID,
            name: input.name,
            slug,
            lang: input.lang,
            status: ContentStatus.PUBLISHED,
          })
          .returning();

        return tag!;
      } catch (err: unknown) {
        // Unique constraint violation (concurrent insert) — re-fetch
        const code = (err as { code?: string })?.code;
        if (code === '23505') {
          const [raced] = await ctx.db
            .select()
            .from(cmsTerms)
            .where(
              and(
                eq(cmsTerms.taxonomyId, TAXONOMY_ID),
                eq(cmsTerms.slug, slug),
                eq(cmsTerms.lang, input.lang)
              )
            )
            .limit(1);
          if (raced) return raced;
        }
        throw err;
      }
    }),

  /** Public: get a published tag by slug */
  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().max(255),
        lang: z.string().max(2).default('en'),
      })
    )
    .query(async ({ ctx, input }) => {
      const [tag] = await ctx.db
        .select()
        .from(cmsTerms)
        .where(
          and(
            eq(cmsTerms.taxonomyId, TAXONOMY_ID),
            eq(cmsTerms.slug, input.slug),
            eq(cmsTerms.lang, input.lang),
            eq(cmsTerms.status, ContentStatus.PUBLISHED),
            isNull(cmsTerms.deletedAt)
          )
        )
        .limit(1);

      if (!tag) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
      }
      return tag;
    }),

  /** Public: list published tags */
  listPublished: publicProcedure
    .input(
      z.object({
        lang: z.string().max(2).default('en'),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = and(
        eq(cmsTerms.taxonomyId, TAXONOMY_ID),
        eq(cmsTerms.lang, input.lang),
        eq(cmsTerms.status, ContentStatus.PUBLISHED),
        isNull(cmsTerms.deletedAt)
      );

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsTerms)
          .where(conditions)
          .orderBy(cmsTerms.order)
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsTerms)
          .where(conditions),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      return paginatedResult(items, total, page, pageSize);
    }),

  /** Public: search tags for autocomplete (with post count) */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        lang: z.string().max(2).default('en'),
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      return ctx.db
        .select({
          id: cmsTerms.id,
          name: cmsTerms.name,
          slug: cmsTerms.slug,
          count: sql<number>`count(${cmsTermRelationships.objectId})`.as('count'),
        })
        .from(cmsTerms)
        .leftJoin(
          cmsTermRelationships,
          and(
            eq(cmsTerms.id, cmsTermRelationships.termId),
            eq(cmsTermRelationships.taxonomyId, TAXONOMY_ID)
          )
        )
        .where(
          and(
            eq(cmsTerms.taxonomyId, TAXONOMY_ID),
            eq(cmsTerms.lang, input.lang),
            eq(cmsTerms.status, ContentStatus.PUBLISHED),
            isNull(cmsTerms.deletedAt),
            or(ilike(cmsTerms.name, pattern), ilike(cmsTerms.slug, pattern))
          )
        )
        .groupBy(cmsTerms.id, cmsTerms.name, cmsTerms.slug)
        .orderBy(desc(sql`count(${cmsTermRelationships.objectId})`), cmsTerms.name)
        .limit(input.limit);
    }),

  /** Public: get tags for a specific object (post/category) */
  getForObject: publicProcedure
    .input(z.object({ objectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await resolveTagsForPosts(ctx.db, [
        { id: input.objectId },
      ]);
      return result[0]?.tags ?? [];
    }),

  /** Public: list popular tags by relationship count */
  listPopular: publicProcedure
    .input(
      z.object({
        lang: z.string().max(2).default('en'),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: cmsTerms.id,
          name: cmsTerms.name,
          slug: cmsTerms.slug,
          count: sql<number>`count(${cmsTermRelationships.objectId})`.as('count'),
        })
        .from(cmsTerms)
        .innerJoin(
          cmsTermRelationships,
          and(
            eq(cmsTerms.id, cmsTermRelationships.termId),
            eq(cmsTermRelationships.taxonomyId, TAXONOMY_ID)
          )
        )
        .where(
          and(
            eq(cmsTerms.taxonomyId, TAXONOMY_ID),
            eq(cmsTerms.lang, input.lang),
            eq(cmsTerms.status, ContentStatus.PUBLISHED),
            isNull(cmsTerms.deletedAt)
          )
        )
        .groupBy(cmsTerms.id, cmsTerms.name, cmsTerms.slug)
        .orderBy(desc(sql`count(${cmsTermRelationships.objectId})`))
        .limit(input.limit);
    }),

  /** Admin: bulk soft-delete tags */
  bulkDelete: contentProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return { count: 0 };
      await ctx.db
        .update(cmsTerms)
        .set({ deletedAt: new Date() })
        .where(
          and(
            inArray(cmsTerms.id, input.ids),
            eq(cmsTerms.taxonomyId, TAXONOMY_ID),
            isNull(cmsTerms.deletedAt)
          )
        );
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.bulkDelete',
        entityType: 'tag',
        entityId: 'bulk',
        metadata: { ids: input.ids },
      });
      return { count: input.ids.length };
    }),

  /** Admin: bulk permanent delete tags + cleanup relationships */
  bulkPermanentDelete: contentProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return { count: 0 };
      for (const id of input.ids) {
        await permanentDelete(ctx.db, crudCols, id, 'tag', async (tx) => {
          await deleteTermRelationshipsByTerm(tx, id, TAXONOMY_ID);
        });
      }
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.bulkPermanentDelete',
        entityType: 'tag',
        entityId: 'bulk',
        metadata: { ids: input.ids },
      });
      return { count: input.ids.length };
    }),

  /** Admin: update status of a single tag (for bulk actions) */
  updateStatus: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.number().int().min(0).max(2),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await fetchOrNotFound<typeof cmsTerms.$inferSelect>(
        ctx.db, cmsTerms, input.id, 'Tag',
        [eq(cmsTerms.taxonomyId, TAXONOMY_ID)],
      );

      await ctx.db
        .update(cmsTerms)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(cmsTerms.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.updateStatus',
        entityType: 'tag',
        entityId: input.id,
        metadata: { status: input.status },
      });

      return { success: true };
    }),

  /** Admin: bulk publish tags */
  bulkPublish: contentProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return { count: 0 };
      await ctx.db
        .update(cmsTerms)
        .set({ status: ContentStatus.PUBLISHED, updatedAt: new Date() })
        .where(
          and(
            inArray(cmsTerms.id, input.ids),
            eq(cmsTerms.taxonomyId, TAXONOMY_ID)
          )
        );
      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'tag.bulkPublish',
        entityType: 'tag',
        entityId: 'bulk',
        metadata: { ids: input.ids },
      });
      return { count: input.ids.length };
    }),

  /** Admin: taxonomy stats overview */
  stats: contentProcedure.query(async ({ ctx }) => {
    const baseCondition = eq(cmsTerms.taxonomyId, TAXONOMY_ID);

    const [totalResult, publishedResult, relCountResult, orphanedResult, topTags] =
      await Promise.all([
        // Total tags (non-deleted)
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsTerms)
          .where(and(baseCondition, isNull(cmsTerms.deletedAt))),
        // Published tags
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsTerms)
          .where(
            and(
              baseCondition,
              eq(cmsTerms.status, ContentStatus.PUBLISHED),
              isNull(cmsTerms.deletedAt)
            )
          ),
        // Total relationships
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsTermRelationships)
          .where(eq(cmsTermRelationships.taxonomyId, TAXONOMY_ID)),
        // Orphaned tags (0 relationships)
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(cmsTerms)
          .leftJoin(
            cmsTermRelationships,
            and(
              eq(cmsTerms.id, cmsTermRelationships.termId),
              eq(cmsTermRelationships.taxonomyId, TAXONOMY_ID)
            )
          )
          .where(
            and(
              baseCondition,
              isNull(cmsTerms.deletedAt),
              sql`${cmsTermRelationships.objectId} is null`
            )
          ),
        // Top 10 tags
        ctx.db
          .select({
            name: cmsTerms.name,
            slug: cmsTerms.slug,
            count: sql<number>`count(${cmsTermRelationships.objectId})`.as('count'),
          })
          .from(cmsTerms)
          .innerJoin(
            cmsTermRelationships,
            and(
              eq(cmsTerms.id, cmsTermRelationships.termId),
              eq(cmsTermRelationships.taxonomyId, TAXONOMY_ID)
            )
          )
          .where(and(baseCondition, isNull(cmsTerms.deletedAt)))
          .groupBy(cmsTerms.name, cmsTerms.slug)
          .orderBy(desc(sql`count(${cmsTermRelationships.objectId})`))
          .limit(10),
      ]);

    return {
      totalTags: Number(totalResult[0]?.count ?? 0),
      publishedTags: Number(publishedResult[0]?.count ?? 0),
      totalRelationships: Number(relCountResult[0]?.count ?? 0),
      orphanedTags: Number(orphanedResult[0]?.count ?? 0),
      topTags,
    };
  }),
});
