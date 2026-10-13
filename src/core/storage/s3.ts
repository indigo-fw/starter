import { type StorageProvider, type UploadOptions } from './index';
import { createHash, createHmac } from 'node:crypto';

/**
 * S3-compatible storage provider
 *
 * Uses the standard S3 REST API via fetch with AWS Signature Version 4 —
 * no AWS SDK dependency. Compatible with AWS S3 (all regions), MinIO,
 * Cloudflare R2, DigitalOcean Spaces, Backblaze B2, etc.
 *
 * Path-style addressing (`{endpoint}/{bucket}/{key}`) is used because it
 * works with every S3-compatible service; virtual-hosted style is only
 * needed for AWS buckets with dots in their names over HTTPS.
 */
export class S3Storage implements StorageProvider {
  private endpoint: string;
  private region: string;
  private bucket: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private cdnUrl: string | null;

  constructor() {
    this.endpoint = requireEnv('S3_ENDPOINT').replace(/\/+$/, '');
    this.region = requireEnv('S3_REGION');
    this.bucket = requireEnv('S3_BUCKET');
    this.accessKeyId = requireEnv('S3_ACCESS_KEY_ID');
    this.secretAccessKey = requireEnv('S3_SECRET_ACCESS_KEY');
    this.cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || null;
  }

  async upload(
    filepath: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<string> {
    // An explicit content type wins over the extension guess — callers that
    // already know the real type (an upload's reported MIME, a re-encoded
    // variant) shouldn't be second-guessed by the filename.
    const contentType = options?.contentType ?? guessMimeType(filepath);
    const headers: Record<string, string> = { 'content-type': contentType };
    for (const [k, v] of Object.entries(options?.metadata ?? {})) {
      // S3 user metadata travels as x-amz-meta-* and must be signed with the
      // request, so it goes through the same header path as content-type.
      headers[`x-amz-meta-${k.toLowerCase()}`] = v;
    }

    const response = await this.request('PUT', filepath, {
      body: buffer,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 upload failed (${response.status}): ${text}`);
    }

    return filepath;
  }

  async download(filepath: string): Promise<Buffer> {
    const response = await this.request('GET', filepath);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 download failed (${response.status}): ${text}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async delete(filepath: string): Promise<void> {
    const response = await this.request('DELETE', filepath);

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

  /** Already absolute — the bucket/CDN origin is part of every S3 URL. */
  absoluteUrl(filepath: string): string {
    return this.url(filepath);
  }

  async exists(filepath: string): Promise<boolean> {
    // HEAD, so a large object costs one round trip and no body transfer.
    const response = await this.request('HEAD', filepath);
    if (response.status === 404 || response.status === 403) return false;
    if (!response.ok) {
      throw new Error(
        `S3 exists check failed (${response.status}) for "${filepath}"`
      );
    }
    return true;
  }

  async copy(sourcePath: string, destPath: string): Promise<string> {
    // Server-side copy: the bytes never travel through this process.
    // x-amz-copy-source must be the URL-encoded /bucket/key of the source.
    const response = await this.request('PUT', destPath, {
      headers: {
        'x-amz-copy-source': `/${this.bucket}/${sourcePath}`
          .split('/')
          .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
          .join('/'),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`S3 copy failed (${response.status}): ${text}`);
    }

    return destPath;
  }

  private async request(
    method: string,
    filepath: string,
    opts: { body?: Buffer; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const path = `/${this.bucket}/${filepath}`;
    const url = `${this.endpoint}${path}`;
    const host = new URL(this.endpoint).host;
    const body = opts.body;

    const headers = signV4({
      method,
      host,
      path,
      headers: {
        ...(opts.headers ?? {}),
        ...(body ? { 'content-length': String(body.length) } : {}),
      },
      payloadHash: sha256Hex(body ?? Buffer.alloc(0)),
      region: this.region,
      service: 's3',
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });

    return fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
  }
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4
// https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
// ---------------------------------------------------------------------------

export interface SignV4Input {
  method: string;
  host: string;
  /** Absolute path as it will be sent, raw or percent-encoded (e.g. `/bucket/a b.png`). */
  path: string;
  /** Extra headers to sign (any case — normalized). `host` and `x-amz-*` are added. */
  headers?: Record<string, string>;
  /** Hex SHA-256 of the request body (`sha256Hex(Buffer.alloc(0))` for none). */
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Override the signing time (tests). Defaults to now. */
  date?: Date;
}

/**
 * Sign a request and return the full header set to send, including
 * `authorization`, `x-amz-date`, `x-amz-content-sha256` and `host`.
 * Pure function — no I/O — so the canonicalization can be unit-tested
 * against AWS's published example vectors.
 */
export function signV4(input: SignV4Input): Record<string, string> {
  const date = input.date ?? new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    headers[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  }
  headers['host'] = input.host;
  headers['x-amz-date'] = amzDate;
  headers['x-amz-content-sha256'] = input.payloadHash;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((k) => `${k}:${headers[k]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(input.path),
    '', // canonical query string (none — objects are addressed by path only)
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  headers['authorization'] =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return headers;
}

/**
 * S3 canonical URI: each path segment percent-encoded once (RFC 3986 — the
 * `!'()*` set included), `/` preserved. Already-encoded segments are decoded
 * first so callers can pass raw or encoded keys without double-encoding.
 */
function canonicalUri(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      let raw = seg;
      try {
        raw = decodeURIComponent(seg);
      } catch {
        // Not valid percent-encoding — treat as raw
      }
      return encodeURIComponent(raw).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      );
    })
    .join('/');
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
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
