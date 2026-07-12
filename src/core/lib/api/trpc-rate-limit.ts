import { TRPCError } from '@trpc/server';
import { getRequestRedis } from '@/core/lib/infra/redis';
import { getClientIp } from '@/core/lib/api/client-ip';
import {
  checkRateLimit,
  type RateLimitConfig,
} from '@/core/lib/infra/rate-limit';

/** 100 requests per minute for unauthenticated callers */
export const PUBLIC_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100,
};

/** 200 requests per minute for authenticated callers */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 200,
};

/**
 * tRPC rate-limit middleware factory.
 *
 * - `'public'`: keyed by client IP, uses PUBLIC_RATE_LIMIT
 * - `'authenticated'`: keyed by user ID (falls back to IP), uses AUTH_RATE_LIMIT
 *
 * IP keying uses `getClientIp` (trusted rightmost hop), not the
 * attacker-controlled leftmost `x-forwarded-for` value.
 *
 * Fail-open when Redis is unavailable (see `checkRateLimit`). This is
 * acceptable for these general traffic limiters, but auth and AI/token
 * limiters must fail CLOSED (reject when Redis is down) — that stricter wiring
 * lives with those limiters (api-auth / AI procedures), not here.
 */
export async function applyRateLimit(
  type: 'public' | 'authenticated',
  ctx: { session?: { user?: { id: string } } | null; headers: Headers }
): Promise<void> {
  const redis = getRequestRedis();
  const config = type === 'authenticated' ? AUTH_RATE_LIMIT : PUBLIC_RATE_LIMIT;

  const key =
    type === 'authenticated' && ctx.session?.user
      ? `rl:user:${ctx.session.user.id}`
      : `rl:ip:${getClientIp(ctx.headers)}`;

  const result = await checkRateLimit(redis, key, config);

  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s`,
    });
  }
}
