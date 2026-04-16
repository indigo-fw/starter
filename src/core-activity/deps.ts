/**
 * core-activity dependency injection.
 *
 * Framework conventions (trpc, user table, db, audit) are imported directly.
 * Only project-specific cross-module dependencies are injected here.
 */

export interface ActivityDeps {
  /**
   * Resolve the active organization ID for the current user.
   * Returns the org ID or throws if the user has no org.
   */
  resolveOrgId: (activeOrganizationId: string | null, userId: string) => Promise<string>;
}

let _deps: ActivityDeps | null = null;

export function setActivityDeps(deps: ActivityDeps): void {
  _deps = deps;
}

export function getActivityDeps(): ActivityDeps {
  if (!_deps) {
    throw new Error(
      'Activity dependencies not configured. Call setActivityDeps() at startup — see src/core-activity/deps.ts',
    );
  }
  return _deps;
}
