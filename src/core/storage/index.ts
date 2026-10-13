import fs from 'fs/promises';
import path from 'path';

import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('storage');

export interface UploadOptions {
  /**
   * MIME content type (e.g. 'image/jpeg'). Object stores persist this and
   * serve it back as the response `Content-Type`; without it a browser hitting
   * the CDN URL directly downloads the file instead of rendering it.
   * Filesystem storage ignores it — the serving route infers from extension.
   */
  contentType?: string;
  /** Provider-specific user metadata. Ignored by providers that lack it. */
  metadata?: Record<string, string>;
}

export interface StorageProvider {
  upload(
    filepath: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<string>;
  download(filepath: string): Promise<Buffer>;
  delete(filepath: string): Promise<void>;
  /** Public URL — CDN/bucket URL for object stores, an app route for filesystem. */
  url(filepath: string): string;
  /**
   * Absolute URL for SERVER-side fetch. `url()` may be app-relative depending
   * on configuration; this always includes a host, so background jobs and
   * server components can fetch the bytes.
   */
  absoluteUrl(filepath: string): string;
  /** Whether the object exists. Used by `resolveUniqueKey` before overwriting. */
  exists(filepath: string): Promise<boolean>;
  /** Server-side copy. Returns the destination path. */
  copy(sourcePath: string, destPath: string): Promise<string>;
}

/** Filesystem storage — stores files in ./uploads/ */
class FilesystemStorage implements StorageProvider {
  private basePath: string;
  private baseUrl: string;

  constructor() {
    this.basePath = path.join(process.cwd(), 'uploads');
    this.baseUrl =
      process.env.NEXT_PUBLIC_CDN_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000';
  }

  /**
   * Resolve `filepath` under `basePath` and enforce containment. Rejects
   * traversal (`..`), leading separators, and anything that resolves outside
   * the uploads root — an editor can otherwise target `../.env` via
   * media.register's arbitrary `filepath`. The trailing `path.sep` on the
   * prefix check prevents sibling-dir escape (`uploads-private/`).
   */
  private resolveWithin(filepath: string): string {
    if (
      filepath.includes('..') ||
      filepath.startsWith('/') ||
      filepath.startsWith('\\') ||
      path.isAbsolute(filepath)
    ) {
      throw new Error(`Invalid storage path: "${filepath}"`);
    }
    const root = path.resolve(this.basePath);
    const resolved = path.resolve(root, filepath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Storage path escapes uploads root: "${filepath}"`);
    }
    return resolved;
  }

  async upload(filepath: string, buffer: Buffer): Promise<string> {
    const fullPath = this.resolveWithin(filepath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return filepath;
  }

  async download(filepath: string): Promise<Buffer> {
    const fullPath = this.resolveWithin(filepath);
    return fs.readFile(fullPath);
  }

  async delete(filepath: string): Promise<void> {
    let fullPath: string;
    try {
      fullPath = this.resolveWithin(filepath);
    } catch (err: unknown) {
      log.warn('Refusing to delete file outside uploads root', {
        path: filepath,
        error: String(err),
      });
      return;
    }
    await fs.unlink(fullPath).catch((err: unknown) => {
      log.warn('Failed to delete file', { path: filepath, error: String(err) });
    });
  }

  url(filepath: string): string {
    return `${this.baseUrl}/api/uploads/${filepath}`;
  }

  absoluteUrl(filepath: string): string {
    return this.url(filepath);
  }

  async exists(filepath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.resolveWithin(filepath));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async copy(sourcePath: string, destPath: string): Promise<string> {
    const from = this.resolveWithin(sourcePath);
    const to = this.resolveWithin(destPath);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    return destPath;
  }
}

// ─── Storage provider registry ──────────────────────────────────────────────

type StorageFactory = () => StorageProvider;
const storageFactories = new Map<string, StorageFactory>();

/**
 * Register a storage provider factory.
 * Call this before the first `getStorage()` invocation (e.g., in a deps file).
 * Built-in providers ('filesystem', 's3') are pre-registered.
 */
export function registerStorageProvider(
  name: string,
  factory: StorageFactory
): void {
  storageFactories.set(name, factory);
}

// Built-in providers
registerStorageProvider('filesystem', () => new FilesystemStorage());
registerStorageProvider('s3', () => {
  // Dynamic import to avoid loading S3 deps when using filesystem
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { S3Storage } = require('./s3') as typeof import('./s3');
  return new S3Storage();
});

let storage: StorageProvider | null = null;

/** Get the configured storage provider */
export function getStorage(): StorageProvider {
  if (!storage) {
    const backend = process.env.STORAGE_BACKEND ?? 'filesystem';
    const factory = storageFactories.get(backend);
    if (!factory) {
      throw new Error(
        `Unknown storage backend: "${backend}". Registered: ${[...storageFactories.keys()].join(', ')}`
      );
    }
    storage = factory();
  }
  return storage;
}

/**
 * Turn a desired key into one that doesn't overwrite an existing object:
 * `2026/09/cover.webp` → `2026/09/cover-1.webp` → `-2` … WordPress-style.
 *
 * Preferred over prefixing every upload with a timestamp: the key stays
 * human-readable and stable, and re-uploading the same name is only penalized
 * when it would actually clobber something. Falls back to a timestamp suffix
 * after 100 collisions so this can never loop unbounded.
 */
export async function resolveUniqueKey(key: string): Promise<string> {
  const store = getStorage();
  if (!(await store.exists(key))) return key;

  const lastSlash = key.lastIndexOf('/');
  const dir = lastSlash >= 0 ? key.slice(0, lastSlash) : '';
  const file = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
  const dotIdx = file.lastIndexOf('.');
  const name = dotIdx > 0 ? file.slice(0, dotIdx) : file;
  const ext = dotIdx > 0 ? file.slice(dotIdx) : '';
  const join = (base: string) =>
    dir ? `${dir}/${base}${ext}` : `${base}${ext}`;

  for (let i = 1; i <= 100; i++) {
    const candidate = join(`${name}-${i}`);
    if (!(await store.exists(candidate))) return candidate;
  }

  return join(`${name}-${Date.now()}`);
}
