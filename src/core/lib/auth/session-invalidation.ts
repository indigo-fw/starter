/**
 * Session invalidation seam — makes bans and account erasure bite immediately
 * despite Better Auth's `cookieCache`.
 *
 * With `session.cookieCache` enabled (src/lib/auth.ts) a signed cookie carries
 * the session for up to `maxAge` seconds without touching the database, so
 * deleting the DB session rows alone leaves a banned user fully authenticated
 * for the rest of that window. This module records "sessions of user X issued
 * before time T are void" and `createTRPCContext` consults it on every request.
 *
 * Scope: process-local Map, broadcast to other instances over Redis pub/sub
 * (subscribe from `src/instrumentation.ts` so the Next.js bundle's copy of
 * this module — where tRPC runs — is the one that listens). Entries expire
 * after the cookie-cache window, when the cookie is re-validated against the
 * DB anyway. Without Redis, single-instance deployments still work because
 * caller and checker share the same module instance.
 */
import { createLogger } from '@/core/lib/infra/logger';
import { registerMemoryStat } from '@/core/lib/infra/memory-stats';

const log = createLogger('session-invalidation');

const CHANNEL = 'auth:session-invalidate';
/** Must be ≥ the cookieCache maxAge in src/lib/auth.ts (5 min) plus clock skew. */
const ENTRY_TTL_MS = 6 * 60 * 1000;

// Process-global so the Bun-run server.ts graph and the Next.js bundle graph
// share one map when both end up loading this module (same reason as
// memory-stats).
const MAP_KEY = Symbol.for('indigo.sessionInvalidations');
const SUBSCRIBED_KEY = Symbol.for('indigo.sessionInvalidationSubscribed');

function getMap(): Map<string, number> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[MAP_KEY]) g[MAP_KEY] = new Map<string, number>();
  return g[MAP_KEY] as Map<string, number>;
}

registerMemoryStat('sessionInvalidations', () => getMap().size);

function remember(userId: string, invalidatedAt: number): void {
  const map = getMap();
  map.set(userId, invalidatedAt);
  // Eviction: drop expired entries whenever we write (cheap; the map is tiny)
  const cutoff = Date.now() - ENTRY_TTL_MS;
  for (const [id, at] of map) {
    if (at < cutoff) map.delete(id);
  }
}

/**
 * Void every session of `userId` issued up to now. Call AFTER deleting the
 * user's DB session rows (this only covers the cookie-cache window).
 * Fire-and-forget safe: never throws.
 */
export function invalidateUserSessions(userId: string): void {
  const at = Date.now();
  remember(userId, at);
  void import('@/core/lib/infra/redis')
    .then(async ({ getPublisher }) => {
      const publisher = getPublisher();
      if (!publisher) return;
      await publisher.publish(CHANNEL, JSON.stringify({ userId, at }));
    })
    .catch((err: unknown) => {
      log.warn('Failed to broadcast session invalidation', {
        userId,
        error: String(err),
      });
    });
}

/**
 * Whether a session for `userId` created at `sessionCreatedAt` has been
 * voided. Sessions created after the invalidation (a fresh login post-unban)
 * remain valid. Unknown creation time is treated as pre-invalidation.
 */
export function isSessionInvalidated(
  userId: string,
  sessionCreatedAt?: Date | string | null
): boolean {
  const at = getMap().get(userId);
  if (at === undefined) return false;
  if (Date.now() - at > ENTRY_TTL_MS) {
    getMap().delete(userId);
    return false;
  }
  const created = sessionCreatedAt ? new Date(sessionCreatedAt).getTime() : NaN;
  return !(created > at);
}

/**
 * Subscribe to invalidations from other instances. Idempotent. Call from
 * `src/instrumentation.ts` (Next.js server context). No-op without Redis.
 */
export async function initSessionInvalidationSync(): Promise<void> {
  const g = globalThis as Record<symbol, unknown>;
  if (g[SUBSCRIBED_KEY]) return;
  const { getSubscriber } = await import('@/core/lib/infra/redis');
  const subscriber = getSubscriber();
  if (!subscriber) return;
  g[SUBSCRIBED_KEY] = true;

  await subscriber.subscribe(CHANNEL);
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== CHANNEL) return; // the subscriber connection is shared
    try {
      const { userId, at } = JSON.parse(message) as {
        userId?: unknown;
        at?: unknown;
      };
      if (typeof userId === 'string' && typeof at === 'number')
        remember(userId, at);
    } catch {
      // Ignore malformed broadcasts
    }
  });
}
