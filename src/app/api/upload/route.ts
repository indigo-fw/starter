import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { auth } from '@/lib/auth';
import { Policy } from '@/core/policy';
import { getStorage } from '@/core/storage';
import { slugifyFilename } from '@/core/lib/slug';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'application/pdf',
  'video/mp4', 'video/webm',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]);

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

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFilename = slugifyFilename(file.name);
    const datePath = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
    const timestamp = Date.now();
    const filepath = `${datePath}/${timestamp}-${safeFilename}`;

    const storage = getStorage();
    const storedPath = await storage.upload(filepath, buffer);
    const url = storage.url(storedPath);

    let width: number | undefined;
    let height: number | undefined;
    let thumbnailPath: string | undefined;
    let mediumPath: string | undefined;
    let blurDataUrl: string | undefined;

    // Generate image variants for supported types
    if (IMAGE_TYPES.has(file.type)) {
      try {
        const image = sharp(buffer);
        const meta = await image.metadata();
        width = meta.width;
        height = meta.height;

        const nameBase = safeFilename.replace(/\.[^.]+$/, '');

        // Thumbnail: 400px wide
        if (meta.width && meta.width > 400) {
          const thumbBuffer = await sharp(buffer)
            .resize(400, undefined, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          const thumbFilepath = `${datePath}/${timestamp}-${nameBase}-thumb.webp`;
          thumbnailPath = await storage.upload(thumbFilepath, thumbBuffer);
        }

        // Medium: 800px wide
        if (meta.width && meta.width > 800) {
          const medBuffer = await sharp(buffer)
            .resize(800, undefined, { withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          const medFilepath = `${datePath}/${timestamp}-${nameBase}-medium.webp`;
          mediumPath = await storage.upload(medFilepath, medBuffer);
        }

        // Generate blur placeholder
        try {
          const blurBuffer = await sharp(buffer)
            .resize(10, 10, { fit: 'inside' })
            .blur()
            .webp({ quality: 20 })
            .toBuffer();
          blurDataUrl = `data:image/webp;base64,${blurBuffer.toString('base64')}`;
        } catch {
          // Blur generation is non-critical
        }
      } catch {
        // Image processing is non-critical — continue with original
      }
    }

    return NextResponse.json({
      filepath: storedPath,
      filename: safeFilename,
      mimeType: file.type,
      fileSize: file.size,
      url,
      width,
      height,
      thumbnailPath,
      mediumPath,
      blurDataUrl,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
