import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UNANSWERED_REPLY_LIMIT,
  supportRouter,
} from '@/core-support/routers/support';
import { logAudit } from '@/core/lib/infra/audit';
import { checkRateLimit } from '@/core/lib/infra/rate-limit';
import {
  sendBulkNotification,
  sendNotification,
  sendOrgNotification,
} from '@/server/lib/notifications';
import { resolveOrgId } from '@/server/lib/resolve-org';
// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  getRequestRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 9, retryAfterMs: 0 }),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendNotification: vi.fn(),
  sendOrgNotification: vi.fn(),
  sendBulkNotification: vi.fn(),
}));

const mockSupportDeps = {
  enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
  getSupportEmail: vi.fn().mockResolvedValue('support@test.com'),
};

vi.mock('@/core-support/deps', () => ({
  getSupportDeps: () => mockSupportDeps,
  setSupportDeps: vi.fn(),
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

vi.mock('@/core/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({
      canAccessAdmin: vi.fn().mockReturnValue(true),
      can: vi.fn().mockReturnValue(true),
    }),
  },
  Role: {
    USER: 'user',
    EDITOR: 'editor',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
  },
}));

vi.mock('@/core/crud/admin-crud', () => ({
  parsePagination: vi
    .fn()
    .mockImplementation((input: { page?: number; pageSize?: number }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      return { page, pageSize, offset: (page - 1) * pageSize };
    }),
  paginatedResult: vi
    .fn()
    .mockImplementation(
      (items: unknown[], total: number, page: number, pageSize: number) => ({
        results: items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      })
    ),
}));

vi.mock('@/core-support/schema/support-tickets', () => ({
  saasTickets: {
    id: 'saas_tickets.id',
    organizationId: 'saas_tickets.organization_id',
    userId: 'saas_tickets.user_id',
    subject: 'saas_tickets.subject',
    status: 'saas_tickets.status',
    priority: 'saas_tickets.priority',
    assignedTo: 'saas_tickets.assigned_to',
    closedAt: 'saas_tickets.closed_at',
    resolvedAt: 'saas_tickets.resolved_at',
    createdAt: 'saas_tickets.created_at',
    updatedAt: 'saas_tickets.updated_at',
  },
  saasTicketMessages: {
    id: 'saas_ticket_messages.id',
    ticketId: 'saas_ticket_messages.ticket_id',
    userId: 'saas_ticket_messages.user_id',
    isStaff: 'saas_ticket_messages.is_staff',
    body: 'saas_ticket_messages.body',
    attachments: 'saas_ticket_messages.attachments',
    createdAt: 'saas_ticket_messages.created_at',
  },
}));

