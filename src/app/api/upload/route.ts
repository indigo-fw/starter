import { NextResponse } from 'next/server';
import sharp from 'sharp';

import { slugifyFilename } from '@/core/lib/content/slug';
import { createLogger } from '@/core/lib/infra/logger';
import { checkRateLimit } from '@/core/lib/infra/rate-limit';
import { getRequestRedis } from '@/core/lib/infra/redis';
import { configureSharp } from '@/core/lib/media-processing';
import { Policy } from '@/core/policy';
import { getStorage } from '@/core/storage';
import { auth } from '@/lib/auth';

const logger = createLogger('upload');
// Bound libvips native memory before the first pipeline (idempotent).
configureSharp(sharp);

const MB = 1024 * 1024;

interface UploadSpec {
  /** Filename extensions that may carry this MIME type. */
  ext: readonly string[];
  kind: 'image' | 'video' | 'document';
  max: number;
}

/**
 * Declared MIME → allowed extensions + size cap. Both the MIME and the
 * extension are client-supplied, so a file is accepted only when they form
 * a whitelisted pair; images are additionally content-sniffed below.
 * Video gets a larger cap — no in-repo body limit applies to route handlers,
 * but a reverse proxy in front must allow at least this much.
 */
const ALLOWED: Record<string, UploadSpec> = {
  'image/jpeg': { ext: ['jpg', 'jpeg'], kind: 'image', max: 10 * MB },
  'image/png': { ext: ['png'], kind: 'image', max: 10 * MB },
  'image/gif': { ext: ['gif'], kind: 'image', max: 10 * MB },
  'image/webp': { ext: ['webp'], kind: 'image', max: 10 * MB },
  'image/avif': { ext: ['avif'], kind: 'image', max: 10 * MB },
  'video/mp4': { ext: ['mp4', 'm4v'], kind: 'video', max: 50 * MB },
  'video/webm': { ext: ['webm'], kind: 'video', max: 50 * MB },
  'application/pdf': { ext: ['pdf'], kind: 'document', max: 10 * MB },
  'application/msword': { ext: ['doc'], kind: 'document', max: 10 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['docx'],
    kind: 'document',
    max: 10 * MB,
  },
  // Windows browsers declare .csv as vnd.ms-excel when Excel owns the extension.
  'application/vnd.ms-excel': {
    ext: ['xls', 'csv'],
    kind: 'document',
    max: 10 * MB,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    ext: ['xlsx'],
    kind: 'document',
    max: 10 * MB,
  },
  'text/csv': { ext: ['csv'], kind: 'document', max: 10 * MB },
};

/** Declared image MIME → sharp format(s) its bytes must decode to. sharp reports AVIF as 'heif'. */
const IMAGE_MAGIC: Record<string, readonly string[]> = {
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/avif': ['heif', 'avif'],
};

/** Types that get thumbnail/medium/blur variants (AVIF decode is too slow for the request path). */
const VARIANT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Per-user cap. Fail-open without Redis, like every other limiter here. */
const UPLOAD_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 60 };

export async function POST(request: Request) {
  // Auth check
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (!Policy.for(userRole).can('section.media')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Before the body is read: a limited client should not cost us a 50 MB parse.
  const rate = await checkRateLimit(
    getRequestRedis(),
    `upload:user:${session.user.id}`,
    UPLOAD_RATE_LIMIT
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(
            Math.max(1, Math.ceil(rate.retryAfterMs / 1000))
          ),
        },
      }
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Malformed form data' },
        { status: 400 }
      );
    }
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const mimeType = file.type || 'application/octet-stream';
    const spec = ALLOWED[mimeType];
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!spec || !spec.ext.includes(ext)) {
      return NextResponse.json(
        { error: `File type not allowed: ${mimeType} (.${ext})` },
        { status: 415 }
      );
    }

    if (file.size > spec.max) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(spec.max / MB)}MB)` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Content sniff: the declared MIME + extension are trivially spoofed. Decode
    // the actual bytes and require the detected format to match — blocks a
    // renamed HTML/script/polyglot from being stored and served as a "png".
    let meta: sharp.Metadata | undefined;
    if (spec.kind === 'image') {
      try {
        meta = await sharp(buffer).metadata();
      } catch {
        meta = undefined;
      }
      if (!meta?.format || !IMAGE_MAGIC[mimeType]?.includes(meta.format)) {
        return NextResponse.json(
          { error: 'File content does not match its image type' },
          { status: 415 }
        );
      }
    }

    const safeFilename = slugifyFilename(file.name);
    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const timestamp = Date.now();
    const filepath = `${datePath}/${timestamp}-${safeFilename}`;

    const storage = getStorage();
    const storedPath = await storage.upload(filepath, buffer, {
      contentType: mimeType,
    });
    const url = storage.url(storedPath);

    let width: number | undefined;
    let height: number | undefined;
    let thumbnailPath: string | undefined;
    let mediumPath: string | undefined;
    let blurDataUrl: string | undefined;

    if (meta) {
      // Phone photos are stored sideways with an EXIF orientation tag; the
      // variants below auto-orient (.rotate()), so report the upright size.
      const exifSwapsAxes = (meta.orientation ?? 1) >= 5;
      width = exifSwapsAxes ? meta.height : meta.width;
      height = exifSwapsAxes ? meta.width : meta.height;
    }

    // Generate image variants for supported types
    if (meta && VARIANT_TYPES.has(mimeType)) {
      try {
        const nameBase = safeFilename.replace(/\.[^.]+$/, '');

        // Thumbnail: 400px wide
        if (meta.width && meta.width > 400) {
          const thumbBuffer = await sharp(buffer)
            .rotate()
            .resize(400, undefined, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          const thumbFilepath = `${datePath}/${timestamp}-${nameBase}-thumb.webp`;
          thumbnailPath = await storage.upload(thumbFilepath, thumbBuffer, {
            contentType: 'image/webp',
          });
        }

        // Medium: 800px wide
        if (meta.width && meta.width > 800) {
          const medBuffer = await sharp(buffer)
            .rotate()
            .resize(800, undefined, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          const medFilepath = `${datePath}/${timestamp}-${nameBase}-medium.webp`;
          mediumPath = await storage.upload(medFilepath, medBuffer, {
            contentType: 'image/webp',
          });
        }

        // Generate blur placeholder
        try {
          const blurBuffer = await sharp(buffer)
            .rotate()
            .resize(10, 10, { fit: 'inside' })
            .blur()
            .webp({ quality: 20 })
            .toBuffer();
          blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;
        } catch {
          // Blur generation is non-critical
        }
      } catch {
        // Variant generation is non-critical — continue with original
      }
    }

    return NextResponse.json({
      filepath: storedPath,
      filename: safeFilename,
      mimeType,
      fileSize: file.size,
      url,
      width,
      height,
      thumbnailPath,
      mediumPath,
      blurDataUrl,
    });
  } catch (err) {
    logger.error('Upload failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
