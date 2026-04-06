import { eq } from 'drizzle-orm';
import { createQueue, createWorker } from '@/core/lib/queue';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { chatMedia } from '@/core-chat/schema/media';
import { getStorage } from '@/core/storage';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const logger = createLogger('chat-optimize-video');
const _queue = createQueue('chat-optimize-video');

/**
 * Check if ffmpeg is available on the system.
 */
function isFfmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function startVideoOptimizationWorker(): void {
  if (!isFfmpegAvailable()) {
    logger.warn('ffmpeg not found — video optimization disabled');
    return;
  }

  createWorker('chat-optimize-video', async (job) => {
    const { mediaId } = job.data as { mediaId: string };

    try {
      // Load media record
      const [media] = await db
        .select()
        .from(chatMedia)
        .where(eq(chatMedia.id, mediaId))
        .limit(1);

      if (!media || media.optimizationStatus === 'optimized') return;

      const storage = getStorage();
      const sourceUrl = media.filepath;

      // Create temp directory
      const tmpDir = mkdtempSync(join(tmpdir(), 'chat-video-'));
      const inputPath = join(tmpDir, 'input.mp4');
      const outputPath = join(tmpDir, 'output.mp4');

      try {
        // Download source video
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(inputPath, buffer);

        // Run ffmpeg 2-pass x264 encoding
        execSync(
          `ffmpeg -i "${inputPath}" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`,
          { stdio: 'ignore', timeout: 300_000 }, // 5 min timeout
        );

        // Read optimized file
        const optimized = readFileSync(outputPath);

        // Upload optimized version
        const optimizedPath = media.filepath.replace(/\.mp4$/, '-opt.mp4');
        await storage.upload(optimizedPath, optimized);

        // Update media record
        await db.update(chatMedia).set({
          sourceFilepath: media.filepath, // Keep original URL
          filepath: storage.url(optimizedPath),
          fileSize: optimized.length,
          optimizationStatus: 'optimized',
        }).where(eq(chatMedia.id, mediaId));

        logger.info('Video optimized', {
          mediaId,
          originalSize: buffer.length,
          optimizedSize: optimized.length,
          ratio: `${Math.round((optimized.length / buffer.length) * 100)}%`,
        });
      } finally {
        // Cleanup temp files
        try { unlinkSync(inputPath); } catch { /* */ }
        try { unlinkSync(outputPath); } catch { /* */ }
        try { unlinkSync(tmpDir); } catch { /* */ }
      }
    } catch (err) {
      logger.error('Video optimization failed', {
        error: err instanceof Error ? err.message : String(err),
        mediaId,
      });

      await db.update(chatMedia).set({ optimizationStatus: 'failed' })
        .where(eq(chatMedia.id, mediaId)).catch(() => {});
    }
  }, 1); // concurrency: 1 (CPU-intensive)
}

/** Enqueue a video for optimization */
export function enqueueVideoOptimization(mediaId: string): void {
  _queue?.add('optimize', { mediaId }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    jobId: `optimize-${mediaId}`,
  }).catch(() => {
    // Queue not available
  });
}
