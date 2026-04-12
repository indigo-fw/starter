/**
 * Extensible API scope registry.
 *
 * Core registers default CMS scopes. Other modules register their own
 * scopes at startup via `registerApiScopes()`.
 */

export interface ApiScopeDefinition {
  /** Scope identifier, e.g. 'read:posts', 'write:orders' */
  id: string;
  /** Human-readable label for admin UI */
  label: string;
  /** Module that registered this scope */
  module: string;
}

const SCOPE_REGISTRY = new Map<string, ApiScopeDefinition>();

/** Register one or more API scopes. Idempotent — later registration overwrites. */
export function registerApiScopes(scopes: ApiScopeDefinition[]): void {
  for (const scope of scopes) {
    SCOPE_REGISTRY.set(scope.id, scope);
  }
}

/** Get all registered scopes. */
export function getRegisteredScopes(): ApiScopeDefinition[] {
  return Array.from(SCOPE_REGISTRY.values());
}

/** Check if a scope ID is registered. */
export function isScopeRegistered(scopeId: string): boolean {
  return SCOPE_REGISTRY.has(scopeId);
}

/**
 * Validate that a key's scopes include the required scope.
 * Null scopes = superkey (all access). Empty array = no access.
 */
export function hasScope(keyScopes: string[] | null, requiredScope: string): boolean {
  if (keyScopes === null) return true; // superkey
  return keyScopes.includes(requiredScope);
}

/** Validate that all provided scope IDs are registered. Returns invalid ones. */
export function validateScopes(scopes: string[]): string[] {
  return scopes.filter((s) => !SCOPE_REGISTRY.has(s));
}

// ─── Default CMS scopes (always available) ──────────────────────────────────

registerApiScopes([
  { id: 'read:posts', label: 'Read posts', module: 'core' },
  { id: 'read:categories', label: 'Read categories', module: 'core' },
  { id: 'read:tags', label: 'Read tags', module: 'core' },
  { id: 'read:menus', label: 'Read menus', module: 'core' },
]);
