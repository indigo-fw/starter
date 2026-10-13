/**
 * Wire core-api module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setApiDeps } from '@/core-api/deps';
import { registerApiScopes } from '@/core-api/lib/api-scopes';
import { createLogger } from '@/core/lib/infra/logger';
import { registerHook } from '@/core/lib/module/module-hooks';
import { resolveOrgId } from '@/server/lib/resolve-org';

const log = createLogger('api-gdpr');

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

// ─── GDPR hooks ─────────────────────────────────────────────────────────────
// Erasure deletes the user's sessions and credentials, but an API key is a
// credential core never sees: `withApiV2Route` authenticates the key alone and
// never loads its creator, so without this an erased sole-member's `sk_live_*`
// keeps working indefinitely. Revoke (not delete): `revoked` is the terminal
// status the key model already has, and request logs keep their FK.
registerHook('user.anonymize', async (userId) => {
  const { db } = await import('@/server/db');
  const { saasApiKeys } = await import('@/core-api/schema/api-keys');
  const { and, eq, inArray } = await import('drizzle-orm');

  const result = await db
    .update(saasApiKeys)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(
      and(
        eq(saasApiKeys.createdBy, userId),
        inArray(saasApiKeys.status, ['active', 'expiring'])
      )
    );

  const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) log.info('Revoked API keys of erased user', { userId, count });
});

registerHook('user.export', async (userId, bundle) => {
  const { db } = await import('@/server/db');
  const { saasApiKeys } = await import('@/core-api/schema/api-keys');
  const { eq } = await import('drizzle-orm');

  // Metadata only — the key material is hashed and cannot be exported.
  bundle.apiKeys = await db
    .select({
      id: saasApiKeys.id,
      organizationId: saasApiKeys.organizationId,
      name: saasApiKeys.name,
      prefix: saasApiKeys.prefix,
      status: saasApiKeys.status,
      createdAt: saasApiKeys.createdAt,
      lastUsedAt: saasApiKeys.lastUsedAt,
    })
    .from(saasApiKeys)
    .where(eq(saasApiKeys.createdBy, userId))
    .limit(500);
});

// ─── Project-specific API scopes ────────────────────────────────────────────
// Register scopes for project-layer resources here.
// Other modules register their own scopes in their serverInit files.

registerApiScopes([
  { id: 'read:projects', label: 'Read projects', module: 'project' },
  {
    id: 'write:projects',
    label: 'Create and update projects',
    module: 'project',
  },
]);
