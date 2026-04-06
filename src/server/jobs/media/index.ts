import { eq } from 'drizzle-orm';

import { createQueue, createWorker } from '@/core/lib/queue';
import { enqueue } from '@/core/lib/queue-adapter';
import { processImage } from '@/core/lib/media-processing';
import { getStorage } from '@/core/storage';
import { createLogger } from '@/core/lib/logger';
import { FileType } from '@/core/types/cms';
import { db } from '@/server/db';
import { cmsMedia } from '@/server/db/schema';

const log = createLogger('media-worker');

const _mediaQueue = createQueue('media-processing');

/** Max file size for image processing (50 MB) */
const MAX_PROCESSING_SIZE = 50 * 1024 * 1024;

/** MIME types that Sharp can process */
const PROCESSABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/tiff',
]);

interface MediaProcessingPayload {
  mediaId: string;
}

/**
 * Enqueue a media file for processing (thumbnail, medium, WebP, blur).
 * Only enqueues processable image files under the size limit.
 */
export async function enqueueMediaProcessing(
  mediaId: string,
  mimeType: string,
  fileSize: number
): Promise<void> {
  if (!PROCESSABLE_TYPES.has(mimeType)) return;
  if (fileSize > MAX_PROCESSING_SIZE) return;

  await enqueue('media-processing', { mediaId } satisfies MediaProcessingPayload);
}

async function processMediaJob(payload: MediaProcessingPayload): Promise<void> {
  const [media] = await db
    .select()
    .from(cmsMedia)
    .where(eq(cmsMedia.id, payload.mediaId))
    .limit(1);

  if (!media) {
    log.warn('Media not found, skipping', { mediaId: payload.mediaId });
    return;
  }

  if (media.fileType !== FileType.IMAGE) {
    return;
  }

  // Already processed
  if (media.thumbnailPath && media.mediumPath && media.blurDataUrl) {
    return;
  }

  // Guard: skip files that are too large
  if (media.fileSize > MAX_PROCESSING_SIZE) {
    log.warn('Media file too large for processing', {
      mediaId: media.id,
      fileSize: media.fileSize,
    });
    return;
  }

  // Guard: skip non-processable MIME types
  if (!PROCESSABLE_TYPES.has(media.mimeType)) {
    return;
  }

  const storage = getStorage();

  let buffer: Buffer;
  try {
    buffer = await storage.download(media.filepath);
  } catch (err) {
    log.error('Failed to download media file', {
      mediaId: media.id,
      filepath: media.filepath,
      error: String(err),
    });
    throw err; // Let BullMQ retry
  }

  let result;
  try {
    result = await processImage(buffer);
  } catch (err) {
    log.error('Sharp processing failed', {
      mediaId: media.id,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      error: String(err),
    });
    // Don't retry — if Sharp can't process it, it won't succeed next time either
    return;
  }

  // Derive paths from the original filepath
  const dir = media.filepath.substring(0, media.filepath.lastIndexOf('/'));
  const baseName = media.id;

  const thumbPath = `${dir}/thumb-${baseName}.webp`;
  const mediumPath = `${dir}/medium-${baseName}.webp`;

  // Upload generated variants
  try {
    await Promise.all([
      storage.upload(thumbPath, result.thumbnail),
      storage.upload(mediumPath, result.medium),
    ]);
  } catch (err) {
    log.error('Failed to upload processed variants', {
      mediaId: media.id,
      error: String(err),
    });
    throw err; // Let BullMQ retry
  }

  // Update the media record
  await db
    .update(cmsMedia)
    .set({
      thumbnailPath: thumbPath,
      mediumPath: mediumPath,
      blurDataUrl: result.blurDataUrl,
    })
    .where(eq(cmsMedia.id, media.id));

  log.info('Media processed', {
    mediaId: media.id,
    thumbPath,
    mediumPath,
  });
}

export function startMediaWorker(): void {
  createWorker('media-processing', async (job) => {
    await processMediaJob(job.data as MediaProcessingPayload);
  });
  log.info('Media processing worker started');
}
