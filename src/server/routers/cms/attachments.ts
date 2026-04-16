import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { cmsPostAttachments } from '@/server/db/schema';
import { getStorage } from '@/core/storage';
import { createTRPCRouter } from '../../trpc';
import { contentProcedure } from './_shared';

export const cmsAttachmentsRouter = createTRPCRouter({
  /** List attachments for a post */
  listAttachments: contentProcedure
    .input(z.object({ postId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const storage = getStorage();
      const items = await ctx.db
        .select()
        .from(cmsPostAttachments)
        .where(
          and(
            eq(cmsPostAttachments.postId, input.postId),
            isNull(cmsPostAttachments.deletedAt)
          )
        )
        .orderBy(desc(cmsPostAttachments.createdAt))
        .limit(100);

      return items.map((a) => ({
        ...a,
        url: storage.url(a.filepath),
      }));
    }),

  /** Add an attachment to a post */
  addAttachment: contentProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        filepath: z.string().max(1024),
        filename: z.string().max(255),
        mimeType: z.string().max(100),
        fileSize: z.number().int().min(0),
        fileType: z.number().int().min(1).max(4),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [attachment] = await ctx.db
        .insert(cmsPostAttachments)
        .values({
          postId: input.postId,
          filepath: input.filepath,
          filename: input.filename,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          fileType: input.fileType,
          uploadedById: ctx.session.user.id,
        })
        .returning();

      return attachment;
    }),

  /** Update attachment alt text */
  updateAttachment: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        altText: z.string().max(255).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(cmsPostAttachments)
        .set({ altText: input.altText })
        .where(eq(cmsPostAttachments.id, input.id))
        .returning({ id: cmsPostAttachments.id });

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
      }
      return { success: true };
    }),

  /** Soft-delete an attachment */
  deleteAttachment: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(cmsPostAttachments)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(cmsPostAttachments.id, input.id),
            isNull(cmsPostAttachments.deletedAt)
          )
        )
        .returning({ id: cmsPostAttachments.id });

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found' });
      }
      return { success: true };
    }),
});
