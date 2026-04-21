/**
 * Multisite dependency injection.
 * Project wires this in src/config/deps/multisite-deps.ts (imported as side-effect in server.ts).
 */

export interface MultisiteDeps {
  /** Base domain for temporary subdomains (e.g., 'yourdomain.com') */
  baseDomain: string;
  /** Network admin subdomain (default: 'admin') */
  networkAdminSubdomain?: string;
}

let _deps: MultisiteDeps | null = null;

export function setMultisiteDeps(deps: MultisiteDeps): void {
  _deps = deps;
}

export function getMultisiteDeps(): MultisiteDeps {
  if (!_deps) {
    throw new Error('Multisite deps not configured. Call setMultisiteDeps() in server.ts');
  }
  return _deps;
}

/** Check if multisite is configured (deps have been set) */
export function isMultisiteEnabled(): boolean {
  return _deps !== null;
}
