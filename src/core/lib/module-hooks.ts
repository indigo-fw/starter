/**
 * Runtime hook registry for cross-module communication.
 *
 * Modules register handlers during serverInit (via deps files).
 * Consuming code (e.g. webhook routes) calls `runHook` to invoke
 * all registered handlers for an event — no direct cross-module imports needed.
 *
 * Usage:
 *   // In module deps file (runs at server startup):
 *   registerHook('payment.conversion', recordConversion);
 *
 *   // In webhook route:
 *   await runHook('payment.conversion', userId, subscriptionId, amountCents);
 */

type HookHandler = (...args: unknown[]) => Promise<void> | void;

const hooks = new Map<string, HookHandler[]>();

/**
 * Register a handler for a hook event.
 * Call this during server initialization (e.g., in deps files).
 */
export function registerHook(event: string, handler: HookHandler): void {
  const list = hooks.get(event) ?? [];
  list.push(handler);
  hooks.set(event, list);
}

/**
 * Run all handlers registered for a hook event.
 * Failures in individual handlers are caught and logged — they don't
 * propagate to the caller or prevent other handlers from running.
 */
export async function runHook(event: string, ...args: unknown[]): Promise<void> {
  const list = hooks.get(event) ?? [];
  if (list.length === 0) return;
  await Promise.allSettled(list.map((fn) => fn(...args)));
}

/**
 * Run handlers as guards — errors propagate to the caller.
 * Use for checks that should block the operation if they fail
 * (e.g., feature gates, authorization). No-ops if no handler registered.
 */
export async function runGuard(event: string, ...args: unknown[]): Promise<void> {
  const list = hooks.get(event) ?? [];
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
