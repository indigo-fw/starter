/**
 * Runtime hook registry for cross-module communication.
 *
 * Modules register handlers during serverInit (via deps files).
 * Consuming code (e.g. webhook routes) calls `runHook` to invoke
 * all registered handlers for an event — no direct cross-module imports needed.
 *
 * Usage:
 *   // In module deps file (runs at server startup):
 *   registerHook('payment.conversion', async (userId, refId, amount) => { ... });
 *
 *   // In webhook route:
 *   await runHook('payment.conversion', userId, subscriptionId, amountCents);
 *
 * Type safety:
 *   Core defines events it owns in HookMap. Modules extend via declaration merging:
 *
 *     declare module '@/core/lib/module/module-hooks' {
 *       interface HookMap {
 *         'my.event': [userId: string, data: MyData];
 *       }
 *     }
 */

// ─── Hook type map (extend via declaration merging) ────────────────────────

/**
 * Maps hook event names to their argument tuples.
 * Core defines events it owns. Modules extend via declaration merging.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HookMap {
  'user.beforeDelete': [userId: string];
}

// ─── Typed hook registry ───────────────────────────────────────────────────

// Internal map uses `any` — type safety enforced at the public API boundary
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = new Map<string, ((...args: any[]) => Promise<void> | void)[]>();

/**
 * Register a handler for a hook event.
 * Call this during server initialization (e.g., in deps files).
 */
export function registerHook<K extends keyof HookMap>(
  event: K,
  handler: (...args: HookMap[K]) => Promise<void> | void,
): void {
  const list = hooks.get(event as string) ?? [];
  list.push(handler);
  hooks.set(event as string, list);
}

/**
 * Run all handlers registered for a hook event.
 * Failures in individual handlers are caught and logged — they don't
 * propagate to the caller or prevent other handlers from running.
 */
export async function runHook<K extends keyof HookMap>(
  event: K,
  ...args: HookMap[K]
): Promise<void> {
  const list = hooks.get(event as string) ?? [];
  if (list.length === 0) return;
  await Promise.allSettled(list.map((fn) => fn(...args)));
}

/**
 * Run handlers as guards — errors propagate to the caller.
 * Use for checks that should block the operation if they fail
 * (e.g., feature gates, authorization). No-ops if no handler registered.
 */
export async function runGuard<K extends keyof HookMap>(
  event: K,
  ...args: HookMap[K]
): Promise<void> {
  const list = hooks.get(event as string) ?? [];
  for (const fn of list) {
    await fn(...args);
  }
}

// ─── Channel authorizers (for WebSocket) ────────────────────────────────────

/**
 * Channel authorizer function.
 * Returns true (authorized), false (denied), or null (not my channel — skip).
 */
type ChannelAuthorizer = (userId: string | undefined, channel: string) => Promise<boolean | null>;

const channelAuthorizers: ChannelAuthorizer[] = [];

/**
 * Register a WebSocket channel authorizer.
 * Called during serverInit by modules that own channel prefixes.
 */
export function registerChannelAuthorizer(fn: ChannelAuthorizer): void {
  channelAuthorizers.push(fn);
}

/**
 * Check if a user can subscribe to a channel.
 * Iterates registered authorizers until one claims the channel.
 * Returns false if no authorizer recognizes the channel.
 */
export async function authorizeChannel(userId: string | undefined, channel: string): Promise<boolean> {
  for (const fn of channelAuthorizers) {
    const result = await fn(userId, channel);
    if (result !== null) return result;
  }
  return false;
}

// ─── Health checks (for /api/health) ────────────────────────────────────────

interface HealthCheckResult {
  status: 'ok' | 'error' | 'degraded';
  details?: Record<string, unknown>;
}

type HealthChecker = () => Promise<HealthCheckResult>;

const healthCheckers = new Map<string, HealthChecker>();

/**
 * Register a module health check.
 * Called during serverInit. The health endpoint runs all registered checks.
 */
export function registerHealthCheck(moduleName: string, checker: HealthChecker): void {
  healthCheckers.set(moduleName, checker);
}

/**
 * Run all registered module health checks.
 * Returns a map of module name → check result.
 */
export async function runHealthChecks(): Promise<Record<string, HealthCheckResult>> {
  const results: Record<string, HealthCheckResult> = {};
  const entries = [...healthCheckers.entries()];

  const settled = await Promise.allSettled(
    entries.map(async ([name, checker]) => {
      const result = await checker();
      return { name, result };
    }),
  );

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      results[outcome.value.name] = outcome.value.result;
    } else {
      const name = entries[settled.indexOf(outcome)]?.[0] ?? 'unknown';
      results[name] = { status: 'error', details: { error: String(outcome.reason) } };
    }
  }

  return results;
}

/**
 * Get list of registered module names (for health overview).
 */
export function getRegisteredModules(): string[] {
  return [...healthCheckers.keys()];
}

// ─── Auth middleware (for tRPC) ─────────────────────────────────────────────

type AuthMiddlewareCtx = {
  session: { user: { id: string; role?: string; email?: string; banned?: boolean } };
};
type AuthMiddlewareFn = (ctx: AuthMiddlewareCtx) => Promise<void>;

const authMiddlewares: { name: string; fn: AuthMiddlewareFn }[] = [];

/**
 * Register an auth middleware hook.
 * Called during serverInit by modules that need custom auth checks (2FA, IP whitelist, etc.).
 * Throw a TRPCError to block access.
 */
export function registerAuthMiddleware(name: string, fn: AuthMiddlewareFn): void {
  authMiddlewares.push({ name, fn });
}

/**
 * Run all registered auth middleware hooks sequentially.
 * Called by tRPC authMiddleware after core checks pass.
 * Any handler can throw TRPCError to block the request.
 */
export async function runAuthMiddleware(ctx: AuthMiddlewareCtx): Promise<void> {
  for (const { fn } of authMiddlewares) {
    await fn(ctx);
  }
}
