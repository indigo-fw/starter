import { createTRPCRouter, sectionProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  createRevision,
  getRevisions,
  pickSnapshot,
} from '@/core/crud/content-revisions';
import { logAudit } from '@/core/lib/infra/audit';
import type { DbClient } from '@/server/db';
import {
  cmsCategories,
  cmsContentRevisions,
  cmsPortfolio,
  cmsPosts,
  cmsShowcase,
} from '@/server/db/schema';

const contentProcedure = sectionProcedure('content');

/**
 * Restore registry: maps each revision `contentType` to the snapshot fields that
 * are safe to write back plus a typed update closure for its target table. Field
 * allowlists must mirror the `*_SNAPSHOT_KEYS` used by each router when it records
 * revisions (posts.ts, categories.ts, portfolio.ts, showcase.ts) — otherwise a
 * restore silently drops fields (e.g. the category body is snapshotted under
 * `content`, not `text`). The per-type `applyRestore` closure keeps drizzle's
 * column typing intact instead of updating through a generic `PgTable`.
 */
interface RestoreTarget {
  fields: Set<string>;
  /**
   * Snapshot keys a restore cannot do without. Guards against corrupted jsonb
   * or very old revisions predating a schema change silently blanking a row.
   */
  required: readonly string[];
  /** Live row (including `deletedAt`) — snapshotted before the overwrite so the restore is undoable. */
  fetchCurrent: (
    db: DbClient,
    contentId: string
  ) => Promise<Record<string, unknown> | undefined>;
  applyRestore: (
    db: DbClient,
    contentId: string,
    safeData: Record<string, unknown>
  ) => Promise<void>;
}

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
  'content',
  'status',
  'metaDescription',
  'seoTitle',
  'icon',
  'order',
  'noindex',
  'publishedAt',
  'lang',
]);

const SAFE_PORTFOLIO_FIELDS = new Set([
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
]);

const SAFE_SHOWCASE_FIELDS = new Set([
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
]);

const restorePost: RestoreTarget['applyRestore'] = (db, contentId, safeData) =>
  db
    .update(cmsPosts)
    .set({ ...safeData, updatedAt: new Date() })
    .where(eq(cmsPosts.id, contentId))
    .then(() => undefined);

const fetchPost: RestoreTarget['fetchCurrent'] = (db, contentId) =>
  db
    .select()
    .from(cmsPosts)
    .where(eq(cmsPosts.id, contentId))
    .limit(1)
    .then(([row]) => row);

const POST_TARGET: RestoreTarget = {
  fields: SAFE_POST_FIELDS,
  required: ['title', 'slug'],
  fetchCurrent: fetchPost,
  applyRestore: restorePost,
};

/** contentType → restore target. Page/blog/post all restore into cmsPosts. */
const RESTORE_TARGETS: Record<string, RestoreTarget> = {
  page: POST_TARGET,
  blog: POST_TARGET,
  post: POST_TARGET,
  category: {
    fields: SAFE_CATEGORY_FIELDS,
    required: ['name', 'slug'],
    fetchCurrent: (db, contentId) =>
      db
        .select()
        .from(cmsCategories)
        .where(eq(cmsCategories.id, contentId))
        .limit(1)
        .then(([row]) => row),
    applyRestore: (db, contentId, safeData) =>
      db
        .update(cmsCategories)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(cmsCategories.id, contentId))
        .then(() => undefined),
  },
  portfolio: {
    fields: SAFE_PORTFOLIO_FIELDS,
    required: ['name', 'slug'],
    fetchCurrent: (db, contentId) =>
      db
        .select()
        .from(cmsPortfolio)
        .where(eq(cmsPortfolio.id, contentId))
        .limit(1)
        .then(([row]) => row),
    applyRestore: (db, contentId, safeData) =>
      db
        .update(cmsPortfolio)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(cmsPortfolio.id, contentId))
        .then(() => undefined),
  },
  showcase: {
    fields: SAFE_SHOWCASE_FIELDS,
    required: ['title', 'slug'],
    fetchCurrent: (db, contentId) =>
      db
        .select()
        .from(cmsShowcase)
        .where(eq(cmsShowcase.id, contentId))
        .limit(1)
        .then(([row]) => row),
    applyRestore: (db, contentId, safeData) =>
      db
        .update(cmsShowcase)
        .set({ ...safeData, updatedAt: new Date() })
        .where(eq(cmsShowcase.id, contentId))
        .then(() => undefined),
  },
};

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
      return getRevisions(
        ctx.db,
        input.contentType,
        input.contentId,
        input.limit
      );
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Revision not found',
        });
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
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Revision not found',
        });
      }

      const rawSnapshot = revision.snapshot as Record<string, unknown>;

      const target = RESTORE_TARGETS[revision.contentType];
      if (!target) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Unknown content type: ${revision.contentType}`,
        });
      }

      const safeData = filterSnapshot(rawSnapshot, target.fields);
      if (Object.keys(safeData).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Revision snapshot contains no restorable fields',
        });
      }

      const missing = target.required.filter((key) => !(key in safeData));
      if (missing.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Revision snapshot is missing required fields: ${missing.join(', ')}`,
        });
      }

      // Trashed content keeps its revisions; restoring into it would silently
      // edit a row nobody can see. Un-trash first, then restore.
      const current = await target.fetchCurrent(ctx.db, revision.contentId);
      if (!current || current.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message:
            'Content not found or in trash — restore it from trash first',
        });
      }

      // Snapshot the live state before overwriting so the restore itself can be
      // undone from the revision list; same transaction so a failed update
      // doesn't leave a phantom revision behind.
      await ctx.db.transaction(async (tx) => {
        await createRevision(
          tx,
          revision.contentType,
          revision.contentId,
          pickSnapshot(current, [...target.fields]),
          ctx.session.user.id
        );
        await target.applyRestore(tx, revision.contentId, safeData);
      });

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
