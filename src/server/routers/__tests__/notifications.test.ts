import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/core/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    BETTER_AUTH_SECRET: 'test-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPL_API_KEY: '',
  },
}));

import { notificationsRouter } from '../notifications';
import { createMockDb } from './test-helpers';

// Notifications tests use role:'user' and pass pre-built db objects.
// createMockCtx accepts an optional pre-built db (not overrides record)
// to keep the existing call-site pattern: createMockCtx(db).
function createMockCtx(db?: ReturnType<typeof createMockDb>) {
  return {
    session: {
      user: { id: 'user-1', email: 'test@test.com', role: 'user' },
    },
    db: db ?? createMockDb(),
    headers: new Headers(),
    activeOrganizationId: null,
  };
}

describe('notificationsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns empty list when user has no notifications', async () => {
      const db = createMockDb();
      db._chains.select.limit.mockResolvedValue([]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.list({});

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('returns notifications with pagination', async () => {
      const db = createMockDb();
      const notifications = Array.from({ length: 21 }, (_, i) => ({
        id: `notif-${i}`,
        userId: 'user-1',
        title: `Notification ${i}`,
        body: `Body ${i}`,
        type: 'info',
        category: 'system',
        read: false,
        createdAt: new Date(),
      }));
      // Return 21 items (limit + 1) to signal hasMore
      db._chains.select.limit.mockResolvedValue(notifications);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.list({ limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });

    it('returns hasMore=false when fewer items than limit', async () => {
      const db = createMockDb();
      const notifications = [
        { id: 'notif-1', userId: 'user-1', title: 'Test', body: 'Body', type: 'info', category: 'system', read: false, createdAt: new Date() },
      ];
      db._chains.select.limit.mockResolvedValue(notifications);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.list({ limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('respects default limit of 20', async () => {
      const db = createMockDb();
      db._chains.select.limit.mockResolvedValue([]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      await caller.list({});

      // The limit passed to DB is input.limit + 1 = 21
      expect(db._chains.select.limit).toHaveBeenCalledWith(21);
    });
  });

  describe('unreadCount', () => {
    it('returns 0 when no unread notifications', async () => {
      const db = createMockDb();
      db._chains.select.limit.mockResolvedValue([{ count: 0 }]);
      // For unreadCount, the chain is select().from().where() — no orderBy or limit
      // Need to mock the where to return the result directly
      db._chains.select.where.mockResolvedValue([{ count: 0 }]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.unreadCount();

      expect(result).toBe(0);
    });

    it('returns count of unread notifications', async () => {
      const db = createMockDb();
      db._chains.select.where.mockResolvedValue([{ count: 5 }]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.unreadCount();

      expect(result).toBe(5);
    });
  });

  describe('markRead', () => {
    it('marks a notification as read', async () => {
      const db = createMockDb();
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.markRead({ id: 'notif-1' });

      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
      expect(db._chains.update.set).toHaveBeenCalledWith({
        read: true,
        readAt: expect.any(Date),
      });
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      const db = createMockDb();
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.markAllRead();

      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
      expect(db._chains.update.set).toHaveBeenCalledWith({
        read: true,
        readAt: expect.any(Date),
      });
    });
  });

  describe('delete', () => {
    it('deletes a notification', async () => {
      const db = createMockDb();
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: 'notif-1' });

      expect(result).toEqual({ success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
