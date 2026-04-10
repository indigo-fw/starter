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

vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockSupportDeps = {
  createTicketFromChat: vi.fn().mockResolvedValue({ ticketId: 'ticket-1' }),
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
  sendNotification: vi.fn(),
  sendOrgNotification: vi.fn(),
  broadcastEvent: vi.fn(),
  lookupUsers: vi.fn().mockResolvedValue(new Map([['user-1', { id: 'user-1', name: 'Test User', email: 'test@test.com' }]])),
  callAI: vi.fn().mockResolvedValue(null),
};
vi.mock('@/core-support/deps', () => ({
  getSupportDeps: () => mockSupportDeps,
  setSupportDeps: vi.fn(),
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

vi.mock('@/core-support/schema/support-chat', () => ({
  saasSupportChatSessions: {
    id: 'saas_support_chat_sessions.id',
    visitorId: 'saas_support_chat_sessions.visitor_id',
    userId: 'saas_support_chat_sessions.user_id',
    email: 'saas_support_chat_sessions.email',
    status: 'saas_support_chat_sessions.status',
    ticketId: 'saas_support_chat_sessions.ticket_id',
    subject: 'saas_support_chat_sessions.subject',
    metadata: 'saas_support_chat_sessions.metadata',
    createdAt: 'saas_support_chat_sessions.created_at',
    closedAt: 'saas_support_chat_sessions.closed_at',
  },
  saasSupportChatMessages: {
    id: 'saas_support_chat_messages.id',
    sessionId: 'saas_support_chat_messages.session_id',
    role: 'saas_support_chat_messages.role',
    body: 'saas_support_chat_messages.body',
    metadata: 'saas_support_chat_messages.metadata',
    createdAt: 'saas_support_chat_messages.created_at',
  },
}));

vi.mock('@/core-support/config', () => ({
  supportChatConfig: {
    systemPrompt: 'test',
    escalationMessage: 'Escalating...',
    maxMessagesBeforeEscalation: 20,
    model: undefined,
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { supportChatRouter } from '@/core-support/routers/support-chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thenable(data: unknown, chainMethods: Record<string, unknown> = {}) {
  return {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject),
    ...chainMethods,
  };
}

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

  const selectMock = vi.fn().mockImplementation(() => createSelectChain([]));

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  const executeMock = vi.fn().mockResolvedValue({ rows: [] });

  return {
    insert: insertMock,
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
    execute: executeMock,
    _chains: {
      insert: { values: insertValuesMock, returning: returningMock },
      update: { set: updateSetMock, where: updateWhereMock },
      delete: { where: deleteWhereMock },
    },
  };
}

function setupSelectSequence(db: ReturnType<typeof createMockDb>, sequence: unknown[]) {
  let callIdx = 0;
  db.select.mockImplementation(() => {
    const data = sequence[callIdx] ?? [];
    callIdx++;
    return createSelectChain(data);
  });
}

function createPublicCtx(overrides: Record<string, unknown> = {}) {
  return {
    session: null,
    db: createMockDb(),
    headers: new Headers(),
    activeOrganizationId: null,
    ...overrides,
  };
}

function createAdminCtx(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } },
    db: createMockDb(),
    headers: new Headers(),
    activeOrganizationId: 'org-1',
    ...overrides,
  };
}

const SESSION_UUID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const VISITOR_ID = 'visitor-abc-123';

const MOCK_SESSION = {
  id: SESSION_UUID,
  visitorId: VISITOR_ID,
  userId: null,
  email: null,
  status: 'ai_active',
  ticketId: null,
  subject: null,
  metadata: null,
  createdAt: new Date('2026-01-15'),
  closedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('supportChatRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // startSession
  // =========================================================================
  describe('startSession', () => {
    it('creates new session when none exists', async () => {
      const ctx = createPublicCtx();
      // First select: no existing session found
      setupSelectSequence(ctx.db, [[]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.startSession({ visitorId: VISITOR_ID });

      expect(result).toHaveProperty('id');
      expect(result.status).toBe('ai_active');
      expect(result.messages).toEqual([]);
      expect(result.resumed).toBe(false);
      // Should insert new session
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('resumes existing non-closed session', async () => {
      const ctx = createPublicCtx();
      const existingSession = {
        id: SESSION_UUID,
        status: 'ai_active',
        ticketId: null,
      };
      const existingMessages = [
        { id: 'msg-1', role: 'user', body: 'Hello', createdAt: new Date() },
        { id: 'msg-2', role: 'ai', body: 'Hi there!', createdAt: new Date() },
      ];

      // First select: existing session found; Second select: messages
      setupSelectSequence(ctx.db, [[existingSession], existingMessages]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.startSession({ visitorId: VISITOR_ID });

      expect(result.id).toBe(SESSION_UUID);
      expect(result.status).toBe('ai_active');
      expect(result.resumed).toBe(true);
      expect(result.messages).toEqual(existingMessages);
      // Should NOT insert (resuming, not creating)
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // sendMessage
  // =========================================================================
  describe('sendMessage', () => {
    it('stores user message and returns ID', async () => {
      const ctx = createPublicCtx();
      // First select: session found
      setupSelectSequence(ctx.db, [[MOCK_SESSION]]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.sendMessage({
        sessionId: SESSION_UUID,
        visitorId: VISITOR_ID,
        body: 'I need help',
      });

      expect(result).toHaveProperty('userMessageId');
      expect(typeof result.userMessageId).toBe('string');
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('rejects if session not found', async () => {
      const ctx = createPublicCtx();
      // Default: returns [] (no session)

      const caller = supportChatRouter.createCaller(ctx as never);

      await expect(
        caller.sendMessage({
          sessionId: SESSION_UUID,
          visitorId: VISITOR_ID,
          body: 'Hello',
        })
      ).rejects.toThrow('Chat session not found');
    });

    it('rejects if session is closed', async () => {
      const ctx = createPublicCtx();
      setupSelectSequence(ctx.db, [[{ ...MOCK_SESSION, status: 'closed' }]]);

      const caller = supportChatRouter.createCaller(ctx as never);

      await expect(
        caller.sendMessage({
          sessionId: SESSION_UUID,
          visitorId: VISITOR_ID,
          body: 'Follow up',
        })
      ).rejects.toThrow('Chat session is closed');
    });
  });

  // =========================================================================
  // close
  // =========================================================================
  describe('close', () => {
    it('closes session', async () => {
      const ctx = createPublicCtx();
      setupSelectSequence(ctx.db, [[{ id: SESSION_UUID }]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.close({
        sessionId: SESSION_UUID,
        visitorId: VISITOR_ID,
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'closed',
          closedAt: expect.any(Date),
        })
      );
    });

    it('rejects if wrong visitor', async () => {
      const ctx = createPublicCtx();
      // Default: returns [] (no session matching visitor)

      const caller = supportChatRouter.createCaller(ctx as never);

      await expect(
        caller.close({
          sessionId: SESSION_UUID,
          visitorId: 'wrong-visitor',
        })
      ).rejects.toThrow('Session not found');
    });
  });

  // =========================================================================
  // escalate
  // =========================================================================
  describe('escalate', () => {
    it('creates ticket for authenticated user', async () => {
      const ctx = createAdminCtx(); // has session.user
      // 1st select: session found, 2nd select: chat messages for transcript
      setupSelectSequence(ctx.db, [
        [MOCK_SESSION],
        [{ role: 'user', body: 'Help me', createdAt: new Date() }],
      ]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.escalate({
        sessionId: SESSION_UUID,
        visitorId: VISITOR_ID,
      });

      expect(result.ticketId).toBe('ticket-1');
      expect(result.emailCaptured).toBe(false);
      // Ticket creation delegated to injected deps
      expect(mockSupportDeps.createTicketFromChat).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          orgId: 'org-1',
          chatSessionId: SESSION_UUID,
        })
      );
      // Should update session to escalated
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('returns existing ticketId if already escalated', async () => {
      const ctx = createPublicCtx();
      const escalatedSession = { ...MOCK_SESSION, ticketId: 'existing-ticket-id' };
      setupSelectSequence(ctx.db, [[escalatedSession]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.escalate({
        sessionId: SESSION_UUID,
        visitorId: VISITOR_ID,
      });

      expect(result.ticketId).toBe('existing-ticket-id');
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it('throws BAD_REQUEST for anonymous user without email', async () => {
      const ctx = createPublicCtx(); // no session.user
      setupSelectSequence(ctx.db, [[MOCK_SESSION]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      await expect(
        caller.escalate({ sessionId: SESSION_UUID, visitorId: VISITOR_ID })
      ).rejects.toThrow('Email is required for anonymous escalation');
    });

    it('captures email for anonymous user', async () => {
      const ctx = createPublicCtx();
      setupSelectSequence(ctx.db, [[MOCK_SESSION]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.escalate({
        sessionId: SESSION_UUID,
        visitorId: VISITOR_ID,
        email: 'visitor@example.com',
      });

      expect(result.ticketId).toBeNull();
      expect(result.emailCaptured).toBe(true);
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('rejects if wrong visitorId', async () => {
      const ctx = createPublicCtx();
      // Default: returns [] (no session matching visitor)

      const caller = supportChatRouter.createCaller(ctx as never);
      await expect(
        caller.escalate({ sessionId: SESSION_UUID, visitorId: 'wrong-visitor' })
      ).rejects.toThrow('Session not found');
    });
  });

  // =========================================================================
  // setEmail
  // =========================================================================
  describe('setEmail', () => {
    it('stores email on session', async () => {
      const ctx = createPublicCtx();
      setupSelectSequence(ctx.db, [[{ id: SESSION_UUID }]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.setEmail({
        sessionId: SESSION_UUID,
        visitorId: VISITOR_ID,
        email: 'user@example.com',
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('rejects if wrong visitorId', async () => {
      const ctx = createPublicCtx();

      const caller = supportChatRouter.createCaller(ctx as never);
      await expect(
        caller.setEmail({
          sessionId: SESSION_UUID,
          visitorId: 'wrong-visitor',
          email: 'user@example.com',
        })
      ).rejects.toThrow('Session not found');
    });
  });

  // =========================================================================
  // adminList
  // =========================================================================
  describe('adminList', () => {
    it('returns paginated sessions', async () => {
      const ctx = createAdminCtx();
      const sessions = [
        {
          id: 's-1',
          visitorId: 'v-1',
          userId: null,
          status: 'ai_active',
          subject: null,
          ticketId: null,
          createdAt: new Date(),
        },
      ];

      // Promise.all: items + count, then user lookup (empty), then last messages (execute)
      setupSelectSequence(ctx.db, [sessions, [{ count: 1 }]]);

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.adminList({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        results: expect.arrayContaining([
          expect.objectContaining({ id: 's-1', status: 'ai_active' }),
        ]),
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });
  });

  // =========================================================================
  // adminReply
  // =========================================================================
  describe('adminReply', () => {
    it('stores agent message and transitions to agent_active', async () => {
      const ctx = createAdminCtx();
      setupSelectSequence(ctx.db, [[MOCK_SESSION]]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.adminReply({
        sessionId: SESSION_UUID,
        body: 'Let me help you with that.',
      });

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');

      // Insert agent message
      expect(ctx.db.insert).toHaveBeenCalled();

      // Transition to agent_active since session was ai_active
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'agent_active' })
      );

      // Notify user if they have userId (MOCK_SESSION has userId: null, so no notification)
    });

    it('notifies user if session has userId', async () => {
      const ctx = createAdminCtx();
      const sessionWithUser = { ...MOCK_SESSION, userId: 'user-1' };
      setupSelectSequence(ctx.db, [[sessionWithUser]]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = supportChatRouter.createCaller(ctx as never);
      await caller.adminReply({
        sessionId: SESSION_UUID,
        body: 'We are looking into this.',
      });

      expect(mockSupportDeps.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          title: 'New message from support',
        })
      );
    });

    it('throws NOT_FOUND when session does not exist', async () => {
      const ctx = createAdminCtx();
      // Default: returns []

      const caller = supportChatRouter.createCaller(ctx as never);

      await expect(
        caller.adminReply({ sessionId: SESSION_UUID, body: 'Reply' })
      ).rejects.toThrow('Session not found');
    });
  });

  // =========================================================================
  // adminClose
  // =========================================================================
  describe('adminClose', () => {
    it('closes session', async () => {
      const ctx = createAdminCtx();

      const caller = supportChatRouter.createCaller(ctx as never);
      const result = await caller.adminClose({ sessionId: SESSION_UUID });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'closed',
          closedAt: expect.any(Date),
        })
      );
    });
  });
});
