import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('storage');

export interface StorageProvider {
  upload(filepath: string, buffer: Buffer): Promise<string>;
  download(filepath: string): Promise<Buffer>;
  delete(filepath: string): Promise<void>;
  url(filepath: string): string;
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

  async upload(filepath: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(this.basePath, filepath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return filepath;
  }

  async download(filepath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, filepath);
    return fs.readFile(fullPath);
  }

  async delete(filepath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filepath);
    await fs.unlink(fullPath).catch((err: unknown) => {
      log.warn('Failed to delete file', { path: filepath, error: String(err) });
    });
  }

  url(filepath: string): string {
    return `${this.baseUrl}/api/uploads/${filepath}`;
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
export function registerStorageProvider(name: string, factory: StorageFactory): void {
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
        `Unknown storage backend: "${backend}". Registered: ${[...storageFactories.keys()].join(', ')}`,
      );
    }
    storage = factory();
  }
  return storage;
}
