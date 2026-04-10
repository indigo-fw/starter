import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
      changePassword: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/analytics/gdpr', () => ({
  anonymizeUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({
      canAccessAdmin: vi.fn().mockReturnValue(false),
    }),
  },
  Role: {
    USER: 'user',
    EDITOR: 'editor',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    BETTER_AUTH_SECRET: 'test-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPL_API_KEY: '',
  },
}));

import { asMock } from '@/test-utils';
import { authRouter } from '../auth';
import { auth } from '@/lib/auth';
import { anonymizeUser } from '@/core/lib/analytics/gdpr';
import { createMockDb } from './test-helpers';

// Auth tests use role:'user' and email:'test@test.com' — differs from the
// shared createMockCtx default (editor/editor@test.com). Keep a local version
// that preserves the auth-specific session shape.
function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      user: { id: 'user-1', email: 'test@test.com', role: 'user' },
    },
    db: createMockDb(),
    headers: new Headers(),
    activeOrganizationId: null,
    ...overrides,
  };
}

describe('authRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSession', () => {
    it('returns the session from context', async () => {
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.getSession();

      expect(result).toEqual(ctx.session);
    });

    it('returns null when no session', async () => {
      const ctx = createMockCtx({ session: null });
      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.getSession();

      expect(result).toBeNull();
    });
  });

  describe('me', () => {
    it('returns the current user', async () => {
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.me();

      expect(result).toEqual({ id: 'user-1', email: 'test@test.com', role: 'user' });
    });
  });

  describe('updateProfile', () => {
    it('updates the user name', async () => {
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.updateProfile({ name: 'New Name' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith({
        name: 'New Name',
        updatedAt: expect.any(Date),
      });
    });

    it('rejects empty name', async () => {
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);

      await expect(caller.updateProfile({ name: '' })).rejects.toThrow();
    });
  });

  describe('changePassword', () => {
    it('calls auth.api.changePassword on success', async () => {
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.changePassword({
        currentPassword: 'old-pass',
        newPassword: 'new-password-123',
      });

      expect(result).toEqual({ success: true });
      expect(auth.api.changePassword).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: {
          currentPassword: 'old-pass',
          newPassword: 'new-password-123',
        },
      });
    });

    it('throws BAD_REQUEST when auth.api.changePassword fails', async () => {
      asMock(auth.api.changePassword).mockRejectedValue(new Error('Wrong password'));
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);

      await expect(
        caller.changePassword({
          currentPassword: 'wrong-pass',
          newPassword: 'new-password-123',
        })
      ).rejects.toThrow('Current password is incorrect');
    });

    it('rejects password shorter than 6 characters', async () => {
      const ctx = createMockCtx();
      const caller = authRouter.createCaller(ctx as never);

      await expect(
        caller.changePassword({
          currentPassword: 'old-pass',
          newPassword: '12345',
        })
      ).rejects.toThrow();
    });
  });

  describe('deleteAccount', () => {
    it('anonymizes regular user account', async () => {
      const ctx = createMockCtx();
      asMock(anonymizeUser).mockResolvedValue(undefined);

      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.deleteAccount();

      expect(result).toEqual({ success: true });
      expect(anonymizeUser).toHaveBeenCalledWith(ctx.db, 'user-1', 'user-1', 'full');
    });

    it('supports pseudonymize mode', async () => {
      const ctx = createMockCtx();
      asMock(anonymizeUser).mockResolvedValue(undefined);

      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.deleteAccount({ mode: 'pseudonymize' });

      expect(result).toEqual({ success: true });
      expect(anonymizeUser).toHaveBeenCalledWith(ctx.db, 'user-1', 'user-1', 'pseudonymize');
    });

    it('prevents staff accounts from self-deleting', async () => {
      const ctx = createMockCtx();
      asMock(anonymizeUser).mockRejectedValue(new Error('Cannot anonymize a staff account'));

      const caller = authRouter.createCaller(ctx as never);

      await expect(caller.deleteAccount()).rejects.toThrow(
        'Cannot anonymize a staff account'
      );
    });

    it('throws when user does not exist', async () => {
      const ctx = createMockCtx();
      asMock(anonymizeUser).mockRejectedValue(new Error('User not found'));

      const caller = authRouter.createCaller(ctx as never);

      await expect(caller.deleteAccount()).rejects.toThrow('User not found');
    });
  });

  describe('activeSessions', () => {
    it('returns list of user sessions', async () => {
      const ctx = createMockCtx();
      const sessions = [
        { id: 'sess-1', ipAddress: '1.2.3.4', userAgent: 'Chrome', createdAt: new Date() },
        { id: 'sess-2', ipAddress: '5.6.7.8', userAgent: 'Firefox', createdAt: new Date() },
      ];
      ctx.db._chains.select.limit.mockResolvedValue(sessions);

      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.activeSessions();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('id', 'sess-1');
      expect(result[0]).toHaveProperty('ipAddress', '1.2.3.4');
    });
  });

  describe('revokeSession', () => {
    it('revokes a session owned by the current user', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([{ userId: 'user-1' }]);

      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.revokeSession({ sessionId: 'sess-1' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when session does not belong to user', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([{ userId: 'other-user' }]);

      const caller = authRouter.createCaller(ctx as never);

      await expect(
        caller.revokeSession({ sessionId: 'sess-1' })
      ).rejects.toThrow('Session not found');
    });

    it('throws NOT_FOUND when session does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = authRouter.createCaller(ctx as never);

      await expect(
        caller.revokeSession({ sessionId: 'nonexistent' })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('revokeAllSessions', () => {
    it('deletes all sessions when no current session cookie', async () => {
      const ctx = createMockCtx();

      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.revokeAllSessions();

      expect(result).toEqual({ success: true });
      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('preserves current session when cookie is present', async () => {
      const headers = new Headers();
      headers.set('cookie', 'better-auth.session_token=token123');

      const ctx = createMockCtx({ headers });
      // Return matching current session
      ctx.db._chains.select.limit.mockResolvedValue([{ id: 'current-sess' }]);

      const caller = authRouter.createCaller(ctx as never);
      const result = await caller.revokeAllSessions();

      expect(result).toEqual({ success: true });
    });
  });
});
