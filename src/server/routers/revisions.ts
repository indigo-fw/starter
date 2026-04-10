import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';

import { cmsPosts, cmsCategories, cmsContentRevisions } from '@/server/db/schema';
import { getRevisions } from '@/core/crud/content-revisions';
import { logAudit } from '@/core/lib/infra/audit';
import { createTRPCRouter, sectionProcedure } from '../trpc';

const contentProcedure = sectionProcedure('content');

/** Only these fields are allowed when restoring a revision */
const SAFE_POST_FIELDS = new Set([
  'title',
  'slug',
  'content',
  'status',
  'metaDescription',
  'seoTitle',
  'featuredImage',
  'featuredImageAlt',
  'jsonLd',
  'noindex',
  'publishedAt',
  'lang',
]);

const SAFE_CATEGORY_FIELDS = new Set([
  'name',
  'slug',
  'title',
  'text',
  'status',
  'metaDescription',
  'seoTitle',
  'icon',
  'order',
  'noindex',
  'publishedAt',
  'lang',
]);

function filterSnapshot(
  snapshot: Record<string, unknown>,
  allowedKeys: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (allowedKeys.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

export const revisionsRouter = createTRPCRouter({
  /** List revisions for a content item */
  list: contentProcedure
    .input(
      z.object({
        contentType: z.string().max(30),
        contentId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      return getRevisions(ctx.db, input.contentType, input.contentId, input.limit);
    }),

  /** Get a single revision */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [revision] = await ctx.db
        .select()
        .from(cmsContentRevisions)
        .where(eq(cmsContentRevisions.id, input.id))
        .limit(1);

      if (!revision) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Revision not found' });
      }

      return revision;
    }),

  /** Count revisions for a content item */
  count: contentProcedure
    .input(
      z.object({
        contentType: z.string().max(30),
        contentId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ count: count() })
        .from(cmsContentRevisions)
        .where(
          and(
            eq(cmsContentRevisions.contentType, input.contentType),
            eq(cmsContentRevisions.contentId, input.contentId)
          )
        );
      return result?.count ?? 0;
    }),

  /** Restore a revision — overwrites the content item with safe snapshot fields only */
  restore: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [revision] = await ctx.db
        .select()
        .from(cmsContentRevisions)
        .where(eq(cmsContentRevisions.id, input.id))
        .limit(1);

      if (!revision) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Revision not found' });
      }

      const rawSnapshot = revision.snapshot as Record<string, unknown>;

      if (['page', 'blog', 'post'].includes(revision.contentType)) {
        const safeData = filterSnapshot(rawSnapshot, SAFE_POST_FIELDS);
        if (Object.keys(safeData).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Revision snapshot contains no restorable fields',
          });
        }
        await ctx.db
          .update(cmsPosts)
          .set({ ...safeData, updatedAt: new Date() })
          .where(eq(cmsPosts.id, revision.contentId));
      } else if (revision.contentType === 'category') {
        const safeData = filterSnapshot(rawSnapshot, SAFE_CATEGORY_FIELDS);
        if (Object.keys(safeData).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Revision snapshot contains no restorable fields',
          });
        }
        await ctx.db
          .update(cmsCategories)
          .set({ ...safeData, updatedAt: new Date() })
          .where(eq(cmsCategories.id, revision.contentId));
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unknown content type: ${revision.contentType}`,
        });
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'revision.restore',
        entityType: revision.contentType,
        entityId: revision.contentId,
        metadata: { revisionId: input.id },
      });

      return { success: true };
    }),
});
