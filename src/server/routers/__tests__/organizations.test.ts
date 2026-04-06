import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
      createOrganization: vi.fn(),
      updateOrganization: vi.fn(),
      deleteOrganization: vi.fn(),
      setActiveOrganization: vi.fn(),
      createInvitation: vi.fn(),
      getFullOrganization: vi.fn(),
      removeMember: vi.fn(),
      acceptInvitation: vi.fn(),
      cancelInvitation: vi.fn(),
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
  sendBulkNotification: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    BETTER_AUTH_SECRET: 'test-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPL_API_KEY: '',
  },
}));

vi.mock('@/core-subscriptions/lib/feature-gate', () => ({
  requireFeature: vi.fn().mockResolvedValue(undefined),
  checkFeature: vi.fn().mockResolvedValue({ allowed: true, limit: 100 }),
  setPlanResolver: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { organizationsRouter } from '../organizations';
import { auth } from '@/lib/auth';
import { logAudit } from '@/core/lib/audit';
import { sendNotification, sendBulkNotification } from '@/server/lib/notifications';

// Typed access to nested mock functions — vi.mocked() cannot traverse nested
// property access on mocked module objects, so we cast directly.
const mockCreateOrganization = auth.api.createOrganization as unknown as Mock;
const mockUpdateOrganization = auth.api.updateOrganization as unknown as Mock;
const mockDeleteOrganization = auth.api.deleteOrganization as unknown as Mock;
const mockSetActiveOrganization = auth.api.setActiveOrganization as unknown as Mock;
const mockCreateInvitation = auth.api.createInvitation as unknown as Mock;
const mockGetFullOrganization = auth.api.getFullOrganization as unknown as Mock;
const mockRemoveMember = auth.api.removeMember as unknown as Mock;
const mockAcceptInvitation = auth.api.acceptInvitation as unknown as Mock;
const mockCancelInvitation = auth.api.cancelInvitation as unknown as Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock DB that mirrors every Drizzle query builder pattern
 * used in the organizations router:
 *
 *  `list`:
 *    select().from().innerJoin().where().orderBy().limit()
 *
 *  `get` (member + org), `listMembers` (member check), `listInvitations` (member check),
 *  `acceptInvitation` (admin members):
 *    select().from().where().limit()
 *
 *  `listInvitations` (invitations query):
 *    select().from().where().orderBy().limit()
 *
 *  `removeMember` (member+org join), `acceptInvitation` (inv+org join):
 *    select().from().innerJoin().where().limit()
 *
 * All query chains converge on a single shared `limitMock` terminal which
 * defaults to resolving with []. Tests sequence results with
 * `mockResolvedValueOnce` on `_chains.select.limit`.
 */
function createMockDb() {
  // Single shared terminal mock — every query chain ends here.
  // Tests override per-call results using mockResolvedValueOnce.
  const limitMock = vi.fn().mockResolvedValue([]);

  // orderBy().limit()
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });

  // after innerJoin().where():  .orderBy().limit()  OR  .limit()
  const innerJoinWhereMock = vi.fn().mockReturnValue({
    orderBy: orderByMock,
    limit: limitMock,
  });

  // from().innerJoin().where()
  const innerJoinMock = vi.fn().mockReturnValue({
    where: innerJoinWhereMock,
  });

  // from().where():  .orderBy().limit()  OR  .limit()
  const whereMock = vi.fn().mockReturnValue({
    orderBy: orderByMock,
    limit: limitMock,
  });

  // select().from():  .where()  OR  .innerJoin()
  const fromMock = vi.fn().mockReturnValue({
    where: whereMock,
    innerJoin: innerJoinMock,
  });

  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  // update chain: update().set().where()
  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  // delete chain: delete().where()
  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  return {
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
    _chains: {
      select: {
        from: fromMock,
        where: whereMock,
        innerJoin: innerJoinMock,
        innerJoinWhere: innerJoinWhereMock,
        orderBy: orderByMock,
        // The single shared terminal. Use .mockResolvedValueOnce() per call to
        // sequence results across multiple sequential selects in one procedure.
        limit: limitMock,
      },
      update: { set: updateSetMock, where: updateWhereMock },
      delete: { where: deleteWhereMock },
    },
  };
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  const db = createMockDb();
  return {
    session: {
      user: { id: 'user-1', email: 'user@test.com', role: 'user' },
    },
    db,
    headers: new Headers(),
    activeOrganizationId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ORG = {
  id: 'org-1',
  name: 'Test Organization',
  slug: 'test-org',
  logo: null,
  metadata: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: null,
};

const MOCK_MEMBER = {
  id: 'mem-1',
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'member',
  createdAt: new Date('2025-01-01'),
};

const MOCK_INVITATION = {
  id: 'inv-1',
  organizationId: 'org-1',
  email: 'invited@test.com',
  role: 'member',
  status: 'pending',
  inviterId: 'user-1',
  expiresAt: new Date('2099-01-01'),
  createdAt: new Date('2025-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('organizationsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns the organizations the current user belongs to', async () => {
      const memberships = [
        { orgId: 'org-1', role: 'owner', orgName: 'Test Org', orgSlug: 'test-org', orgLogo: null },
        { orgId: 'org-2', role: 'member', orgName: 'Other Org', orgSlug: 'other-org', orgLogo: null },
      ];

      const ctx = createMockCtx();
      // list: select().from().innerJoin().where().orderBy().limit()
      ctx.db._chains.select.limit.mockResolvedValue(memberships);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.list();

      expect(result).toEqual(memberships);
      expect(ctx.db.select).toHaveBeenCalled();
    });

    it('returns an empty array when user is not a member of any organization', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.list();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns the organization with the member role attached', async () => {
      const ctx = createMockCtx();

      // get fires two sequential selects — use mockResolvedValueOnce to sequence them.
      // Both end with .limit(), so we override the shared limit mock once per call.
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([MOCK_MEMBER]) // first select: member lookup
        .mockResolvedValueOnce([MOCK_ORG]);   // second select: org lookup

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: 'org-1' });

      expect(result.id).toBe('org-1');
      expect(result.name).toBe('Test Organization');
      expect(result.memberRole).toBe('member');
    });

    it('throws NOT_FOUND when user is not a member of the organization', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(caller.get({ id: 'nonexistent-org' })).rejects.toThrow('Organization not found');
    });

    it('includes the member role from the membership record', async () => {
      const adminMember = { ...MOCK_MEMBER, role: 'admin' };

      const ctx = createMockCtx();
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([adminMember])
        .mockResolvedValueOnce([MOCK_ORG]);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: 'org-1' });

      expect(result.memberRole).toBe('admin');
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('creates an organization via Better Auth and returns the result', async () => {
      const createdOrg = { id: 'org-new', name: 'New Org', slug: 'new-org' };
      mockCreateOrganization.mockResolvedValue(createdOrg);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.create({ name: 'New Org', slug: 'new-org' });

      expect(result).toEqual(createdOrg);
      expect(auth.api.createOrganization).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: { name: 'New Org', slug: 'new-org' },
      });
    });

    it('calls logAudit after creating the organization', async () => {
      const createdOrg = { id: 'org-audit-test', name: 'Audit Org', slug: 'audit-org' };
      mockCreateOrganization.mockResolvedValue(createdOrg);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.create({ name: 'Audit Org', slug: 'audit-org' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'organization.create',
          entityType: 'organization',
          entityId: 'org-audit-test',
          metadata: { name: 'Audit Org' },
        })
      );
    });

    it('rejects slugs with uppercase characters', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(
        caller.create({ name: 'Bad Org', slug: 'Bad-Org' })
      ).rejects.toThrow();
    });

    it('rejects slugs with spaces', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(
        caller.create({ name: 'Bad Org', slug: 'bad org' })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('updates the organization via Better Auth and returns the result', async () => {
      const updatedOrg = { ...MOCK_ORG, name: 'Updated Name' };
      mockUpdateOrganization.mockResolvedValue(updatedOrg);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.update({ id: 'org-1', name: 'Updated Name' });

      expect(result).toEqual(updatedOrg);
      expect(auth.api.updateOrganization).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: {
          organizationId: 'org-1',
          data: { name: 'Updated Name', logo: undefined },
        },
      });
    });

    it('calls logAudit after updating the organization', async () => {
      mockUpdateOrganization.mockResolvedValue(MOCK_ORG);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.update({ id: 'org-1', name: 'Updated' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'organization.update',
          entityType: 'organization',
          entityId: 'org-1',
        })
      );
    });

    it('updates the logo when provided', async () => {
      mockUpdateOrganization.mockResolvedValue(MOCK_ORG);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.update({ id: 'org-1', logo: 'https://example.com/logo.png' });

      expect(auth.api.updateOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            data: expect.objectContaining({ logo: 'https://example.com/logo.png' }),
          }),
        })
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe('delete', () => {
    it('deletes the organization via Better Auth and returns success', async () => {
      mockDeleteOrganization.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: 'org-1' });

      expect(result).toEqual({ success: true });
      expect(auth.api.deleteOrganization).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: { organizationId: 'org-1' },
      });
    });

    it('calls logAudit after deleting the organization', async () => {
      mockDeleteOrganization.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.delete({ id: 'org-1' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'organization.delete',
          entityType: 'organization',
          entityId: 'org-1',
        })
      );
    });

    it('rejects an empty id', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: '' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // setActive
  // =========================================================================
  describe('setActive', () => {
    it('sets the active organization and returns success', async () => {
      mockSetActiveOrganization.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.setActive({ organizationId: 'org-1' });

      expect(result).toEqual({ success: true });
      expect(auth.api.setActiveOrganization).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: { organizationId: 'org-1' },
      });
    });

    it('accepts null to clear the active organization', async () => {
      mockSetActiveOrganization.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.setActive({ organizationId: null });

      expect(result).toEqual({ success: true });
      expect(auth.api.setActiveOrganization).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: { organizationId: null },
      });
    });
  });

  // =========================================================================
  // inviteMember
  // =========================================================================
  describe('inviteMember', () => {
    it('creates an invitation via Better Auth and returns the result', async () => {
      const createdInvitation = { ...MOCK_INVITATION };
      mockCreateInvitation.mockResolvedValue(createdInvitation);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.inviteMember({
        organizationId: 'org-1',
        email: 'invited@test.com',
        role: 'member',
      });

      expect(result).toEqual(createdInvitation);
      expect(auth.api.createInvitation).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: {
          organizationId: 'org-1',
          email: 'invited@test.com',
          role: 'member',
        },
      });
    });

    it('defaults to member role when role is not specified', async () => {
      mockCreateInvitation.mockResolvedValue(MOCK_INVITATION);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.inviteMember({
        organizationId: 'org-1',
        email: 'invited@test.com',
      });

      expect(auth.api.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ role: 'member' }),
        })
      );
    });

    it('calls logAudit after sending an invitation', async () => {
      mockCreateInvitation.mockResolvedValue(MOCK_INVITATION);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.inviteMember({
        organizationId: 'org-1',
        email: 'invited@test.com',
        role: 'admin',
      });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'organization.invite',
          entityType: 'organization',
          entityId: 'org-1',
          metadata: { email: 'invited@test.com', role: 'admin' },
        })
      );
    });

    it('rejects an invalid email address', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(
        caller.inviteMember({ organizationId: 'org-1', email: 'not-an-email' })
      ).rejects.toThrow();
    });

    it('rejects a role other than admin or member', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(
        caller.inviteMember({
          organizationId: 'org-1',
          email: 'invited@test.com',
          role: 'owner' as never,
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // listMembers
  // =========================================================================
  describe('listMembers', () => {
    it('returns full organization data when caller is a member', async () => {
      const fullOrg = { ...MOCK_ORG, members: [MOCK_MEMBER] };
      mockGetFullOrganization.mockResolvedValue(fullOrg);

      const ctx = createMockCtx();
      // listMembers: first select is select().from().where().limit() for the membership check
      ctx.db._chains.select.limit.mockResolvedValueOnce([MOCK_MEMBER]);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.listMembers({ organizationId: 'org-1' });

      expect(result).toEqual(fullOrg);
      expect(auth.api.getFullOrganization).toHaveBeenCalledWith({
        headers: ctx.headers,
        query: { organizationId: 'org-1' },
      });
    });

    it('throws FORBIDDEN when caller is not a member of the organization', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(
        caller.listMembers({ organizationId: 'org-not-member' })
      ).rejects.toThrow('Not a member');
    });

    it('does not call getFullOrganization when membership check fails', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(caller.listMembers({ organizationId: 'org-1' })).rejects.toThrow();
      expect(auth.api.getFullOrganization).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // removeMember
  // =========================================================================
  describe('removeMember', () => {
    it('removes a member and returns success', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      // removeMember: select().from().innerJoin().where().limit() — terminal is limitMock
      ctx.db._chains.select.limit.mockResolvedValueOnce([
        { userId: 'user-2', orgName: 'Test Organization' },
      ]);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.removeMember({
        organizationId: 'org-1',
        memberId: 'mem-2',
      });

      expect(result).toEqual({ success: true });
      expect(auth.api.removeMember).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: {
          organizationId: 'org-1',
          memberIdOrEmail: 'mem-2',
        },
      });
    });

    it('calls logAudit after removing a member', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([
        { userId: 'user-2', orgName: 'Test Org' },
      ]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.removeMember({ organizationId: 'org-1', memberId: 'mem-2' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'organization.removeMember',
          entityType: 'organization',
          entityId: 'org-1',
          metadata: { memberId: 'mem-2' },
        })
      );
    });

    it('sends a notification to the removed member when the member record is found', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([
        { userId: 'user-2', orgName: 'Test Organization' },
      ]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.removeMember({ organizationId: 'org-1', memberId: 'mem-2' });

      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          title: 'Removed from organization',
          body: expect.stringContaining('Test Organization'),
          orgId: 'org-1',
        })
      );
    });

    it('skips the notification when the member record is not found before removal', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.removeMember({ organizationId: 'org-1', memberId: 'mem-ghost' });

      expect(sendNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // leave
  // =========================================================================
  describe('leave', () => {
    it('removes the current user from the organization and returns success', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.leave({ organizationId: 'org-1' });

      expect(result).toEqual({ success: true });
      expect(auth.api.removeMember).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: {
          organizationId: 'org-1',
          memberIdOrEmail: 'user-1',
        },
      });
    });

    it('uses the session user id (not a member id) when calling removeMember', async () => {
      mockRemoveMember.mockResolvedValue(undefined);

      const ctx = createMockCtx({
        session: { user: { id: 'user-999', email: 'other@test.com', role: 'user' } },
      });
      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.leave({ organizationId: 'org-1' });

      expect(auth.api.removeMember).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ memberIdOrEmail: 'user-999' }),
        })
      );
    });
  });

  // =========================================================================
  // listInvitations
  // =========================================================================
  describe('listInvitations', () => {
    it('returns pending invitations when caller is a member', async () => {
      const ctx = createMockCtx();

      // listInvitations fires two sequential selects:
      //   1) select().from().where().limit()           — membership check
      //   2) select().from().where().orderBy().limit() — invitations list
      // Both chains end at limitMock, so we sequence mockResolvedValueOnce.
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([MOCK_MEMBER])       // membership check
        .mockResolvedValueOnce([MOCK_INVITATION]);  // invitations list

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.listInvitations({ organizationId: 'org-1' });

      expect(result).toEqual([MOCK_INVITATION]);
    });

    it('returns an empty array when there are no pending invitations', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([MOCK_MEMBER])
        .mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.listInvitations({ organizationId: 'org-1' });

      expect(result).toEqual([]);
    });

    it('throws FORBIDDEN when caller is not a member', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(
        caller.listInvitations({ organizationId: 'org-no-access' })
      ).rejects.toThrow('Not a member');
    });

    it('does not query invitations when membership check fails', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(caller.listInvitations({ organizationId: 'org-1' })).rejects.toThrow();
      // Only one DB select call should have been made (the membership check)
      expect(ctx.db.select).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // cancelInvitation
  // =========================================================================
  describe('cancelInvitation', () => {
    it('cancels the invitation via Better Auth and returns success', async () => {
      mockCancelInvitation.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.cancelInvitation({ invitationId: 'inv-1' });

      expect(result).toEqual({ success: true });
      expect(auth.api.cancelInvitation).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: { invitationId: 'inv-1' },
      });
    });

    it('rejects an empty invitationId', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(caller.cancelInvitation({ invitationId: '' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // acceptInvitation
  // =========================================================================
  describe('acceptInvitation', () => {
    it('accepts the invitation and returns success', async () => {
      mockAcceptInvitation.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      // acceptInvitation fires two sequential selects, both end at limitMock:
      //   1) select().from().innerJoin().where().limit()  — inv+org lookup
      //   2) select().from().where().limit()              — admin members lookup
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([{ organizationId: 'org-1', orgName: 'Test Organization' }])
        .mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);
      const result = await caller.acceptInvitation({ invitationId: 'inv-1' });

      expect(result).toEqual({ success: true });
      expect(auth.api.acceptInvitation).toHaveBeenCalledWith({
        headers: ctx.headers,
        body: { invitationId: 'inv-1' },
      });
    });

    it('notifies org admins and owners (excluding the accepting user) when invitation is accepted', async () => {
      mockAcceptInvitation.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      // Two admins: current user (excluded) + another admin (notified)
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([{ organizationId: 'org-1', orgName: 'My Org' }])
        .mockResolvedValueOnce([{ userId: 'user-1' }, { userId: 'admin-2' }]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.acceptInvitation({ invitationId: 'inv-1' });

      expect(sendBulkNotification).toHaveBeenCalledWith(
        ['admin-2'],
        expect.objectContaining({
          title: 'New member joined',
          body: expect.stringContaining('My Org'),
          orgId: 'org-1',
        })
      );
    });

    it('does not send notifications when all admins are the accepting user themselves', async () => {
      mockAcceptInvitation.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      // Only the current user is an admin — filtered out, list becomes empty
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([{ organizationId: 'org-1', orgName: 'Solo Org' }])
        .mockResolvedValueOnce([{ userId: 'user-1' }]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.acceptInvitation({ invitationId: 'inv-1' });

      expect(sendBulkNotification).not.toHaveBeenCalled();
    });

    it('does not send notifications when no invitation record is found before accepting', async () => {
      mockAcceptInvitation.mockResolvedValue(undefined);

      const ctx = createMockCtx();
      // inv+org lookup (innerJoin path) returns nothing — uses limitMock terminal
      ctx.db._chains.select.limit.mockResolvedValueOnce([]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.acceptInvitation({ invitationId: 'inv-ghost' });

      expect(sendBulkNotification).not.toHaveBeenCalled();
    });

    it('includes the user email in the notification body', async () => {
      mockAcceptInvitation.mockResolvedValue(undefined);

      const ctx = createMockCtx({
        session: { user: { id: 'user-1', email: 'joiner@test.com', role: 'user' } },
      });
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([{ organizationId: 'org-1', orgName: 'Great Org' }])
        .mockResolvedValueOnce([{ userId: 'admin-99' }]);

      const caller = organizationsRouter.createCaller(ctx as never);
      await caller.acceptInvitation({ invitationId: 'inv-1' });

      expect(sendBulkNotification).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          body: expect.stringContaining('joiner@test.com'),
        })
      );
    });

    it('rejects an empty invitationId', async () => {
      const ctx = createMockCtx();
      const caller = organizationsRouter.createCaller(ctx as never);

      await expect(caller.acceptInvitation({ invitationId: '' })).rejects.toThrow();
    });
  });
});
