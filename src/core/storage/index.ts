import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '@/core/lib/logger';

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

let storage: StorageProvider | null = null;

/** Get the configured storage provider */
export function getStorage(): StorageProvider {
  if (!storage) {
    const backend = process.env.STORAGE_BACKEND ?? 'filesystem';
    if (backend === 's3') {
      // Dynamic import to avoid loading S3 deps when using filesystem
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Storage } = require('./s3') as typeof import('./s3');
      storage = new S3Storage();
    } else {
      storage = new FilesystemStorage();
    }
  }
  return storage;
}
