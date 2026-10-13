/**
 * Image processing — generates thumbnails, medium-size variants, and blur placeholders.
 *
 * Uses sharp for image manipulation. If sharp is not installed, throws at runtime.
 */
import type Sharp from 'sharp';

export interface ProcessedImage {
  /** WebP thumbnail (150x150, cropped) */
  thumbnail: Buffer;
  /** WebP medium variant (800px wide, preserved aspect ratio) */
  medium: Buffer;
  /** Base64-encoded tiny blur placeholder (10px wide) */
  blurDataUrl: string;
}

let sharpConfigured = false;

/**
 * Bound libvips' NATIVE memory — call once per process before building any
 * pipeline (idempotent). Without it sharp runs with libvips defaults: a
 * per-process operation cache plus a worker pool sized to the CPU count, so
 * a 16-core box can hold 16 full-size decoded bitmaps at once — all of it
 * OUTSIDE the JS heap. That is the signature of "RSS in the gigabytes while
 * heapUsed stays flat" in a long-running server that processes uploads.
 */
export function configureSharp(sharp: typeof Sharp): void {
  if (sharpConfigured) return;
  sharpConfigured = true;
  sharp.cache({ memory: 64, files: 20, items: 100 });
  sharp.concurrency(2);
}

/**
 * Process a raw image buffer into optimized variants.
 * Requires `sharp` to be installed.
 *
 * Every pipeline starts with `.rotate()`: with no argument it auto-orients
 * from the EXIF orientation tag (phone photos are stored sideways with a tag
 * telling viewers to rotate) and strips the tag, so resized output is upright.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  // Dynamic import to keep sharp optional
  const sharp = (await import('sharp')).default;
  configureSharp(sharp);

  const [thumbnail, medium, blur] = await Promise.all([
    // Thumbnail: 150x150 cropped center
    sharp(buffer)
      .rotate()
      .resize(150, 150, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer(),

    // Medium: 800px wide, preserve aspect ratio
    sharp(buffer)
      .rotate()
      .resize(800, undefined, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),

    // Blur placeholder: 10px wide
    sharp(buffer)
      .rotate()
      .resize(10, undefined, { fit: 'inside' })
      .webp({ quality: 20 })
      .toBuffer(),
  ]);

  const blurDataUrl = `data:image/webp;base64,${blur.toString('base64')}`;

  return { thumbnail, medium, blurDataUrl };
}
