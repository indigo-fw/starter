import type { RequestContext } from '@/core/types/request-context';

/**
 * Extract request context (IP, UA, country, referer) from headers.
 * Priority for IP: CF-Connecting-IP -> X-Forwarded-For (first) -> X-Real-IP -> '0.0.0.0'
 */
export function extractRequestContext(headers: Headers): RequestContext {
  const cfIp = headers.get('cf-connecting-ip');
  const xForwardedFor = headers.get('x-forwarded-for');
  const xRealIp = headers.get('x-real-ip');

  const ip = cfIp ?? xForwardedFor?.split(',')[0]?.trim() ?? xRealIp ?? '0.0.0.0';
  const userAgent = headers.get('user-agent') ?? undefined;
  const country = headers.get('cf-ipcountry') ?? undefined;
  const state = headers.get('cf-region-code') ?? undefined;
  const timezone = headers.get('cf-timezone') ?? undefined;
  const referer = headers.get('referer') ?? undefined;

  return { ip, userAgent, country, state, timezone, referer };
}
