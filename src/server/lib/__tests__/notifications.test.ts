import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
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
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockSelectFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockSelectLimit = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

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

// Mock ws module to prevent import errors
vi.mock('@/server/lib/ws', () => ({
  sendToUser: vi.fn(),
}));

// Mock web-push to prevent dynamic import of @/lib/env (which imports server-only)
vi.mock('@/core/lib/push/web-push', () => ({
  sendPushToUser: vi.fn(),
}));

// Mock server-only to prevent unhandled rejection from transitive imports
vi.mock('server-only', () => ({}));

// Mock env to prevent validation crash from transitive dynamic imports
vi.mock('@/lib/env', () => ({
  env: {},
}));

import {
  sendNotification,
  sendOrgNotification,
  sendBulkNotification,
} from '../notifications';

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

  it('inserts a notification record into the database', async () => {
    sendNotification({
      userId: 'user-1',
      title: 'Test Notification',
      body: 'This is a test',
    });

    // Wait for the fire-and-forget async to complete
    await new Promise((r) => setTimeout(r, 50));
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

  it('uses provided type and category', async () => {
    sendNotification({
      userId: 'user-2',
      title: 'Billing Alert',
      body: 'Payment failed',
      type: 'warning',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
      orgId: 'org-1',
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockInsertValues).toHaveBeenCalled();

    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: 'user-2',
      title: 'Billing Alert',
      body: 'Payment failed',
      type: 'warning',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
      orgId: 'org-1',
    });
  });

  it('does not throw when db insert fails (fire-and-forget)', async () => {
    mockInsertReturning.mockRejectedValue(new Error('DB error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw
    sendNotification({
      userId: 'user-1',
      title: 'Test',
      body: 'Body',
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to send notification:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});

describe('sendOrgNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([
      { id: 'notif-1', userId: 'user-1', title: 'Test', body: 'Body' },
    ]);
  });

  it('queries org members and sends notification to each', async () => {
    const orgMembers = [
      { userId: 'member-1' },
      { userId: 'member-2' },
      { userId: 'member-3' },
    ];

    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue(orgMembers);

    sendOrgNotification('org-123', {
      title: 'Org Update',
      body: 'Something happened',
    });

    await new Promise((r) => setTimeout(r, 50));
    // Should have called insert once per member
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it('handles empty org membership gracefully', async () => {
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([]);

    sendOrgNotification('org-empty', {
      title: 'Test',
      body: 'Body',
    });

    // Give time for the async to settle
    await new Promise((r) => setTimeout(r, 50));

    // No inserts should be called since there are no members
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('sendBulkNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([
      { id: 'notif-1', userId: 'user-1', title: 'Test', body: 'Body' },
    ]);
  });

  it('sends notification to each user in the array', async () => {
    sendBulkNotification(['user-a', 'user-b'], {
      title: 'Bulk Notification',
      body: 'Sent to multiple users',
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});
