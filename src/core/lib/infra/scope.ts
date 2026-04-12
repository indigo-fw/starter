/**
 * Request-scoped context via AsyncLocalStorage.
 *
 * Provides a generic "scope ID" available throughout the request lifecycle.
 * Used by caches, Redis keys, job queues, and WS channels to isolate data.
 *
 * - Single-site mode: getScope() returns null, zero overhead
 * - Multisite mode: core-multisite wraps each request with withScope(siteId, ...)
 *
 * This is intentionally NOT multisite-specific — it's a generic request scope
 * that modules give meaning to.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const scopeStorage = new AsyncLocalStorage<string | null>();

/** Run a callback within a scope. All getScope() calls inside return the scopeId. */
export function withScope<T>(scopeId: string | null, fn: () => T): T {
  return scopeStorage.run(scopeId, fn);
}

/** Run an async callback within a scope. */
export async function withScopeAsync<T>(scopeId: string | null, fn: () => Promise<T>): Promise<T> {
  return scopeStorage.run(scopeId, fn);
}

/** Get the current scope ID. Returns null when no scope is active (single-site mode). */
export function getScope(): string | null {
  return scopeStorage.getStore() ?? null;
}

/** Build a scope-prefixed cache key. No-op when scope is null. */
export function getScopedKey(...parts: string[]): string {
  const scope = getScope();
  return scope ? `${scope}:${parts.join(':')}` : parts.join(':');
}
