/**
 * Wire core-activity module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setActivityDeps } from '@/core-activity/deps';
import { resolveOrgId } from '@/server/lib/resolve-org';

setActivityDeps({
  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },
});
