import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/core/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendNotification: vi.fn(),
  sendOrgNotification: vi.fn(),
}));

vi.mock('@/core/types/notifications', () => ({
  NotificationType: { INFO: 'info', SUCCESS: 'success', WARNING: 'warning', ERROR: 'error' },
  NotificationCategory: { BILLING: 'billing', ORGANIZATION: 'organization', CONTENT: 'content', SYSTEM: 'system', SECURITY: 'security' },
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
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }),
  paginatedResult: vi.fn().mockImplementation(
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { supportRouter } from '@/core-support/routers/support';
import { logAudit } from '@/core/lib/audit';
import { sendNotification, sendOrgNotification } from '@/server/lib/notifications';
import { resolveOrgId } from '@/server/lib/resolve-org';

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
  const offsetMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock }));
  const orderByMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock, offset: offsetMock }));
  const groupByMock = vi.fn().mockReturnValue(thenable(data, { orderBy: orderByMock }));
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
  const insertValuesMock = vi.fn().mockReturnValue({ returning: returningMock });
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
function setupSelectSequence(db: ReturnType<typeof createMockDb>, sequence: unknown[]) {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('supportRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(resolveOrgId).mockImplementation(async (activeOrgId: string | null) => {
      if (activeOrgId) return activeOrgId;
      throw new Error('No active organization selected');
    });
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns paginated tickets for user\'s org', async () => {
      const ctx = createMockCtx();
      const tickets = [
        { id: 't-1', subject: 'Issue A', status: 'open', priority: 'normal', createdAt: new Date(), updatedAt: new Date() },
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
    it('inserts ticket + initial message and sends notification', async () => {
      const ctx = createMockCtx();
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

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
          metadata: expect.objectContaining({ subject: 'Need help', priority: 'high' }),
        })
      );

      // sendOrgNotification was called
      expect(sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          title: 'New support ticket',
          body: expect.stringContaining('Need help'),
        })
      );
    });

    it('requires active organization', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = supportRouter.createCaller(ctx as never);

      await expect(
        caller.create({ subject: 'Help', body: 'Issue details' })
      ).rejects.toThrow('No active organization selected');
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

      await expect(
        caller.close({ ticketId: TICKET_UUID })
      ).rejects.toThrow('Ticket not found');
    });
  });

  // =========================================================================
  // adminList
  // =========================================================================
  describe('adminList', () => {
    it('returns all tickets with filters', async () => {
      const ctx = createMockCtx();
      const tickets = [
        { id: 't-1', subject: 'Issue A', status: 'open', priority: 'high', assignedTo: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      // Promise.all: items + count
      setupSelectSequence(ctx.db, [tickets, [{ count: 1 }]]);

      const caller = supportRouter.createCaller(ctx as never);
      const result = await caller.adminList({ status: 'open', page: 1, pageSize: 20 });

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
    it('adds staff message, sets status to awaiting_user, notifies creator', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[MOCK_TICKET]]);
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
      setupSelectSequence(ctx.db, [[{ userId: 'user-1', subject: 'Cannot upload files' }]]);

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
