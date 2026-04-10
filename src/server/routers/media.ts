import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

import { cmsMedia } from '@/server/db/schema';
import { getStorage } from '@/core/storage';
import { slugifyFilename } from '@/core/lib/content/slug';
import { FileType } from '@/core/types/cms';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/infra/audit';
import { enqueueMediaProcessing } from '@/server/jobs/media/index';
import {
  createTRPCRouter,
  publicProcedure,
  sectionProcedure,
} from '../trpc';

const mediaProcedure = sectionProcedure('media');

function getFileType(mimeType: string): number {
  if (mimeType.startsWith('image/')) return FileType.IMAGE;
  if (mimeType.startsWith('video/')) return FileType.VIDEO;
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('text/')
  )
    return FileType.DOCUMENT;
  return FileType.OTHER;
}

export const mediaRouter = createTRPCRouter({
  /** Count total media files */
  count: mediaProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: count() })
      .from(cmsMedia)
      .where(isNull(cmsMedia.deletedAt));
    return { count: row?.count ?? 0 };
  }),

  /** List media files */
  list: mediaProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        fileType: z.number().int().optional(),
        uploadedById: z.string().max(200).optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [isNull(cmsMedia.deletedAt)];
      if (input.fileType != null) {
        conditions.push(eq(cmsMedia.fileType, input.fileType));
      }
      if (input.uploadedById) {
        conditions.push(eq(cmsMedia.uploadedById, input.uploadedById));
      }
      if (input.search) {
        const pattern = `%${input.search}%`;
        conditions.push(
          or(
            ilike(cmsMedia.filename, pattern),
            ilike(cmsMedia.title, pattern),
            ilike(cmsMedia.altText, pattern),
          )!,
        );
      }

      const where = and(...conditions);

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsMedia)
          .where(where)
          .orderBy(desc(cmsMedia.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(cmsMedia)
          .where(where),
      ]);

      // Add URL to each item
      const storage = getStorage();
      const withUrls = items.map((item) => ({
        ...item,
        url: storage.url(item.filepath),
      }));

      const total = Number(countResult[0]?.count ?? 0);
      return paginatedResult(withUrls, total, page, pageSize);
    }),

  /** Register an uploaded file in the media library */
  register: mediaProcedure
    .input(
      z.object({
        filename: z.string().max(255),
        filepath: z.string().max(1024),
        mimeType: z.string().max(100),
        fileSize: z.number().int().min(0),
        title: z.string().max(255).optional(),
        altText: z.string().max(255).optional(),
        description: z.string().max(5000).optional(),
        width: z.number().int().min(0).optional(),
        height: z.number().int().min(0).optional(),
        thumbnailPath: z.string().max(1024).optional(),
        mediumPath: z.string().max(1024).optional(),
        blurDataUrl: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const safeFilename = slugifyFilename(input.filename);
      const fileType = getFileType(input.mimeType);

      const [media] = await ctx.db
        .insert(cmsMedia)
        .values({
          filename: safeFilename,
          filepath: input.filepath,
          fileType,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          title: input.title ?? null,
          altText: input.altText ?? null,
          description: input.description ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          thumbnailPath: input.thumbnailPath ?? null,
          mediumPath: input.mediumPath ?? null,
          blurDataUrl: input.blurDataUrl ?? null,
          uploadedById: ctx.session.user.id,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'media.upload',
        entityType: 'media',
        entityId: media!.id,
        entityTitle: safeFilename,
      });

      // Enqueue image processing (thumbnail, medium, blur — fire-and-forget)
      enqueueMediaProcessing(media!.id, input.mimeType, input.fileSize).catch(() => {});

      return media!;
    }),

  /** Update media metadata */
  update: mediaProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(255).optional(),
        altText: z.string().max(255).optional(),
        description: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [existing] = await ctx.db
        .select()
        .from(cmsMedia)
        .where(and(eq(cmsMedia.id, id), isNull(cmsMedia.deletedAt)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Media file not found' });
      }

      const setData: Record<string, unknown> = {};
      if (updates.title !== undefined) setData.title = updates.title || null;
      if (updates.altText !== undefined) setData.altText = updates.altText || null;
      if (updates.description !== undefined) setData.description = updates.description || null;

      if (Object.keys(setData).length === 0) return existing;

      const [updated] = await ctx.db
        .update(cmsMedia)
        .set(setData)
        .where(eq(cmsMedia.id, id))
        .returning();

      return updated!;
    }),

  /** Soft-delete a media file */
  delete: mediaProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(cmsMedia)
        .where(
          and(eq(cmsMedia.id, input.id), isNull(cmsMedia.deletedAt))
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Media file not found',
        });
      }

      await ctx.db
        .update(cmsMedia)
        .set({ deletedAt: new Date() })
        .where(eq(cmsMedia.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'media.delete',
        entityType: 'media',
        entityId: input.id,
        entityTitle: existing.filename,
      });

      return { success: true };
    }),

  /** Public: get media URLs by IDs (for gallery shortcode) */
  getByIds: publicProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return [];

      const items = await ctx.db
        .select({
          id: cmsMedia.id,
          filepath: cmsMedia.filepath,
          altText: cmsMedia.altText,
          width: cmsMedia.width,
          height: cmsMedia.height,
          thumbnailPath: cmsMedia.thumbnailPath,
          mediumPath: cmsMedia.mediumPath,
          blurDataUrl: cmsMedia.blurDataUrl,
        })
        .from(cmsMedia)
        .where(
          and(
            inArray(cmsMedia.id, input.ids),
            isNull(cmsMedia.deletedAt)
          )
        )
        .limit(50);

      const storage = getStorage();
      return items.map((item) => ({
        id: item.id,
        url: storage.url(item.filepath),
        altText: item.altText,
        width: item.width,
        height: item.height,
        thumbnailUrl: item.thumbnailPath ? storage.url(item.thumbnailPath) : null,
        mediumUrl: item.mediumPath ? storage.url(item.mediumPath) : null,
        blurDataUrl: item.blurDataUrl,
      }));
    }),
});
