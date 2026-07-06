/**
 * MCP request authentication. Two credential types, tried in order:
 *
 *   1. **API key** — the headless/CI path. Verified through the pluggable
 *      verifier registered by the key-owning module (`core-api` in the stock
 *      install) via `key-verifier.ts` — core has NO direct dependency on the
 *      module. Keys must carry the `mcp:invoke` scope (or be a superkey).
 *      The agent acts as the key's creator inside the key's organization.
 *
 *   2. **OAuth 2.1 access token** (Better Auth `mcp` plugin) — the human
 *      path. The user logged in via browser popup and consented; the agent
 *      acts as that user in their oldest (personal) organization. No extra
 *      scope gate — interactive consent IS the grant.
 *
 * Unauthenticated requests get a 401 with a `WWW-Authenticate` header pointing
 * at the RFC 9728 protected-resource metadata, which is what triggers MCP
 * clients to launch the OAuth flow automatically. (In dev, the route grants
 * anonymous access instead — see `buildAnonymousContext`.)
 */

import { asc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { user as userTable } from '@/server/db/schema/auth';
import { member } from '@/server/db/schema/organization';
import { auth } from '@/lib/auth';
import { createLogger } from '@/core/lib/infra/logger';
import { getMcpKeyVerifier } from './key-verifier';
import type { McpInvocationContext } from './types';

const logger = createLogger('mcp:auth');

/** The single MCP-level scope. Per-tool authorisation runs through tRPC middleware. */
export const MCP_SCOPE = 'mcp:invoke';

export type McpAuthError = 'missing-bearer' | 'invalid-key' | 'missing-scope' | 'user-missing' | 'user-banned' | 'no-org';

export interface McpAuthSuccess {
  ok: true;
  context: McpInvocationContext;
  /** 'api-key' or 'oauth' — how the request authenticated. */
  method: 'api-key' | 'oauth';
  /** Underlying API key id when method is 'api-key'. Useful for audit logging. */
  apiKeyId?: string;
}

export interface McpAuthFailure {
  ok: false;
  error: McpAuthError;
  status: 401 | 403;
  message: string;
}

export type McpAuthResult = McpAuthSuccess | McpAuthFailure;

/**
 * Resolve an MCP request's Authorization header to an invocation context.
 * Tries API-key auth first, then falls back to OAuth access tokens.
 */
export async function authenticateMcpRequest(request: Request): Promise<McpAuthResult> {
  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return { ok: false, error: 'missing-bearer', status: 401, message: 'Missing Authorization: Bearer <token>' };
  }
  const token = header.slice(7).trim();
  if (!token) {
    return { ok: false, error: 'missing-bearer', status: 401, message: 'Empty bearer token' };
  }

  const viaApiKey = await authenticateApiKey(request, token);
  // Only fall through to OAuth when the token isn't a known API key at all —
  // a valid key with a missing scope should fail loudly, not silently degrade.
  if (viaApiKey.ok || viaApiKey.error !== 'invalid-key') {
    return viaApiKey;
  }

  return authenticateOAuthToken(request);
}

async function authenticateApiKey(request: Request, token: string): Promise<McpAuthResult> {
  // The verifier is registered by the key-owning module's `mcpInit`
  // side-effect (in generated/module-mcp.ts) — load it lazily so the
  // registration lands in THIS module graph before the first lookup.
  await import('@/generated/module-mcp').catch(() => undefined);

  const verify = getMcpKeyVerifier();
  if (!verify) {
    // No key module installed — API keys don't exist here; try OAuth.
    return { ok: false, error: 'invalid-key', status: 401, message: 'API keys are not enabled' };
  }

  const verified = await verify(token);
  if (!verified) {
    return { ok: false, error: 'invalid-key', status: 401, message: 'Invalid or expired API key' };
  }

  // null scopes = superkey; otherwise the mcp:invoke scope is required.
  if (verified.scopes !== null && !verified.scopes.includes(MCP_SCOPE)) {
    return {
      ok: false,
      error: 'missing-scope',
      status: 403,
      message: `API key lacks required scope '${MCP_SCOPE}'`,
    };
  }

  const u = await loadUser(verified.userId);
  if (!u) {
    logger.warn('MCP key references missing user', { apiKeyId: verified.apiKeyId, userId: verified.userId });
    return { ok: false, error: 'user-missing', status: 401, message: 'API key owner not found' };
  }
  if (u.banned) {
    return { ok: false, error: 'user-banned', status: 403, message: 'API key owner is banned' };
  }

  const context: McpInvocationContext = {
    user: toContextUser(u),
    organizationId: verified.organizationId,
    headers: request.headers,
  };

  return { ok: true, context, method: 'api-key', apiKeyId: verified.apiKeyId };
}

/**
 * OAuth path — Better Auth's `mcp` plugin validates the access token and
 * returns the token record (with `userId`). We resolve the user's oldest
 * membership (the personal org created at signup — deterministic via the
 * ORDER BY) as the agent's working org; multi-org users who need a different
 * org should use an API key minted in that org instead.
 */
async function authenticateOAuthToken(request: Request): Promise<McpAuthResult> {
  let tokenRecord: { userId?: string | null } | null = null;
  try {
    tokenRecord = await auth.api.getMcpSession({ headers: request.headers });
  } catch {
    tokenRecord = null;
  }

  if (!tokenRecord?.userId) {
    return { ok: false, error: 'invalid-key', status: 401, message: 'Invalid or expired credentials' };
  }

  const u = await loadUser(tokenRecord.userId);
  if (!u) {
    return { ok: false, error: 'user-missing', status: 401, message: 'Token owner not found' };
  }
  if (u.banned) {
    return { ok: false, error: 'user-banned', status: 403, message: 'Token owner is banned' };
  }

  const [membership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, u.id))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);

  if (!membership) {
    return { ok: false, error: 'no-org', status: 403, message: 'User has no organization' };
  }

  const context: McpInvocationContext = {
    user: toContextUser(u),
    organizationId: membership.organizationId,
    headers: request.headers,
  };

  return { ok: true, context, method: 'oauth' };
}

// ─── helpers ────────────────────────────────────────────────────────────────

interface LoadedUser {
  id: string;
  email: string;
  role: string;
  banned: boolean;
  emailVerified: boolean;
  createdAt: Date | string;
}

async function loadUser(userId: string): Promise<LoadedUser | null> {
  const [u] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      role: userTable.role,
      banned: userTable.banned,
      emailVerified: userTable.emailVerified,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return u ?? null;
}

function toContextUser(u: LoadedUser): NonNullable<McpInvocationContext['user']> {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    banned: u.banned,
    emailVerified: u.emailVerified,
    createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
  };
}

/**
 * `WWW-Authenticate` challenge for 401 responses (RFC 9728 §5.1) — MCP
 * clients parse `resource_metadata` and auto-launch the OAuth flow.
 */
export function buildWwwAuthenticate(request: Request): string {
  const origin = new URL(request.url).origin;
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

/**
 * Anonymous invocation context — DEV ONLY (the route gates on NODE_ENV).
 * Lets agents test the logged-out experience: public procedures work,
 * protected ones fail with UNAUTHORIZED exactly as for a logged-out visitor.
 * Never enabled in production — an unauthenticated 401 there is what
 * triggers MCP clients' OAuth login flow.
 */
export function buildAnonymousContext(request: Request): McpInvocationContext {
  return { user: null, organizationId: null, headers: request.headers };
}
