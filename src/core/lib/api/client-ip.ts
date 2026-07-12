/**
 * Resolve the real client IP from the TRUSTED proxy hop.
 *
 * `x-forwarded-for` is a comma-separated chain appended left-to-right as a
 * request crosses proxies: `client, proxy1, proxy2`. The *leftmost* value is
 * attacker-controlled — a client can send any `x-forwarded-for` it likes, and
 * only the hops we actually control (our reverse proxy / load balancer) append
 * trustworthy values on the right. Keying rate limits on the leftmost value lets
 * an attacker rotate a fake IP per request and bypass the limit entirely.
 *
 * So we count `TRUSTED_PROXY_HOPS` in from the *right*: with the default of 1
 * trusted hop, the rightmost entry is the address our own proxy observed (the
 * real client, or the next upstream proxy). Behind two proxies you control
 * (e.g. CDN → LB → app), set `TRUSTED_PROXY_HOPS=2` so the CDN-reported client
 * IP is used instead of the LB's address.
 *
 * `cf-connecting-ip` (Cloudflare) and `x-real-ip` (nginx) are single-valued and
 * set by the edge, so they're preferred when present.
 */

const DEFAULT_TRUSTED_HOPS = 1;

function trustedHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!raw) return DEFAULT_TRUSTED_HOPS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_TRUSTED_HOPS;
}

/**
 * Resolve the client IP for security-sensitive keying (rate limiting, abuse
 * throttling). Returns `fallback` (default `'unknown'`) when no trustworthy
 * source is available.
 *
 * NOTE: this is the shared resolver — support-chat, forms, and api-auth limiters
 * still use the vulnerable `x-forwarded-for.split(',')[0]` (leftmost) pattern and
 * should be switched to this helper.
 */
export function getClientIp(headers: Headers, fallback = 'unknown'): string {
  const cfIp = headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (chain.length > 0) {
      // Count `hops` in from the right; clamp to the chain we actually got.
      const hops = Math.min(trustedHops(), chain.length);
      const ip = chain[chain.length - hops];
      if (ip) return ip;
    }
  }

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return fallback;
}
