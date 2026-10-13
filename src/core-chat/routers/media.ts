import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { chatMedia } from '@/core-chat/schema/media';
import { createLogger } from '@/core/lib/infra/logger';
import {
  getUploadMaxImagePx,
  normalizeImage,
} from '@/core/lib/media/normalize-image';
import { getStorage } from '@/core/storage';
import { db } from '@/server/db';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const logger = createLogger('chat-media');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const chatMediaRouter = createTRPCRouter({
  /** Upload an image for chat (user attachment) */
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        mimeType: z.string().refine((v) => ALLOWED_TYPES.includes(v), {
          message: 'Only JPEG, PNG, and WebP images are allowed',
        }),
        /** Base64-encoded image data */
        data: z.string().max(MAX_FILE_SIZE * 1.4), // base64 is ~1.37x larger
        conversationId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Decode base64
      const raw = Buffer.from(input.data, 'base64');
      if (raw.length > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `File too large. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
        });
      }

      // Privacy pass before storage: sniffs the bytes against the declared
      // type, bakes in orientation, strips EXIF/GPS/XMP, caps the longest side.
      // A failure rejects the upload — never store the unprocessed original.
      let buffer: Buffer;
      let width: number;
      let height: number;
      try {
        const normalized = await normalizeImage(raw, input.mimeType, {
          maxPx: getUploadMaxImagePx(),
        });
        buffer = normalized.buffer;
        width = normalized.width;
        height = normalized.height;
      } catch (err) {
        logger.warn('Chat image normalisation failed', {
          userId,
          mimeType: input.mimeType,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Image could not be processed.',
        });
      }

      // Generate filepath
      const ext =
        input.mimeType === 'image/png'
          ? 'png'
          : input.mimeType === 'image/webp'
            ? 'webp'
            : 'jpg';
      const mediaId = crypto.randomUUID();
      const filepath = `chat/${input.conversationId}/${mediaId}.${ext}`;

      // Upload to storage
      const storage = getStorage();
      await storage.upload(filepath, buffer, { contentType: input.mimeType });

      // Insert media record — size/dimensions describe the stored bytes.
      const [media] = await db
        .insert(chatMedia)
        .values({
          id: mediaId,
          userId,
          filename: input.filename,
          filepath,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          width,
          height,
          purpose: 'message',
        })
        .returning();

      return {
        id: media!.id,
        url: storage.url(filepath),
        width,
        height,
      };
    }),
});
