/**
 * Wire core-api module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setApiDeps } from '@/core-api/deps';
import { registerApiScopes } from '@/core-api/lib/api-scopes';
import { resolveOrgId } from '@/server/lib/resolve-org';

setApiDeps({
  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  // Uncomment to enable token metering per API call (requires core-subscriptions):
  // async deductApiCallToken(orgId, _path) {
  //   const { deductTokens } = await import('@/core-subscriptions/lib/token-service');
  //   return deductTokens(orgId, 1, 'api_call', { type: 'api_v2' });
  // },
});

// ─── Project-specific API scopes ────────────────────────────────────────────
// Register scopes for project-layer resources here.
// Other modules register their own scopes in their serverInit files.

registerApiScopes([
  { id: 'read:projects', label: 'Read projects', module: 'project' },
  { id: 'write:projects', label: 'Create and update projects', module: 'project' },
]);
