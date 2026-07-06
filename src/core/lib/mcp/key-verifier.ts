/**
 * MCP API-key verifier registry — the dependency-inversion seam between core
 * and whichever module owns API keys (`core-api` in the stock install).
 *
 * Core must not import module code, but MCP auth needs key verification.
 * So core defines the interface here, and the key-owning module registers an
 * implementation via a side-effect import declared in its `module.config.ts`
 * `mcpInit` field (aggregated into `src/generated/module-mcp.ts` by
 * `indigo:sync`, loaded lazily by MCP auth in the route's module graph).
 *
 * If no module registers a verifier (e.g. `core-api` was removed), API-key
 * auth is simply unavailable — OAuth login still works, and llms.txt should
 * be the only place that mentions keys.
 */

export interface McpVerifiedKey {
  /** Key row id — for audit logging. */
  apiKeyId: string;
  /** Organization the key is scoped to. */
  organizationId: string;
  /** User the agent acts as (the key's creator). */
  userId: string;
  /** Granted scopes. `null` = superkey (all scopes). */
  scopes: string[] | null;
}

/** Returns the verified key, or null for unknown/expired/revoked tokens. */
export type McpKeyVerifier = (token: string) => Promise<McpVerifiedKey | null>;

let verifier: McpKeyVerifier | null = null;

/** Called by the key-owning module's `mcpInit` side-effect module. */
export function registerMcpKeyVerifier(fn: McpKeyVerifier): void {
  verifier = fn;
}

export function getMcpKeyVerifier(): McpKeyVerifier | null {
  return verifier;
}
