/**
 * Normalise an uploaded original before it is stored.
 *
 * Why: phone photos arrive sideways with an EXIF orientation tag and carry
 * GPS coordinates, device serials and XMP edit history. Storing the raw
 * bytes leaks all of that to anyone with the public URL. This pass
 * auto-orients (`.rotate()` bakes the orientation in and drops the tag),
 * strips every metadata block (sharp omits them unless `.withMetadata()` is
 * called — never add it here), and caps the longest side so a 48 MP original
 * does not sit behind a 400 px thumbnail forever.
 *
 * Format is preserved (JPEG→JPEG, PNG→PNG, WebP→WebP, AVIF→AVIF). GIF, SVG
 * and any multi-page image (animated WebP/AVIF) pass through untouched: a
 * re-encode would flatten the animation, and those formats carry no EXIF.
 *
 * Callers MUST treat a throw as a rejected upload — storing the unprocessed
 * original defeats the privacy point of the pass.
 */
import sharp from 'sharp';

import { configureSharp } from '@/core/lib/media-processing';

/** Default longest-side cap when UPLOAD_MAX_IMAGE_PX is unset. */
export const DEFAULT_UPLOAD_MAX_IMAGE_PX = 2560;
/** JPEG quality for re-encoded originals. */
export const NORMALIZED_JPEG_QUALITY = 85;

/** MIME types that are stored as-is (animation / vector / no EXIF). */
const PASSTHROUGH_TYPES = new Set(['image/gif', 'image/svg+xml']);

/** Declared MIME → sharp format(s) its bytes must decode to. sharp reports AVIF as 'heif'. */
const FORMAT_FOR_MIME: Record<string, readonly string[]> = {
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/avif': ['heif', 'avif'],
  'image/gif': ['gif'],
  'image/svg+xml': ['svg'],
};

export interface NormalizeImageOptions {
  /** Longest-side cap in px; `0` disables resizing. Never enlarges. */
  maxPx: number;
}

export interface NormalizedImage {
  /** Bytes to store — the re-encoded image, or the input when passed through. */
  buffer: Buffer;
  /** Upright output dimensions (orientation already applied). */
  width: number;
  height: number;
  /** Unchanged from the input: format is preserved by design. */
  mimeType: string;
  /** False when the image was passed through untouched (GIF, SVG, animated). */
  normalized: boolean;
}

/** Thrown when the bytes are not a decodable image of the declared type. */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedImageError';
  }
}

/**
 * Read the ops knob at the call site (declared + validated in src/lib/env.ts,
 * read raw here because route handlers run where the server-only env module
 * can't load). Unset or unparsable → default cap.
 */
export function getUploadMaxImagePx(): number {
  const raw = process.env.UPLOAD_MAX_IMAGE_PX;
  if (raw === undefined || raw === '') return DEFAULT_UPLOAD_MAX_IMAGE_PX;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_UPLOAD_MAX_IMAGE_PX;
}

export async function normalizeImage(
  buffer: Buffer,
  mimeType: string,
  { maxPx }: NormalizeImageOptions
): Promise<NormalizedImage> {
  configureSharp(sharp);

  const expected = FORMAT_FOR_MIME[mimeType];
  if (!expected) {
    throw new UnsupportedImageError(`Not an image type: ${mimeType}`);
  }

  const meta = await sharp(buffer).metadata();
  if (!meta.format || !expected.includes(meta.format)) {
    throw new UnsupportedImageError(
      `Image bytes (${meta.format ?? 'unknown'}) do not match ${mimeType}`
    );
  }

  const animated = (meta.pages ?? 1) > 1;
  if (PASSTHROUGH_TYPES.has(mimeType) || animated) {
    // EXIF orientation can still swap axes on a passthrough; report upright.
    const swap = (meta.orientation ?? 1) >= 5;
    return {
      buffer,
      width: (swap ? meta.height : meta.width) ?? 0,
      height: (swap ? meta.width : meta.height) ?? 0,
      mimeType,
      normalized: false,
    };
  }

  let pipeline = sharp(buffer).rotate();
  if (maxPx > 0) {
    pipeline = pipeline.resize(maxPx, maxPx, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  switch (mimeType) {
    case 'image/jpeg':
      pipeline = pipeline.jpeg({ quality: NORMALIZED_JPEG_QUALITY });
      break;
    case 'image/png':
      pipeline = pipeline.png();
      break;
    case 'image/webp':
      pipeline = pipeline.webp();
      break;
    case 'image/avif':
      pipeline = pipeline.avif();
      break;
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    mimeType,
    normalized: true,
  };
}
