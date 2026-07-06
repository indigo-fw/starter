/**
 * MCP auth tests — API-key path (via the pluggable verifier), OAuth
 * fallback, scope enforcement, and failure ordering.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// authenticateApiKey lazily imports the generated module to trigger verifier
// registration — neutralise it; tests register verifiers directly.
vi.mock('@/generated/module-mcp', () => ({ moduleMcpTools: [] }));

// Chainable drizzle-ish select mock: each `db.select()` consumes the next
// row-set from the queue, whatever chain methods follow.
const rowQueue: unknown[][] = [];
vi.mock('@/server/db', () => {
  const chain = () => {
    const rows = rowQueue.shift() ?? [];
    const builder: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) {
      builder[m] = () => builder;
    }
    builder.limit = () => Promise.resolve(rows);
    return builder;
  };
  return { db: { select: chain } };
});

const getMcpSessionMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getMcpSession: (...args: unknown[]) => getMcpSessionMock(...args) } },
}));

import { authenticateMcpRequest, MCP_SCOPE } from '../auth';
import { registerMcpKeyVerifier } from '../key-verifier';

const USER_ROW = {
  id: 'user-1',
  email: 'agent@test.local',
  role: 'user',
  banned: false,
  emailVerified: true,
  createdAt: new Date('2026-01-01'),
};

function req(token?: string): Request {
  return new Request('http://test.local/api/mcp', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  rowQueue.length = 0;
  getMcpSessionMock.mockReset();
  getMcpSessionMock.mockResolvedValue(null);
  registerMcpKeyVerifier(async () => null); // default: token unknown
});

describe('bearer extraction', () => {
  it('rejects missing and empty bearer tokens', async () => {
    const missing = await authenticateMcpRequest(req());
    expect(missing).toMatchObject({ ok: false, error: 'missing-bearer', status: 401 });

    const empty = await authenticateMcpRequest(req('   '));
    expect(empty).toMatchObject({ ok: false, error: 'missing-bearer' });
  });
});

describe('API-key path', () => {
  it('authenticates a valid superkey (null scopes) as the key creator in the key org', async () => {
    registerMcpKeyVerifier(async (token) =>
      token === 'sk_good'
        ? { apiKeyId: 'key-1', organizationId: 'org-9', userId: 'user-1', scopes: null }
        : null,
    );
    rowQueue.push([USER_ROW]); // loadUser

    const result = await authenticateMcpRequest(req('sk_good'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe('api-key');
      expect(result.apiKeyId).toBe('key-1');
      expect(result.context.organizationId).toBe('org-9');
      expect(result.context.user?.email).toBe('agent@test.local');
      expect(result.context.user?.createdAt).toBe(new Date('2026-01-01').toISOString());
    }
  });

  it('enforces the mcp:invoke scope — and does NOT degrade to OAuth', async () => {
    registerMcpKeyVerifier(async () => ({
      apiKeyId: 'key-1',
      organizationId: 'org-9',
      userId: 'user-1',
      scopes: ['read:posts'], // valid key, wrong scope
    }));
    getMcpSessionMock.mockResolvedValue({ userId: 'user-1' }); // OAuth would succeed…

    const result = await authenticateMcpRequest(req('sk_scoped'));
    expect(result).toMatchObject({ ok: false, error: 'missing-scope', status: 403 });
    expect(getMcpSessionMock).not.toHaveBeenCalled(); // …but must never be consulted
  });

  it('accepts scoped keys that carry mcp:invoke', async () => {
    registerMcpKeyVerifier(async () => ({
      apiKeyId: 'key-1',
      organizationId: 'org-9',
      userId: 'user-1',
      scopes: [MCP_SCOPE],
    }));
    rowQueue.push([USER_ROW]);
    const result = await authenticateMcpRequest(req('sk_scoped'));
    expect(result.ok).toBe(true);
  });

  it('rejects banned key owners', async () => {
    registerMcpKeyVerifier(async () => ({
      apiKeyId: 'key-1',
      organizationId: 'org-9',
      userId: 'user-1',
      scopes: null,
    }));
    rowQueue.push([{ ...USER_ROW, banned: true }]);
    const result = await authenticateMcpRequest(req('sk_banned'));
    expect(result).toMatchObject({ ok: false, error: 'user-banned', status: 403 });
  });
});

describe('OAuth fallback', () => {
  it('falls back to OAuth when the token is not a known API key', async () => {
    getMcpSessionMock.mockResolvedValue({ userId: 'user-1' });
    rowQueue.push([USER_ROW]); // loadUser
    rowQueue.push([{ organizationId: 'org-personal' }]); // oldest membership

    const result = await authenticateMcpRequest(req('oauth_token'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe('oauth');
      expect(result.context.organizationId).toBe('org-personal');
    }
  });

  it('fails with no-org when the OAuth user has no membership', async () => {
    getMcpSessionMock.mockResolvedValue({ userId: 'user-1' });
    rowQueue.push([USER_ROW]);
    rowQueue.push([]); // no membership rows

    const result = await authenticateMcpRequest(req('oauth_token'));
    expect(result).toMatchObject({ ok: false, error: 'no-org', status: 403 });
  });

  it('returns invalid-key when neither path recognises the token', async () => {
    const result = await authenticateMcpRequest(req('garbage'));
    expect(result).toMatchObject({ ok: false, error: 'invalid-key', status: 401 });
  });

  it('treats getMcpSession exceptions as invalid credentials, not 500s', async () => {
    getMcpSessionMock.mockRejectedValue(new Error('oidc table missing'));
    const result = await authenticateMcpRequest(req('boom'));
    expect(result).toMatchObject({ ok: false, error: 'invalid-key' });
  });
});
