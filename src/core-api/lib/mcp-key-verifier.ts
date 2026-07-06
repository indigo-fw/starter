/**
 * core-api's MCP key verifier — side-effect module registered via
 * `mcpInit` in module.config.ts (aggregated into generated/module-mcp.ts).
 *
 * Bridges core's MCP auth to this module's `saas_api_keys` table: verifies
 * the bearer token, resolves the key's creator (the user the agent acts as),
 * and bumps lastUsedAt. Also registers the `mcp:invoke` scope so it shows up
 * in the key-management UI's scope picker.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasApiKeys } from '@/core-api/schema/api-keys';
import { verifyApiKey, touchKeyLastUsed } from '@/core-api/lib/api-key-service';
import { registerApiScopes } from '@/core-api/lib/api-scopes';
import { registerMcpKeyVerifier } from '@/core/lib/mcp/key-verifier';
import { MCP_SCOPE } from '@/core/lib/mcp/auth';

registerApiScopes([
  {
    id: MCP_SCOPE,
    label: 'Invoke MCP tools (agent access)',
    module: 'core-api',
  },
]);

registerMcpKeyVerifier(async (token) => {
  const verified = await verifyApiKey(token);
  if (!verified) return null;

  const [keyRow] = await db
    .select({ createdBy: saasApiKeys.createdBy })
    .from(saasApiKeys)
    .where(eq(saasApiKeys.id, verified.id))
    .limit(1);

  // Race: key deleted between verify and read — treat as invalid.
  if (!keyRow) return null;

  touchKeyLastUsed(verified.id);

  return {
    apiKeyId: verified.id,
    organizationId: verified.organizationId,
    userId: keyRow.createdBy,
    scopes: verified.scopes,
  };
});
