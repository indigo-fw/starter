import { type StorageProvider } from './index';

/**
 * S3-compatible storage provider
 *
 * Uses the standard S3 API via fetch — no AWS SDK dependency.
 * Compatible with AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, etc.
 */
export class S3Storage implements StorageProvider {
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private cdnUrl: string | null;

  constructor() {
    this.endpoint = requireEnv('S3_ENDPOINT');
    this.region = requireEnv('S3_REGION');
    this.bucket = requireEnv('S3_BUCKET');
    this.accessKeyId = requireEnv('S3_ACCESS_KEY_ID');
    this.secretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY');
    this.cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || null;
  }

  async upload(filepath: string, buffer: Buffer): Promise<string> {
    const url = `${this.endpoint}/${this.bucket}/${filepath}`;
    const date = new Date().toUTCString();
    const contentType = guessMimeType(filepath);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      Date: date,
      Host: new URL(this.endpoint).host,
    };

    const signature = await this.sign('PUT', filepath, headers);
    headers['Authorization'] = signature;

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 upload failed (${response.status}): ${text}`);
    }

    return filepath;
  }

  async download(filepath: string): Promise<Buffer> {
    const url = `${this.endpoint}/${this.bucket}/${filepath}`;
    const date = new Date().toUTCString();

    const headers: Record<string, string> = {
      Date: date,
      Host: new URL(this.endpoint).host,
    };

    const signature = await this.sign('GET', filepath, headers);
    headers['Authorization'] = signature;

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 download failed (${response.status}): ${text}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async delete(filepath: string): Promise<void> {
    const url = `${this.endpoint}/${this.bucket}/${filepath}`;
    const date = new Date().toUTCString();

    const headers: Record<string, string> = {
      Date: date,
      Host: new URL(this.endpoint).host,
    };

    const signature = await this.sign('DELETE', filepath, headers);
    headers['Authorization'] = signature;

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    // 204 or 404 are both acceptable
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`S3 delete failed (${response.status}): ${text}`);
    }
  }

  url(filepath: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${filepath}`;
    }
    return `${this.endpoint}/${this.bucket}/${filepath}`;
  }

  /**
   * AWS Signature V2 — simple HMAC-SHA1 auth.
   * For production with modern S3 endpoints, consider upgrading to SigV4.
   */
  private async sign(
    method: string,
    filepath: string,
    headers: Record<string, string>
  ): Promise<string> {
    const contentType = headers['Content-Type'] ?? '';
    const date = headers['Date'] ?? '';
    const resource = `/${this.bucket}/${filepath}`;

    const stringToSign = `${method}\n\n${contentType}\n${date}\n${resource}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secretAccessKey),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(stringToSign)
    );

    const signatureBase64 = btoa(
      String.fromCharCode(...new Uint8Array(signatureBuffer))
    );

    return `AWS ${this.accessKeyId}:${signatureBase64}`;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name} (required when STORAGE_BACKEND=s3)`
    );
  }
  return value;
}

function guessMimeType(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    pdf: 'application/pdf',
    json: 'application/json',
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
  };
  return mimeTypes[ext ?? ''] ?? 'application/octet-stream';
}
