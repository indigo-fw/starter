import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { getRedis } from '@/core/lib/infra/redis';
import { checkRateLimit } from '@/core/lib/infra/rate-limit';
import { createLogger } from '@/core/lib/infra/logger';
import { verifyApiKey, touchKeyLastUsed, type VerifiedKey } from './api-key-service';
import { hasScope } from './api-scopes';
import { saasApiRequestLogs } from '@/core-api/schema/api-keys';
import { getApiDeps } from '@/core-api/deps';

const logger = createLogger('api-v2');

/** Context passed to v2 route handlers after auth. */
export interface ApiV2Context {
  /** Resolved organization ID from the API key. */
  organizationId: string;
  /** The verified API key record. */
  key: VerifiedKey;
  /** Parsed URL. */
  url: URL;
}

interface ApiV2Options {
  /** Required scope for this endpoint (e.g. 'read:posts'). */
  scope: string;
  /** Rate limit: max requests per minute per key. Default: 60. */
  rateLimit?: number;
  /** Whether to deduct tokens for this call. Default: false. */
  metered?: boolean;
}

/** Standard CORS headers for v2 API. */
function v2Headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ error }, { status, headers: v2Headers() });
}

/**
 * Wraps a v2 API route handler with:
 * 1. Bearer token authentication (org-scoped API key)
 * 2. Scope validation
 * 3. Per-key rate limiting
 * 4. Optional token metering
 * 5. Request logging
 *
 * Usage:
 * ```ts
 * export async function GET(request: Request) {
 *   return withApiV2Route(request, { scope: 'read:projects' }, async (ctx) => {
 *     // ctx.organizationId, ctx.key, ctx.url available
 *     const projects = await db.select().from(saasProjects)
 *       .where(eq(saasProjects.organizationId, ctx.organizationId));
 *     return { data: projects };
 *   });
 * }
 * ```
 */
export async function withApiV2Route(
  request: Request,
  options: ApiV2Options,
  handler: (ctx: ApiV2Context) => Promise<unknown | Response>,
): Promise<Response> {
  const start = Date.now();

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: v2Headers() });
  }

  // ─── 1. Extract Bearer token ──────────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header. Use: Bearer <api_key>', 401);
  }
  const token = authHeader.slice(7);

  // ─── 2. Verify API key ────────────────────────────────────────────────────
  const key = await verifyApiKey(token);
  if (!key) {
    return errorResponse('Invalid or expired API key', 401);
  }

  // ─── 3. Check scope ──────────────────────────────────────────────────────
  if (!hasScope(key.scopes, options.scope)) {
    return errorResponse(`Insufficient scope. Required: ${options.scope}`, 403);
  }

  // ─── 4. Rate limit per key ────────────────────────────────────────────────
  const redis = getRedis();
  const maxRequests = options.rateLimit ?? 60;
  const rl = await checkRateLimit(redis, `api:v2:key:${key.id}`, {
    windowMs: 60_000,
    maxRequests,
  });
  if (!rl.allowed) {
    const resp = errorResponse('Rate limit exceeded', 429);
    resp.headers.set('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)));
    resp.headers.set('X-RateLimit-Limit', String(maxRequests));
    resp.headers.set('X-RateLimit-Remaining', '0');
    return resp;
  }

  // ─── 5. Optional metering ────────────────────────────────────────────────
  if (options.metered) {
    const deps = getApiDeps();
    if (deps.deductApiCallToken) {
      const url = new URL(request.url);
      const allowed = await deps.deductApiCallToken(key.organizationId, url.pathname);
      if (!allowed) {
        return errorResponse('Insufficient token balance', 402);
      }
    }
  }

  // ─── 6. Execute handler ───────────────────────────────────────────────────
  const url = new URL(request.url);
  const ip = extractIp(request);
  let statusCode = 200;
  try {
    const result = await handler({ organizationId: key.organizationId, key, url });

    touchKeyLastUsed(key.id);

    if (result instanceof Response) {
      statusCode = result.status;
      logRequest(key, request.method, url.pathname, statusCode, Date.now() - start, ip);
      return result;
    }

    const resp = NextResponse.json(result, { headers: v2Headers() });
    resp.headers.set('X-RateLimit-Limit', String(maxRequests));
    resp.headers.set('X-RateLimit-Remaining', String(rl.remaining));
    logRequest(key, request.method, url.pathname, 200, Date.now() - start, ip);
    return resp;
  } catch (err) {
    statusCode = 500;
    logger.error('v2 route error', { path: url.pathname, error: String(err) });
    logRequest(key, request.method, url.pathname, statusCode, Date.now() - start, ip);
    return errorResponse('Internal server error', 500);
  }
}

/** Extract client IP from request headers (Cloudflare / proxy aware). */
function extractIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Fire-and-forget request log insert. */
function logRequest(
  key: VerifiedKey,
  method: string,
  path: string,
  statusCode: number,
  responseTimeMs: number,
  ipAddress: string,
): void {
  db.insert(saasApiRequestLogs)
    .values({
      organizationId: key.organizationId,
      apiKeyId: key.id,
      method,
      path,
      statusCode,
      responseTimeMs,
      ipAddress,
    })
    .catch((err) => logger.error('Failed to log API request', { error: String(err) }));
}
