/**
 * core-api dependency injection.
 *
 * Framework conventions (trpc, db, user/org/member tables, audit, core utils)
 * are imported directly. Only project-specific behavior is injected here.
 */

export interface ApiDeps {
  /** Resolve the active organization ID for a user. */
  resolveOrgId: (activeOrgId: string | null, userId: string) => Promise<string>;

  /**
   * Deduct tokens for an API request (usage-based metering).
   * Returns false if insufficient balance. Null = metering disabled.
   */
  deductApiCallToken?: (orgId: string, path: string) => Promise<boolean>;
}

let _deps: ApiDeps | null = null;

export function setApiDeps(deps: ApiDeps): void {
  _deps = deps;
}

export function getApiDeps(): ApiDeps {
  if (!_deps) {
    throw new Error(
      'API dependencies not configured. Call setApiDeps() at startup — see src/core-api/deps.ts',
    );
  }
  return _deps;
}
