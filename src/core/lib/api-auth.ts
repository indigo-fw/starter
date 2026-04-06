import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsOptions } from '@/server/db/schema';
import { getRedis } from '@/core/lib/redis';
import { checkRateLimit as redisRateLimit } from '@/core/lib/rate-limit';

/** Validate API key from x-api-key header. Returns true if valid or if no key is configured. */
export async function validateApiKey(request: Request): Promise<boolean> {
  const [option] = await db
    .select({ value: cmsOptions.value })
    .from(cmsOptions)
    .where(eq(cmsOptions.key, 'api.key'))
    .limit(1);

  if (!option?.value) return true; // No key configured = public access

  const providedKey = request.headers.get('x-api-key');
  if (!providedKey) return false;

  const hash = crypto.createHash('sha256').update(providedKey).digest('hex');
  const a = Buffer.from(hash);
  const b = Buffer.from(option.value as string);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Redis-backed rate limiter: 100 req/min per IP. Falls back to allowing if Redis unavailable. */
export async function checkRateLimit(request: Request): Promise<boolean> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const redis = getRedis();
  const result = await redisRateLimit(redis, `api:ip:${ip}`, {
    windowMs: 60_000,
    maxRequests: 100,
  });
  return result.allowed;
}

/** Standard CORS and cache headers */
export function apiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-api-key, content-type',
  };
}
