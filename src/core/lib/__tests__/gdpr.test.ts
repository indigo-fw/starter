import { anonymizeUser } from '../analytics/gdpr';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invalidateUserSessions } from '@/core/lib/auth/session-invalidation';
import { runGuard } from '@/core/lib/module/module-hooks';
import { asMock } from '@/test-utils';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/core/lib/auth/session-invalidation', () => ({
  invalidateUserSessions: vi.fn(),
}));
vi.mock('@/core/lib/infra/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock('@/core/lib/module/module-hooks', () => ({
  runHook: vi.fn().mockResolvedValue(undefined),
  runGuard: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/core/policy', () => ({
  Policy: {
    for: (role: string | null | undefined) => ({
      canAccessAdmin: () =>
        role === 'admin' || role === 'superadmin' || role === 'editor',
    }),
  },
}));
vi.mock('@/server/db/schema/audit', () => ({
  cmsAuditLog: { userId: 'audit.user_id' },
}));
vi.mock('@/server/db/schema/auth', () => ({
  user: { id: 'user.id', role: 'user.role', email: 'user.email' },
  session: { userId: 'session.user_id' },
  account: { userId: 'account.user_id' },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createDb(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn().mockReturnValue({ where: deleteWhere });

  return { select, update, delete: del, _set: set, _deleteWhere: deleteWhere };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return err instanceof TRPCError ? err.code : `not-trpc:${String(err)}`;
  }
}

const USER_ID = 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5';

describe('anonymizeUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND (TRPCError) for an unknown user', async () => {
    const db = createDb([]);
    expect(await codeOf(anonymizeUser(db as never, USER_ID))).toBe('NOT_FOUND');
  });

  it('throws BAD_REQUEST when the user is already anonymized', async () => {
    const db = createDb([
      { id: USER_ID, role: 'user', email: `deleted-${USER_ID}@gdpr.invalid` },
    ]);
    expect(await codeOf(anonymizeUser(db as never, USER_ID))).toBe(
      'BAD_REQUEST'
    );
  });

  it('throws FORBIDDEN for staff accounts', async () => {
    const db = createDb([
      { id: USER_ID, role: 'admin', email: 'admin@test.com' },
    ]);
    expect(await codeOf(anonymizeUser(db as never, USER_ID))).toBe('FORBIDDEN');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('scrubs PII, drops sessions + accounts and voids cached sessions', async () => {
    const db = createDb([
      { id: USER_ID, role: 'user', email: 'alice@test.com' },
    ]);
    await anonymizeUser(db as never, USER_ID);

    expect(runGuard).toHaveBeenCalledWith('user.anonymize', USER_ID);
    expect(db.delete).toHaveBeenCalledTimes(2);
    expect(invalidateUserSessions).toHaveBeenCalledWith(USER_ID);
    expect(db._set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'deleted_user',
        email: `deleted-${USER_ID}@gdpr.invalid`,
        banned: true,
      })
    );
  });

  it('aborts before destroying anything when a module scrubber fails', async () => {
    asMock(runGuard).mockRejectedValueOnce(new Error('support scrub failed'));
    const db = createDb([
      { id: USER_ID, role: 'user', email: 'alice@test.com' },
    ]);

    await expect(anonymizeUser(db as never, USER_ID)).rejects.toThrow(
      'support scrub failed'
    );
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
