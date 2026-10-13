import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  checkExpiredSubscriptions,
  checkExpiringSubscriptions,
  isWithinSendWindow,
  runDunningChecks,
} from '@/core-subscriptions/lib/dunning';
import { logAudit } from '@/core/lib/infra/audit';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

// vi.hoisted ensures these are available when vi.mock factories run (hoisted above mocks)
const {
  mockSelectFn,
  mockUpdateWhereMock: _mockUpdateWhereMock,
  mockUpdateSetMock,
  mockUpdateMock: _mockUpdateMock,
  mockDb,
  selectState,
  innerJoinState,
} = vi.hoisted(() => {
  const selectState = { sequence: [] as unknown[][], callIdx: 0 };
  const innerJoinState = { sequence: [] as unknown[][], callIdx: 0 };

  const mockSelectFn = vi.fn().mockImplementation(() => {
    const data = selectState.sequence[selectState.callIdx] ?? [];
    selectState.callIdx++;

    const limitMock = vi.fn().mockResolvedValue(data);
    const innerJoinWhereLimitMock = vi.fn().mockImplementation(() => {
      const ijData = innerJoinState.sequence[innerJoinState.callIdx] ?? [];
      innerJoinState.callIdx++;
      return Promise.resolve(ijData);
    });
    const _thenable = (d: unknown, chain: Record<string, unknown> = {}) => ({
      then: (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
        Promise.resolve(d).then(res, rej),
      ...chain,
    });
    const innerJoinWhereMock = vi
      .fn()
      .mockReturnValue(_thenable([], { limit: innerJoinWhereLimitMock }));
    const innerJoinMock = vi
      .fn()
      .mockReturnValue(_thenable([], { where: innerJoinWhereMock }));
    const whereMock = vi
      .fn()
      .mockReturnValue(
        _thenable(data, { limit: limitMock, innerJoin: innerJoinMock })
      );
    const fromMock = vi.fn().mockReturnValue(
      _thenable(data, {
        where: whereMock,
        innerJoin: innerJoinMock,
        limit: limitMock,
      })
    );
    return { from: fromMock };
  });

  const mockUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSetMock = vi
    .fn()
    .mockReturnValue({ where: mockUpdateWhereMock });
  const mockUpdateMock = vi.fn().mockReturnValue({ set: mockUpdateSetMock });

  const mockDb = { select: mockSelectFn, update: mockUpdateMock };

  return {
    mockSelectFn,
    mockUpdateWhereMock,
    mockUpdateSetMock,
    mockUpdateMock,
    mockDb,
    selectState,
    innerJoinState,
  };
});

vi.mock('@/server/db', () => ({
  db: mockDb,
}));

vi.mock('@/core-subscriptions/schema/subscriptions', () => ({
  saasSubscriptions: {
    id: 'saas_subscriptions.id',
    organizationId: 'saas_subscriptions.organization_id',
    planId: 'saas_subscriptions.plan_id',
    providerId: 'saas_subscriptions.provider_id',
    status: 'saas_subscriptions.status',
    currentPeriodEnd: 'saas_subscriptions.current_period_end',
    updatedAt: 'saas_subscriptions.updated_at',
  },
}));

vi.mock('@/server/db/schema/organization', () => ({
  member: {
    userId: 'member.user_id',
    organizationId: 'member.organization_id',
    role: 'member.role',
  },
}));

vi.mock('@/server/db/schema/auth', () => ({
  user: {
    id: 'user.id',
    email: 'user.email',
    timezone: 'user.timezone',
  },
}));

vi.mock('@/server/db/schema/audit', () => ({
  cmsAuditLog: {
    id: 'cms_audit_log.id',
    action: 'cms_audit_log.action',
    entityId: 'cms_audit_log.entity_id',
  },
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendNotification: vi.fn(),
  sendOrgNotification: vi.fn(),
}));

vi.mock('@/core/types/notifications', () => ({
  NotificationType: {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
  },
  NotificationCategory: {
    BILLING: 'billing',
    ORGANIZATION: 'organization',
    CONTENT: 'content',
    SYSTEM: 'system',
    SECURITY: 'security',
  },
}));

const mockPaymentsDeps = vi.hoisted(() => ({
  getPlan: vi
    .fn()
    .mockReturnValue({ name: 'Pro', priceMonthly: 2900, priceYearly: 29000 }),
  sendOrgNotification: vi.fn(),
  enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
  broadcastEvent: vi.fn(),
  getPlans: vi.fn().mockReturnValue([]),
  getPlanByProviderPriceId: vi.fn(),
  getProviderPriceId: vi.fn(),
  getEnabledProviderConfigs: vi.fn().mockReturnValue([]),
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
}));
vi.mock('@/core-subscriptions/deps', () => ({
  getSubscriptionsDeps: () => mockPaymentsDeps,
  setSubscriptionsDeps: vi.fn(),
}));

// 12:00 UTC: inside the 09–20 window for UTC (the no-timezone fallback), so the
// pre-existing tests keep sending; 08:00 in New York (outside) for the window tests.
const NOON_UTC = new Date('2026-10-13T12:00:00Z');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createExpiringSub(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'sub-11111111-2222-4333-8444-555555555555',
    organizationId: 'org-1',
    planId: 'pro',
    providerId: 'manual',
    currentPeriodEnd: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    ...overrides,
  };
}

function createExpiredSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    organizationId: 'org-2',
    planId: 'pro',
    providerId: 'manual',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dunning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON_UTC);
    selectState.sequence = [];
    selectState.callIdx = 0;
    innerJoinState.sequence = [];
    innerJoinState.callIdx = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // local send window
  // =========================================================================
  describe('isWithinSendWindow', () => {
    it('is open 09:00–19:59 local and closed otherwise', () => {
      expect(isWithinSendWindow('UTC', new Date('2026-10-13T09:00:00Z'))).toBe(
        true
      );
      expect(isWithinSendWindow('UTC', new Date('2026-10-13T19:59:00Z'))).toBe(
        true
      );
      expect(isWithinSendWindow('UTC', new Date('2026-10-13T20:00:00Z'))).toBe(
        false
      );
      expect(isWithinSendWindow('UTC', new Date('2026-10-13T08:59:00Z'))).toBe(
        false
      );
    });

    it('evaluates the hour in the given zone, falling back to UTC', () => {
      // 12:00Z = 08:00 New York (closed), 21:00 Tokyo (closed), 14:00 Berlin (open)
      expect(isWithinSendWindow('America/New_York', NOON_UTC)).toBe(false);
      expect(isWithinSendWindow('Asia/Tokyo', NOON_UTC)).toBe(false);
      expect(isWithinSendWindow('Europe/Berlin', NOON_UTC)).toBe(true);
      expect(isWithinSendWindow(null, NOON_UTC)).toBe(true);
      expect(isWithinSendWindow('Not/AZone', NOON_UTC)).toBe(true);
    });
  });

  // =========================================================================
  // checkExpiringSubscriptions
  // =========================================================================
  describe('checkExpiringSubscriptions', () => {
    it('sends reminders for subs expiring within 7 days', async () => {
      const sub = createExpiringSub();

      // select sequence:
      // 1. expiring subs -> [sub]
      // 2. audit log check (already reminded?) -> []
      // 3. org member emails (via innerJoin chain) -> handled by innerJoinState.sequence
      selectState.sequence = [
        [sub], // expiring subs
        [], // not yet reminded (audit log)
      ];
      innerJoinState.sequence = [[{ email: 'admin@org.com' }]];

      await checkExpiringSubscriptions();

      // Notification sent
      expect(mockPaymentsDeps.sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          title: 'Subscription expiring soon',
          body: expect.stringContaining('Pro'),
        })
      );

      // Email sent
      expect(mockPaymentsDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'admin@org.com',
        'subscription-expiring',
        expect.objectContaining({
          planName: 'Pro',
          daysLeft: expect.any(String),
        })
      );

      // Audit logged
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
          action: 'dunning.expiring',
          entityType: 'subscription',
          entityId: sub.id,
        })
      );
    });

    it('skips already-reminded subs', async () => {
      const sub = createExpiringSub();

      selectState.sequence = [
        [sub], // expiring subs
        [{ id: 'audit-1' }], // already reminded
      ];

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).not.toHaveBeenCalled();
      expect(mockPaymentsDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('handles no expiring subs gracefully', async () => {
      selectState.sequence = [[]]; // no expiring subs

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).not.toHaveBeenCalled();
      expect(mockPaymentsDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('skips subs with null currentPeriodEnd', async () => {
      const sub = createExpiringSub({ currentPeriodEnd: null });

      selectState.sequence = [[sub]];

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).not.toHaveBeenCalled();
    });

    it("defers the reminder while it is night in the owner's timezone", async () => {
      const sub = createExpiringSub(); // 3 days out
      selectState.sequence = [[sub], []];
      // 12:00Z is 08:00 in New York — one hour before the window opens
      innerJoinState.sequence = [
        [
          {
            email: 'owner@org.com',
            role: 'owner',
            timezone: 'America/New_York',
          },
        ],
      ];

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).not.toHaveBeenCalled();
      expect(mockPaymentsDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
      // No audit row → the next run inside the window still sends
      expect(logAudit).not.toHaveBeenCalled();
    });

    it("sends once the owner's local window is open, with local-day daysLeft", async () => {
      vi.setSystemTime(new Date('2026-10-13T14:00:00Z')); // 10:00 New York
      // 2026-10-16T02:00Z is still the evening of the 15th in New York → 2 local days,
      // where a UTC ceil() would have said 3.
      const sub = createExpiringSub({
        currentPeriodEnd: new Date('2026-10-16T02:00:00Z'),
      });
      selectState.sequence = [[sub], []];
      innerJoinState.sequence = [
        [
          { email: 'member@org.com', role: 'member', timezone: 'Asia/Tokyo' },
          {
            email: 'owner@org.com',
            role: 'owner',
            timezone: 'America/New_York',
          },
        ],
      ];

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          body: expect.stringContaining('expires in 2 days'),
        })
      );
      expect(mockPaymentsDeps.enqueueTemplateEmail).toHaveBeenCalledTimes(2);
      expect(mockPaymentsDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'owner@org.com',
        'subscription-expiring',
        expect.objectContaining({ daysLeft: '2' })
      );
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ daysLeft: 2 }),
        })
      );
    });

    it('ignores the window as a last chance when one local day is left', async () => {
      // 08:00 New York (closed), expiring tomorrow local
      const sub = createExpiringSub({
        currentPeriodEnd: new Date('2026-10-14T18:00:00Z'),
      });
      selectState.sequence = [[sub], []];
      innerJoinState.sequence = [
        [
          {
            email: 'owner@org.com',
            role: 'owner',
            timezone: 'America/New_York',
          },
        ],
      ];

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          body: expect.stringContaining('expires in 1 days'),
        })
      );
    });

    it('says "expires today" instead of "in 0 days"', async () => {
      const sub = createExpiringSub({
        currentPeriodEnd: new Date('2026-10-13T20:00:00Z'),
      });
      selectState.sequence = [[sub], []];
      innerJoinState.sequence = [
        [{ email: 'owner@org.com', role: 'owner', timezone: null }],
      ];

      await checkExpiringSubscriptions();

      expect(mockPaymentsDeps.sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          body: expect.stringContaining('expires today'),
        })
      );
    });
  });

  // =========================================================================
  // checkExpiredSubscriptions
  // =========================================================================
  describe('checkExpiredSubscriptions', () => {
    it('marks non-stripe expired subs as past_due', async () => {
      const sub = createExpiredSub({ providerId: 'manual' });

      // 1. expired subs
      selectState.sequence = [[sub]];
      // innerJoin: org member emails
      innerJoinState.sequence = [[{ email: 'admin@org.com' }]];

      await checkExpiredSubscriptions();

      // Subscription marked as past_due
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'past_due' })
      );

      // Notification sent
      expect(mockPaymentsDeps.sendOrgNotification).toHaveBeenCalledWith(
        'org-2',
        expect.objectContaining({
          title: 'Subscription expired',
          body: expect.stringContaining('Pro'),
        })
      );

      // Email sent
      expect(mockPaymentsDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'admin@org.com',
        'subscription-expired',
        expect.objectContaining({ planName: 'Pro' })
      );

      // Audit logged
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
          action: 'dunning.expired',
          entityType: 'subscription',
          entityId: sub.id,
        })
      );
    });

    it('skips stripe subs (stripe handles own lifecycle)', async () => {
      const sub = createExpiredSub({ providerId: 'stripe' });

      selectState.sequence = [[sub]];

      await checkExpiredSubscriptions();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockPaymentsDeps.sendOrgNotification).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('handles no expired subs gracefully', async () => {
      selectState.sequence = [[]];

      await checkExpiredSubscriptions();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockPaymentsDeps.sendOrgNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // runDunningChecks
  // =========================================================================
  describe('runDunningChecks', () => {
    it('calls both check functions without throwing', async () => {
      selectState.sequence = [[], []]; // empty for both checkExpiring + checkExpired

      await expect(runDunningChecks()).resolves.toBeUndefined();
    });

    it('catches errors without re-throwing', async () => {
      // Make select throw on first call
      mockSelectFn.mockImplementationOnce(() => {
        throw new Error('DB connection lost');
      });

      await expect(runDunningChecks()).resolves.toBeUndefined();
    });
  });
});
