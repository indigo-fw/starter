import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — capture what api-deps registers instead of touching a real DB.
// ---------------------------------------------------------------------------

const { hooks, db } = vi.hoisted(() => {
  const hooks = new Map<string, (...args: unknown[]) => Promise<void> | void>();

  const updateWhere = vi.fn().mockResolvedValue({ rowCount: 2 });
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  const limit = vi
    .fn()
    .mockResolvedValue([{ id: 'k1', name: 'CI key', prefix: 'sk_live_abc' }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return {
    hooks,
    db: { update, select, _set: set, _updateWhere: updateWhere },
  };
});

vi.mock('@/core/lib/module/module-hooks', () => ({
  registerHook: (
    event: string,
    handler: (...args: unknown[]) => Promise<void> | void
  ) => {
    hooks.set(event, handler);
  },
}));
vi.mock('@/core-api/deps', () => ({ setApiDeps: vi.fn() }));
vi.mock('@/core-api/lib/api-scopes', () => ({ registerApiScopes: vi.fn() }));
vi.mock('@/server/lib/resolve-org', () => ({ resolveOrgId: vi.fn() }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock('@/server/db', () => ({ db }));
vi.mock('@/core-api/schema/api-keys', () => ({
  saasApiKeys: {
    id: 'saas_api_keys.id',
    organizationId: 'saas_api_keys.organization_id',
    createdBy: 'saas_api_keys.created_by',
    name: 'saas_api_keys.name',
    prefix: 'saas_api_keys.prefix',
    status: 'saas_api_keys.status',
    createdAt: 'saas_api_keys.created_at',
    lastUsedAt: 'saas_api_keys.last_used_at',
  },
}));

const USER_ID = 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5';

describe('core-api GDPR hooks (config/deps/api-deps.ts)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import('@/config/deps/api-deps');
  });

  it('registers user.anonymize and user.export', () => {
    expect(hooks.has('user.anonymize')).toBe(true);
    expect(hooks.has('user.export')).toBe(true);
  });

  it('user.anonymize revokes every live key the user created', async () => {
    await hooks.get('user.anonymize')!(USER_ID);

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db._set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'revoked',
        updatedAt: expect.any(Date),
      })
    );
    expect(db._updateWhere).toHaveBeenCalledTimes(1);
  });

  it('user.export adds key metadata under bundle.apiKeys', async () => {
    const bundle: Record<string, unknown> = {};
    await hooks.get('user.export')!(USER_ID, bundle);

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(bundle.apiKeys).toEqual([
      { id: 'k1', name: 'CI key', prefix: 'sk_live_abc' },
    ]);
  });
});
