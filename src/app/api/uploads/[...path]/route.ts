import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';

import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('uploads');

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * Where to fetch media that is missing locally, as a full URL prefix the
 * request path is appended to — e.g. `https://cdn.example.com` (object store)
 * or `https://app.example.com/api/uploads` (filesystem backend).
 *
 * Why: importing a production database into a dev environment brings rows
 * pointing at files that only exist on the production storage, so every image
 * 404s. With this set, they resolve. Unset (the default) = plain 404, so
 * production never silently proxies another origin.
 */
const FALLBACK_URL = process.env.MEDIA_FALLBACK_URL?.replace(/\/+$/, '');
/** Mirror fetched bytes into ./uploads so the next request is served locally. */
const FALLBACK_STORE = process.env.MEDIA_FALLBACK_STORE === 'true';
/** Never buffer a file bigger than this — redirect instead. */
const MAX_MIRROR_BYTES = 100 * 1024 * 1024;

// MIME type lookup for common file types
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function mimeFor(filepath: string): string {
  return (
    MIME_TYPES[path.extname(filepath).toLowerCase()] ??
    'application/octet-stream'
  );
}

/**
 * Error responses carry an explicit no-store. A response with NO cache header
 * is where a CDN inserts its own default TTL, and a 404 minted moments before
 * an upload lands would then be pinned at the edge for days — re-uploading or
 * redeploying changes nothing, because the stale copy lives in the CDN, not
 * here. Success responses keep their long immutable TTL.
 */
function errorResponse(body: string, status: 403 | 404): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
      'CDN-Cache-Control': 'no-store',
    },
  });
}

/**
 * Serve a missing file from the configured fallback origin. Redirects by
 * default (307, not 308: a permanent redirect would be cached by the browser
 * and keep winning even after the file exists locally).
 */
async function serveFallback(segments: string[]): Promise<NextResponse> {
  if (!FALLBACK_URL) return errorResponse('Not Found', 404);

  const relPath = segments.map(encodeURIComponent).join('/');
  const target = `${FALLBACK_URL}/${relPath}`;

  if (!FALLBACK_STORE) {
    return NextResponse.redirect(target, 307);
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(30_000),
    });
    if (upstream.status === 404) return errorResponse('Not Found', 404);
    if (!upstream.ok) return NextResponse.redirect(target, 307);

    const declaredLength = Number(upstream.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MIRROR_BYTES)
      return NextResponse.redirect(target, 307);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_MIRROR_BYTES)
      return NextResponse.redirect(target, 307);

    // A CDN that reports application/octet-stream would make the browser
    // download rather than render, so prefer our extension mapping then.
    const upstreamType = upstream.headers.get('content-type');
    const contentType =
      upstreamType && upstreamType !== 'application/octet-stream'
        ? upstreamType
        : mimeFor(segments.join('/'));

    // Mirror through the storage provider, which re-guards the path. Failure
    // is non-fatal: we already hold the bytes and can serve this request.
    const { getStorage } = await import('@/core/storage');
    await getStorage()
      .upload(segments.join('/'), buffer, { contentType })
      .catch((err: unknown) => {
        log.warn('Failed to mirror media locally', {
          path: segments.join('/'),
          error: String(err),
        });
      });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
  } catch (err: unknown) {
    log.warn('Media fallback fetch failed, redirecting', {
      path: segments.join('/'),
      error: String(err),
    });
    return NextResponse.redirect(target, 307);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(UPLOADS_DIR, ...segments);

  // Security: prevent directory traversal. The trailing `path.sep` on the
  // prefix stops sibling-dir escape (e.g. a resolved `uploads-private/...`
  // would otherwise pass a bare `startsWith(<uploads>)` check).
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const resolved = path.resolve(filePath);
  if (
    resolved !== uploadsRoot &&
    !resolved.startsWith(uploadsRoot + path.sep)
  ) {
    return errorResponse('Forbidden', 403);
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return errorResponse('Not Found', 404);
    }

    const buffer = await fs.readFile(resolved);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeFor(resolved),
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return serveFallback(segments);
  }
}
