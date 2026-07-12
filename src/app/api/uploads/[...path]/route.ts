import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// MIME type lookup for common file types
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

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
  if (resolved !== uploadsRoot && !resolved.startsWith(uploadsRoot + path.sep)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const buffer = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
}
