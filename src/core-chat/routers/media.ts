import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatMedia } from '@/core-chat/schema/media';
import { getStorage } from '@/core/storage';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const chatMediaRouter = createTRPCRouter({
  /** Upload an image for chat (user attachment) */
  upload: protectedProcedure
    .input(z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().refine((v) => ALLOWED_TYPES.includes(v), {
        message: 'Only JPEG, PNG, and WebP images are allowed',
      }),
      /** Base64-encoded image data */
      data: z.string().max(MAX_FILE_SIZE * 1.4), // base64 is ~1.37x larger
      conversationId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Decode base64
      const buffer = Buffer.from(input.data, 'base64');
      if (buffer.length > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        });
      }

      // Generate filepath
      const ext = input.mimeType === 'image/png' ? 'png'
        : input.mimeType === 'image/webp' ? 'webp'
        : 'jpg';
      const mediaId = crypto.randomUUID();
      const filepath = `chat/${input.conversationId}/${mediaId}.${ext}`;

      // Upload to storage
      const storage = getStorage();
      await storage.upload(filepath, buffer);

      // Get dimensions (best-effort via sharp if available)
      let width: number | undefined;
      let height: number | undefined;
      try {
        const sharp = (await import('sharp')).default;
        const metadata = await sharp(buffer).metadata();
        width = metadata.width;
        height = metadata.height;
      } catch {
        // sharp not available or invalid image
      }

      // Insert media record
      const [media] = await db.insert(chatMedia).values({
        id: mediaId,
        userId,
        filename: input.filename,
        filepath,
        mimeType: input.mimeType,
        fileSize: buffer.length,
        width: width ?? null,
        height: height ?? null,
        purpose: 'message',
      }).returning();

      return {
        id: media!.id,
        url: storage.url(filepath),
        width,
        height,
      };
    }),
});
