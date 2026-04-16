import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock chain for db.insert().values().returning()
// ---------------------------------------------------------------------------
const mockInsertReturning = vi.fn().mockResolvedValue([
  {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Test',
    body: 'Body',
    type: 'info',
    category: 'system',
  },
]);
const mockInsertValues = vi
  .fn()
  .mockReturnValue({ returning: mockInsertReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

// ---------------------------------------------------------------------------
// Mock chain for db.select().from().where().limit()
// ---------------------------------------------------------------------------
const mockSelectLimit = vi.fn().mockResolvedValue([]);
const mockSelectWhere = vi
  .fn()
  .mockReturnValue({ limit: mockSelectLimit });
const mockSelectFrom = vi
  .fn()
  .mockReturnValue({ where: mockSelectWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
// ---------------------------------------------------------------------------
vi.mock('@/server/db', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock('@/server/db/schema', () => ({
  saasNotifications: { userId: 'user_id' },
  member: { userId: 'user_id', organizationId: 'organization_id' },
}));

const mockSendToUser = vi.fn();
vi.mock('@/server/lib/ws', () => ({
  sendToUser: mockSendToUser,
}));

const mockSendPushToUser = vi.fn();
vi.mock('@/core/lib/push/web-push', () => ({
  sendPushToUser: mockSendPushToUser,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ env: {} }));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------
import {
  sendNotification,
  sendOrgNotification,
  sendBulkNotification,
} from '@/server/lib/notifications';

/** Let fire-and-forget async closures settle. */
const settle = () => new Promise((r) => setTimeout(r, 50));

// ===========================================================================
// sendNotification
// ===========================================================================
describe('sendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        title: 'Test',
        body: 'Body',
        type: 'info',
        category: 'system',
      },
    ]);
  });

  it('inserts notification record into DB', async () => {
    sendNotification({
      userId: 'user-1',
      title: 'Test Notification',
      body: 'This is a test',
    });

    await settle();

    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'Test Notification',
      body: 'This is a test',
      type: 'info',
      category: 'system',
      actionUrl: undefined,
      orgId: undefined,
    });
  });

  it('broadcasts via WebSocket after DB insert', async () => {
    sendNotification({
      userId: 'user-1',
      title: 'WS Test',
      body: 'Body',
    });

    await settle();

    expect(mockSendToUser).toHaveBeenCalledWith(
      'user-1',
      'notification',
      expect.objectContaining({ id: 'notif-1', userId: 'user-1' }),
    );
  });

  it('sends web push notification after DB insert', async () => {
    sendNotification({
      userId: 'user-1',
      title: 'Push Test',
      body: 'Push body',
      type: 'warning',
      category: 'billing',
      actionUrl: '/billing',
    });

    await settle();

    expect(mockSendPushToUser).toHaveBeenCalledWith('user-1', {
      title: 'Push Test',
      body: 'Push body',
      actionUrl: '/billing',
      type: 'warning',
      category: 'billing',
    });
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockInsertReturning.mockRejectedValue(new Error('DB connection lost'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Must not throw synchronously or reject unhandled
    sendNotification({
      userId: 'user-1',
      title: 'Fail',
      body: 'Body',
    });

    await settle();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to send notification:',
      expect.any(Error),
    );

    // WS and push should NOT be called when DB insert failed
    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(mockSendPushToUser).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('still persists notification when WS broadcast fails', async () => {
    mockSendToUser.mockImplementation(() => {
      throw new Error('WS unavailable');
    });

    sendNotification({
      userId: 'user-1',
      title: 'WS Fail',
      body: 'Body',
    });

    await settle();

    // DB insert should still have been called
    expect(mockInsert).toHaveBeenCalled();
    // Push should still be attempted despite WS failure
    expect(mockSendPushToUser).toHaveBeenCalled();
  });

  it('still persists notification when push fails', async () => {
    mockSendPushToUser.mockImplementation(() => {
      throw new Error('Push unavailable');
    });

    sendNotification({
      userId: 'user-1',
      title: 'Push Fail',
      body: 'Body',
    });

    await settle();

    expect(mockInsert).toHaveBeenCalled();
    expect(mockSendToUser).toHaveBeenCalled();
  });

  it('uses provided type and category instead of defaults', async () => {
    sendNotification({
      userId: 'user-2',
      title: 'Billing Alert',
      body: 'Payment failed',
      type: 'warning',
      category: 'billing',
      actionUrl: '/dashboard/billing',
      orgId: 'org-1',
    });

    await settle();

    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: 'user-2',
      title: 'Billing Alert',
      body: 'Payment failed',
      type: 'warning',
      category: 'billing',
      actionUrl: '/dashboard/billing',
      orgId: 'org-1',
    });
  });
});

// ===========================================================================
// sendBulkNotification
// ===========================================================================
describe('sendBulkNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([
      { id: 'notif-1', userId: 'user-1', title: 'Bulk', body: 'Body' },
    ]);
  });

  it('calls sendNotification for each user ID', async () => {
    sendBulkNotification(['user-a', 'user-b', 'user-c'], {
      title: 'Bulk Update',
      body: 'Sent to all',
    });

    await settle();

    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it('handles empty user list gracefully', async () => {
    sendBulkNotification([], {
      title: 'Empty',
      body: 'No recipients',
    });

    await settle();

    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// sendOrgNotification
// ===========================================================================
describe('sendOrgNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([
      { id: 'notif-1', userId: 'member-1', title: 'Org', body: 'Body' },
    ]);
  });

  it('queries org members and calls sendNotification for each', async () => {
    mockSelectLimit.mockResolvedValue([
      { userId: 'member-1' },
      { userId: 'member-2' },
      { userId: 'member-3' },
    ]);

    sendOrgNotification('org-123', {
      title: 'Org Update',
      body: 'Something happened',
    });

    await settle();

    // Should query members from the member table
    expect(mockSelect).toHaveBeenCalled();
    expect(mockSelectFrom).toHaveBeenCalled();
    // Should have inserted a notification for each member
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it('handles empty org with no members', async () => {
    mockSelectLimit.mockResolvedValue([]);

    sendOrgNotification('org-empty', {
      title: 'No Members',
      body: 'Body',
    });

    await settle();

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not throw on member query failure', async () => {
    mockSelectLimit.mockRejectedValue(new Error('Query failed'));
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    sendOrgNotification('org-fail', {
      title: 'Fail',
      body: 'Body',
    });

    await settle();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to send org notification:',
      expect.any(Error),
    );
    expect(mockInsert).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
