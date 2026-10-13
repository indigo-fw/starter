import { describe, expect, it } from 'vitest';

import { envSchema } from '@/lib/env';

// Minimal valid environment — the flat schema's required keys only.
const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

function failingPaths(input: Record<string, string>): string[] {
  const result = envSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join('.'));
}

describe('env cross-field validation', () => {
  it('accepts the minimal environment', () => {
    expect(failingPaths(BASE)).toEqual([]);
  });

  it('AUTH_BLOCK_DISPOSABLE_EMAILS defaults on and only takes booleans', () => {
    const parsed = envSchema.safeParse(BASE);
    expect(parsed.success && parsed.data.AUTH_BLOCK_DISPOSABLE_EMAILS).toBe(
      true
    );
    const off = envSchema.safeParse({
      ...BASE,
      AUTH_BLOCK_DISPOSABLE_EMAILS: 'false',
    });
    expect(off.success && off.data.AUTH_BLOCK_DISPOSABLE_EMAILS).toBe(false);
    expect(
      failingPaths({ ...BASE, AUTH_BLOCK_DISPOSABLE_EMAILS: 'nope' })
    ).toEqual(['AUTH_BLOCK_DISPOSABLE_EMAILS']);
  });

  it('UPLOAD_MAX_IMAGE_PX defaults to 2560, allows 0, rejects negatives/floats', () => {
    const parsed = envSchema.safeParse(BASE);
    expect(parsed.success && parsed.data.UPLOAD_MAX_IMAGE_PX).toBe(2560);
    const zero = envSchema.safeParse({ ...BASE, UPLOAD_MAX_IMAGE_PX: '0' });
    expect(zero.success && zero.data.UPLOAD_MAX_IMAGE_PX).toBe(0);
    expect(failingPaths({ ...BASE, UPLOAD_MAX_IMAGE_PX: '-1' })).toEqual([
      'UPLOAD_MAX_IMAGE_PX',
    ]);
    expect(failingPaths({ ...BASE, UPLOAD_MAX_IMAGE_PX: '12.5' })).toEqual([
      'UPLOAD_MAX_IMAGE_PX',
    ]);
  });

  it('STORAGE_BACKEND=s3 requires every S3_* key', () => {
    expect(failingPaths({ ...BASE, STORAGE_BACKEND: 's3' })).toEqual([
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]);
    expect(
      failingPaths({
        ...BASE,
        STORAGE_BACKEND: 's3',
        S3_ENDPOINT: 'https://s3.example.com',
        S3_REGION: 'auto',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
      })
    ).toEqual([]);
  });

  it('filesystem storage does not need S3 keys', () => {
    expect(failingPaths({ ...BASE, STORAGE_BACKEND: 'filesystem' })).toEqual(
      []
    );
  });

  it('MEDIA_FALLBACK_STORE=true requires MEDIA_FALLBACK_URL', () => {
    expect(failingPaths({ ...BASE, MEDIA_FALLBACK_STORE: 'true' })).toEqual([
      'MEDIA_FALLBACK_URL',
    ]);
    expect(
      failingPaths({
        ...BASE,
        MEDIA_FALLBACK_STORE: 'true',
        MEDIA_FALLBACK_URL: 'https://cdn.example.com',
      })
    ).toEqual([]);
  });

  it('EMAIL_LIST_PROVIDER requires that provider’s keys', () => {
    expect(failingPaths({ ...BASE, EMAIL_LIST_PROVIDER: 'mailchimp' })).toEqual(
      ['MAILCHIMP_API_KEY', 'MAILCHIMP_LIST_ID']
    );
    expect(
      failingPaths({
        ...BASE,
        EMAIL_LIST_PROVIDER: 'brevo',
        BREVO_API_KEY: 'k',
      })
    ).toEqual(['BREVO_LIST_ID']);
  });

  it('SERVER_ROLE=worker requires REDIS_URL', () => {
    expect(failingPaths({ ...BASE, SERVER_ROLE: 'worker' })).toEqual([
      'REDIS_URL',
    ]);
    expect(
      failingPaths({
        ...BASE,
        SERVER_ROLE: 'worker',
        REDIS_URL: 'redis://localhost:6379',
      })
    ).toEqual([]);
  });

  it('SUPPORT_EMAIL is optional but must be an email when set', () => {
    expect(failingPaths(BASE)).toEqual([]);
    expect(
      failingPaths({ ...BASE, SUPPORT_EMAIL: 'support@example.com' })
    ).toEqual([]);
    expect(failingPaths({ ...BASE, SUPPORT_EMAIL: 'not-an-email' })).toEqual([
      'SUPPORT_EMAIL',
    ]);
  });

  it('rejects malformed ops knobs instead of silently defaulting', () => {
    expect(failingPaths({ ...BASE, LOG_LEVEL: 'verbose' })).toEqual([
      'LOG_LEVEL',
    ]);
    expect(failingPaths({ ...BASE, WS_MAX_PAYLOAD_BYTES: 'big' })).toEqual([
      'WS_MAX_PAYLOAD_BYTES',
    ]);
    expect(failingPaths({ ...BASE, TRUSTED_PROXY_HOPS: '0' })).toEqual([
      'TRUSTED_PROXY_HOPS',
    ]);
  });

  it('applies the documented defaults for ops knobs', () => {
    const parsed = envSchema.parse(BASE);
    expect(parsed.WS_MAX_PAYLOAD_BYTES).toBe(1_048_576);
    expect(parsed.WS_PERMESSAGE_DEFLATE).toBe(false);
    expect(parsed.BULLMQ_PREFIX).toBe('bull');
    expect(parsed.TRUSTED_PROXY_HOPS).toBe(1);
    expect(parsed.MEDIA_FALLBACK_STORE).toBe(false);
  });
});