vi.mock('@/server/db/schema/auth', () => ({
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
    role: 'user.role',
    lang: 'user.lang',
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

vi.mock('@/server/lib/resolve-org', () => ({
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Makes an object thenable (can be awaited / used in Promise.all).
 * Drizzle query builders are thenable: when awaited, they execute.
 * We simulate this by resolving to `data` and also exposing chain methods.
 */
function thenable(data: unknown, chainMethods: Record<string, unknown> = {}) {
  return {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject),
    ...chainMethods,
  };
}

/**
 * Creates a select chain that supports both full chain (`.where().orderBy().offset().limit()`)
 * and short chain (`.where()` used directly in Promise.all).
 * `data` is what the chain resolves to when awaited at any point.
 */
function createSelectChain(data: unknown) {
  const limitMock = vi.fn().mockResolvedValue(data);
  const offsetMock = vi
    .fn()
    .mockReturnValue(thenable(data, { limit: limitMock }));
  const orderByMock = vi
    .fn()
    .mockReturnValue(thenable(data, { limit: limitMock, offset: offsetMock }));
  const groupByMock = vi
    .fn()
    .mockReturnValue(thenable(data, { orderBy: orderByMock }));
  const whereMock = vi.fn().mockReturnValue(
    thenable(data, {
      limit: limitMock,
      orderBy: orderByMock,
      offset: offsetMock,
      groupBy: groupByMock,
    })
  );
  const fromMock = vi.fn().mockReturnValue(
    thenable(data, {
      where: whereMock,
      orderBy: orderByMock,
      limit: limitMock,
      groupBy: groupByMock,
    })
  );
  return { from: fromMock, _limit: limitMock };
}

function createMockDb() {
  const returningMock = vi.fn().mockResolvedValue([{ id: 'new-id' }]);
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ returning: returningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  // Default: each select() returns an empty-array-resolving chain
  const selectMock = vi.fn().mockImplementation(() => createSelectChain([]));

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  return {
    insert: insertMock,
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
    _chains: {
      insert: { values: insertValuesMock, returning: returningMock },
      update: { set: updateSetMock, where: updateWhereMock },
      delete: { where: deleteWhereMock },
    },
  };
}

/**
 * Configures select() to return data in sequence. Each call to select()
 * gets the next entry from `sequence`.
 */
function setupSelectSequence(
  db: ReturnType<typeof createMockDb>,
  sequence: unknown[]
) {
  let callIdx = 0;
  db.select.mockImplementation(() => {
    const data = sequence[callIdx] ?? [];
    callIdx++;
    return createSelectChain(data);
  });
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } },
    db: createMockDb(),
    headers: new Headers(),
    activeOrganizationId: 'org-1',
    ...overrides,
  };
}

const TICKET_UUID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const ADMIN_UUID = 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5';

const MOCK_TICKET = {
  id: TICKET_UUID,
  organizationId: 'org-1',
  userId: 'user-1',
  subject: 'Cannot upload files',
  status: 'open',
  priority: 'normal',
  assignedTo: null,
  closedAt: null,
  resolvedAt: null,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
};

const STAFF_ROWS = [{ id: 'admin-1' }, { id: 'admin-2' }];
const CUSTOMER_ROW = { name: 'Test User', email: 'test@test.com', lang: 'de' };

/** Email enqueues are fire-and-forget, so assertions on them must wait a tick. */
function expectEmailEnqueued(...args: unknown[]) {
  return vi.waitFor(() => {
    expect(mockSupportDeps.enqueueTemplateEmail).toHaveBeenCalledWith(...args);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('supportRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(resolveOrgId).mockImplementation(
      async (activeOrgId: string | null) => {
        if (activeOrgId) return activeOrgId;
        throw new Error('No active organization selected');
      }
    );
    asMock(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterMs: 0,
    });
    mockSupportDeps.getSupportEmail.mockResolvedValue('support@test.com');
    mockSupportDeps.enqueueTemplateEmail.mockResolvedValue(undefined);
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it("returns paginated tickets for user's org", async () => {
      const ctx = createMockCtx();
      const tickets = [
        {
          id: 't-1',
          subject: 'Issue A',
          status: 'open',
          priority: 'normal',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // list() does Promise.all: first select = items, second select = count row
      setupSelectSequence(ctx.db, [tickets, [{ count: 1 }]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.list({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        results: tickets,
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('inserts ticket + initial message, notifies staff in-app and by email', async () => {
      const ctx = createMockCtx();
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      // create: staff lookup, then customer lookup
      setupSelectSequence(ctx.db, [STAFF_ROWS, [CUSTOMER_ROW]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.create({
        subject: 'Need help',
        body: 'My account is locked',
        priority: 'high',
      });

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');

      // Two inserts: ticket + message
      expect(ctx.db.insert).toHaveBeenCalledTimes(2);

      // logAudit was called
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'support.create',
          entityType: 'ticket',
          metadata: expect.objectContaining({
            subject: 'Need help',
            priority: 'high',
          }),
        })
      );

      // Staff, not the customer's org, get the in-app ping
      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(sendBulkNotification).toHaveBeenCalledWith(
        ['admin-1', 'admin-2'],
        expect.objectContaining({
          title: 'New support ticket',
          body: expect.stringContaining('Need help'),
          actionUrl: `/dashboard/settings/support/${result.id}`,
        })
      );

      // Support inbox gets the email in the default locale
      await expectEmailEnqueued(
        'support@test.com',
        'support-ticket-new',
        expect.objectContaining({
          subject: 'Need help',
          priority: 'high',
          customerEmail: 'test@test.com',
          preview: 'My account is locked',
        }),
        'en'
      );
    });

    it('still creates the ticket when no support email is configured', async () => {
      const ctx = createMockCtx();
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      setupSelectSequence(ctx.db, [STAFF_ROWS, [CUSTOMER_ROW]]);
      mockSupportDeps.getSupportEmail.mockResolvedValue(null);

      const caller = supportRouter.createCaller(ctx as never);
      await expect(
        caller.create({ subject: 'Help', body: 'Details' })
      ).resolves.toHaveProperty('id');

      // Let the fire-and-forget path settle, then confirm nothing was enqueued
      await new Promise((r) => setTimeout(r, 0));
      expect(mockSupportDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(sendBulkNotification).toHaveBeenCalled();
    });

    it('requires active organization', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = supportRouter.createCaller(ctx as never);

      await expect(
        caller.create({ subject: 'Help', body: 'Issue details' })
      ).rejects.toThrow('No active organization selected');
    });

    it('rejects with TOO_MANY_REQUESTS once the hourly create cap is hit', async () => {
      const ctx = createMockCtx();
      asMock(checkRateLimit).mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfterMs: 120_000,
      });

      const caller = supportRouter.createCaller(ctx as never);
      const err = await caller
        .create({ subject: 'Help', body: 'Issue details' })
        .catch((e: unknown) => e);

      expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect((err as Error).message).toContain('too many tickets');
      expect(checkRateLimit).toHaveBeenCalledWith(
        null,
        'rl:support:create:user-1',
        expect.objectContaining({ maxRequests: 10, windowMs: 60 * 60_000 })
      );
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it('lets a banned user open a ticket only when they have no open one', async () => {
      const ctx = createMockCtx({
        session: {
          user: {
            id: 'user-1',
            email: 'test@test.com',
            role: 'user',
            banned: true,
          },
        },
      });
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      // banned: open-ticket count, then staff lookup, then customer lookup
      setupSelectSequence(ctx.db, [[{ count: 0 }], STAFF_ROWS, [CUSTOMER_ROW]]);

      const caller = supportRouter.createCaller(ctx as never);
      await expect(
        caller.create({ subject: 'Appeal', body: 'Please review my ban' })
      ).resolves.toHaveProperty('id');
      expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    });

    it('rejects a banned user who already has an open ticket', async () => {
      const ctx = createMockCtx({
        session: {
          user: {
            id: 'user-1',
            email: 'test@test.com',
            role: 'user',
            banned: true,
          },
        },
      });
      setupSelectSequence(ctx.db, [[{ count: 1 }]]);

      const caller = supportRouter.createCaller(ctx as never);
      const err = await caller
        .create({ subject: 'Appeal again', body: 'Please review my ban' })
        .catch((e: unknown) => e);

      expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect((err as Error).message).toContain('already have an open ticket');
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it('does not run the open-ticket check for users in good standing', async () => {
      const ctx = createMockCtx();
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });
      // If the banned check ran, this first row would be read as a count and the
      // staff lookup would shift — proving it is skipped.
      setupSelectSequence(ctx.db, [STAFF_ROWS, [CUSTOMER_ROW]]);

      const caller = supportRouter.createCaller(ctx as never);
      await caller.create({ subject: 'Help', body: 'Details' });

      expect(sendBulkNotification).toHaveBeenCalledWith(
        ['admin-1', 'admin-2'],
        expect.anything()
      );
    });
  });

  // =========================================================================
  // reply
  // =========================================================================
  describe('reply', () => {
    it('adds message and sets status to awaiting_admin', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[MOCK_TICKET]]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.reply({
        ticketId: TICKET_UUID,
        body: 'Here is more info',
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.insert).toHaveBeenCalled();
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'awaiting_admin' })
      );
    });

    it('pings all staff in-app and emails the support inbox when the ticket is unassigned', async () => {
      const ctx = createMockCtx();
      // reply: ticket, last staff message (none), unanswered count, staff lookup, customer lookup
      setupSelectSequence(ctx.db, [
        [MOCK_TICKET],
        [],
        [{ count: 2 }],
        STAFF_ROWS,
        [CUSTOMER_ROW],
      ]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportRouter.createCaller(ctx as never);
      await caller.reply({ ticketId: TICKET_UUID, body: 'Still broken' });

      expect(sendNotification).not.toHaveBeenCalled();
      expect(sendBulkNotification).toHaveBeenCalledWith(
        ['admin-1', 'admin-2'],
        expect.objectContaining({
          title: 'Customer reply on ticket',
          actionUrl: `/dashboard/settings/support/${TICKET_UUID}`,
        })
      );
      await expectEmailEnqueued(
        'support@test.com',
        'support-ticket-reply',
        expect.objectContaining({
          subject: MOCK_TICKET.subject,
          customerEmail: 'test@test.com',
          preview: 'Still broken',
        }),
        'en'
      );
    });

    it('pings only the assignee in-app when the ticket is assigned', async () => {
      const ctx = createMockCtx();
      // reply: ticket, last staff message, unanswered count, customer lookup (no staff lookup)
      setupSelectSequence(ctx.db, [
        [{ ...MOCK_TICKET, assignedTo: ADMIN_UUID }],
        [{ createdAt: new Date('2026-01-16') }],
        [{ count: 1 }],
        [CUSTOMER_ROW],
      ]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportRouter.createCaller(ctx as never);
      await caller.reply({ ticketId: TICKET_UUID, body: 'Thanks' });

      expect(sendBulkNotification).not.toHaveBeenCalled();
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN_UUID,
          title: 'Customer reply on ticket',
        })
      );
      await expectEmailEnqueued(
        'support@test.com',
        'support-ticket-reply',
        expect.anything(),
        'en'
      );
    });

    it('rejects with TOO_MANY_REQUESTS once the unanswered-reply limit is reached', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [
        [MOCK_TICKET],
        [],
        [{ count: UNANSWERED_REPLY_LIMIT }],
      ]);

      const caller = supportRouter.createCaller(ctx as never);
      const err = await caller
        .reply({ ticketId: TICKET_UUID, body: 'Hello?' })
        .catch((e: unknown) => e);

      expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect((err as Error).message).toContain('reply limit');
      expect(ctx.db.insert).not.toHaveBeenCalled();
      expect(mockSupportDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
    });

    it('allows the reply when the customer is one message under the limit', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [
        [MOCK_TICKET],
        [],
        [{ count: UNANSWERED_REPLY_LIMIT - 1 }],
        STAFF_ROWS,
        [CUSTOMER_ROW],
      ]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportRouter.createCaller(ctx as never);
      await expect(
        caller.reply({ ticketId: TICKET_UUID, body: 'Last one' })
      ).resolves.toEqual({ success: true });
    });

    it('rejects reply to closed ticket', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[{ ...MOCK_TICKET, status: 'closed' }]]);

      const caller = supportRouter.createCaller(ctx as never);

      await expect(
        caller.reply({ ticketId: TICKET_UUID, body: 'Follow up' })
      ).rejects.toThrow('Cannot reply to a closed ticket');
    });

    it('throws NOT_FOUND for non-existent ticket', async () => {
      const ctx = createMockCtx();
      // Default: returns []

      const caller = supportRouter.createCaller(ctx as never);

      await expect(
        caller.reply({ ticketId: TICKET_UUID, body: 'Hello' })
      ).rejects.toThrow('Ticket not found');
    });
  });

  // =========================================================================
  // close
  // =========================================================================
  describe('close', () => {
    it('closes own ticket', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[MOCK_TICKET]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.close({ ticketId: TICKET_UUID });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'closed',
          closedAt: expect.any(Date),
        })
      );
    });

    it('throws NOT_FOUND for non-existent ticket', async () => {
      const ctx = createMockCtx();

      const caller = supportRouter.createCaller(ctx as never);

      await expect(caller.close({ ticketId: TICKET_UUID })).rejects.toThrow(
        'Ticket not found'
      );
    });
  });

  // =========================================================================
  // adminList
  // =========================================================================
  describe('adminList', () => {
    it('returns all tickets with filters', async () => {
      const ctx = createMockCtx();
      const tickets = [
        {
          id: 't-1',
          subject: 'Issue A',
          status: 'open',
          priority: 'high',
          assignedTo: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Promise.all: items + count
      setupSelectSequence(ctx.db, [tickets, [{ count: 1 }]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.adminList({
        status: 'open',
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        results: tickets,
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('returns empty results when no tickets match', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[], [{ count: 0 }]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.adminList({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        results: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
    });
  });

  // =========================================================================
  // adminReply
  // =========================================================================
  describe('adminReply', () => {
    it('adds staff message, sets status to awaiting_user, notifies creator in-app and by email', async () => {
      const ctx = createMockCtx();
      // adminReply: ticket, then customer lookup
      setupSelectSequence(ctx.db, [[MOCK_TICKET], [CUSTOMER_ROW]]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.adminReply({
        ticketId: TICKET_UUID,
        body: 'We are looking into this.',
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.insert).toHaveBeenCalled();
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'awaiting_user' })
      );

      // Notifies ticket creator
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_TICKET.userId,
          title: 'Staff reply on your ticket',
          body: expect.stringContaining(MOCK_TICKET.subject),
        })
      );

      // Emails the customer in their own language with a localized link
      await expectEmailEnqueued(
        'test@test.com',
        'support-ticket-answer',
        expect.objectContaining({
          name: 'Test User',
          subject: MOCK_TICKET.subject,
          preview: 'We are looking into this.',
          ticketUrl: expect.stringContaining(
            `/de/account/support/${TICKET_UUID}`
          ),
        }),
        'de'
      );
      // Never routes a customer email to the support inbox
      expect(mockSupportDeps.getSupportEmail).not.toHaveBeenCalled();
    });

    it('skips the customer email when the creator no longer exists', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[MOCK_TICKET], []]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportRouter.createCaller(ctx as never);
      await expect(
        caller.adminReply({ ticketId: TICKET_UUID, body: 'Reply' })
      ).resolves.toEqual({ success: true });

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSupportDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when ticket does not exist', async () => {
      const ctx = createMockCtx();

      const caller = supportRouter.createCaller(ctx as never);

      await expect(
        caller.adminReply({ ticketId: TICKET_UUID, body: 'Reply' })
      ).rejects.toThrow('Ticket not found');
    });
  });

  // =========================================================================
  // changeStatus
  // =========================================================================
  describe('changeStatus', () => {
    it('updates status and notifies creator', async () => {
      const ctx = createMockCtx();
      // changeStatus: update, then select to find ticket for notification
      setupSelectSequence(ctx.db, [
        [{ userId: 'user-1', subject: 'Cannot upload files' }],
      ]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.changeStatus({
        ticketId: TICKET_UUID,
        status: 'resolved',
      });

      expect(result).toEqual({ success: true });

      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'resolved',
          resolvedAt: expect.any(Date),
        })
      );

      // Creator was notified
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          title: 'Ticket resolved',
        })
      );
    });

    it('sets closedAt when status is closed', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[{ userId: 'user-1', subject: 'Issue' }]]);

      const caller = supportRouter.createCaller(ctx as never);
      await caller.changeStatus({
        ticketId: TICKET_UUID,
        status: 'closed',
      });

      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'closed',
          closedAt: expect.any(Date),
        })
      );
    });
  });

  // =========================================================================
  // assign
  // =========================================================================
  describe('assign', () => {
    it('updates assignedTo', async () => {
      const ctx = createMockCtx();
      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.assign({
        ticketId: TICKET_UUID,
        assignedTo: ADMIN_UUID,
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ assignedTo: ADMIN_UUID })
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'support.assign',
          entityType: 'ticket',
          entityId: TICKET_UUID,
          metadata: { assignedTo: ADMIN_UUID },
        })
      );
    });

    it('allows setting assignedTo to null', async () => {
      const ctx = createMockCtx();
      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.assign({
        ticketId: TICKET_UUID,
        assignedTo: null,
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ assignedTo: null })
      );
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================
  describe('getStats', () => {
    it('returns counts by status', async () => {
      const ctx = createMockCtx();
      const statusRows = [
        { status: 'open', count: 5 },
        { status: 'awaiting_admin', count: 3 },
        { status: 'closed', count: 10 },
      ];
      // getStats: select().from().groupBy() resolves to statusRows
      setupSelectSequence(ctx.db, [statusRows]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result).toEqual({
        total: 18,
        open: 5,
        awaiting_admin: 3,
        closed: 10,
      });
    });

    it('returns total=0 when no tickets exist', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result).toEqual({ total: 0 });
    });
  });
});
