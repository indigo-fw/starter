/**
 * Image processing — generates thumbnails, medium-size variants, and blur placeholders.
 *
 * Uses sharp for image manipulation. If sharp is not installed, throws at runtime.
 */

export interface ProcessedImage {
  /** WebP thumbnail (150x150, cropped) */
  thumbnail: Buffer;
  /** WebP medium variant (800px wide, preserved aspect ratio) */
  medium: Buffer;
  /** Base64-encoded tiny blur placeholder (10px wide) */
  blurDataUrl: string;
}

/**
 * Process a raw image buffer into optimized variants.
 * Requires `sharp` to be installed.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  // Dynamic import to keep sharp optional
  const sharp = (await import('sharp')).default;

  const [thumbnail, medium, blur] = await Promise.all([
    // Thumbnail: 150x150 cropped center
    sharp(buffer)
      .resize(150, 150, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer(),

    // Medium: 800px wide, preserve aspect ratio
    sharp(buffer)
      .resize(800, undefined, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),

    // Blur placeholder: 10px wide
    sharp(buffer)
      .resize(10, undefined, { fit: 'inside' })
      .webp({ quality: 20 })
      .toBuffer(),
  ]);

  const blurDataUrl = `data:image/webp;base64,${blur.toString('base64')}`;

  return { thumbnail, medium, blurDataUrl };
}
