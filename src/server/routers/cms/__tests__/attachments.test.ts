import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

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

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/core/storage', () => ({
  getStorage: vi.fn().mockReturnValue({
    url: vi.fn((filepath: string) => `https://cdn.example.com/${filepath}`),
  }),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('@/lib/constants', () => ({
  LOCALES: ['en'],
  DEFAULT_LOCALE: 'en',
}));

vi.mock('@/server/db/schema', () => ({
  cmsPostAttachments: {
    id: 'cms_post_attachments.id',
    postId: 'cms_post_attachments.post_id',
    filepath: 'cms_post_attachments.filepath',
    filename: 'cms_post_attachments.filename',
    fileType: 'cms_post_attachments.file_type',
    mimeType: 'cms_post_attachments.mime_type',
    fileSize: 'cms_post_attachments.file_size',
    altText: 'cms_post_attachments.alt_text',
    uploadedById: 'cms_post_attachments.uploaded_by_id',
    createdAt: 'cms_post_attachments.created_at',
    deletedAt: 'cms_post_attachments.deleted_at',
  },
  cmsPosts: {
    id: 'cms_posts.id',
  },
  user: {
    id: 'user.id',
    role: 'user.role',
  },
}));

vi.mock('@/server/lib/notifications', () => ({
  sendBulkNotification: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { cmsAttachmentsRouter } from '../attachments';
import { getStorage } from '@/core/storage';

// ---------------------------------------------------------------------------
// Custom mock DB for attachments (needs update().set().where().returning())
// ---------------------------------------------------------------------------

function createAttachmentsMockDb() {
  // ---- insert chain -------------------------------------------------------
  const insertReturningMock = vi.fn().mockResolvedValue([]);
  const insertValuesMock = vi.fn().mockReturnValue({ returning: insertReturningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  // ---- select chain -------------------------------------------------------
  const selectLimitMock = vi.fn().mockResolvedValue([]);
  const selectOrderByMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectWhereMock = vi.fn().mockReturnValue({
    orderBy: selectOrderByMock,
    limit: selectLimitMock,
  });
  const selectFromMock = vi.fn().mockReturnValue({
    where: selectWhereMock,
    orderBy: selectOrderByMock,
    limit: selectLimitMock,
  });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  // ---- update chain (with .returning()) -----------------------------------
  const updateReturningMock = vi.fn().mockResolvedValue([]);
  const updateWhereMock = vi.fn().mockReturnValue({ returning: updateReturningMock });
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  // ---- delete chain -------------------------------------------------------
  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  return {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    _chains: {
      select: {
        from: selectFromMock,
        where: selectWhereMock,
        orderBy: selectOrderByMock,
        limit: selectLimitMock,
      },
      insert: { values: insertValuesMock, returning: insertReturningMock },
      update: { set: updateSetMock, where: updateWhereMock, returning: updateReturningMock },
      delete: { where: deleteWhereMock },
    },
  };
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  const db = createAttachmentsMockDb();
  return {
    session: {
      user: { id: 'user-1', email: 'editor@test.com', role: 'editor' },
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

const POST_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const ATTACHMENT_ID = 'f1f1f1f1-a2a2-4b3b-8c4c-d5d5d5d5d5d5';

const MOCK_ATTACHMENT = {
  id: ATTACHMENT_ID,
  postId: POST_ID,
  filepath: 'uploads/2025/01/photo.jpg',
  filename: 'photo.jpg',
  fileType: 1,
  mimeType: 'image/jpeg',
  fileSize: 204800,
  altText: null,
  uploadedById: 'user-1',
  createdAt: new Date('2025-01-15'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cmsAttachmentsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // listAttachments
  // =========================================================================
  describe('listAttachments', () => {
    it('queries attachments for a post and resolves storage URLs', async () => {
      const ctx = createMockCtx();
      const items = [
        { ...MOCK_ATTACHMENT },
        { ...MOCK_ATTACHMENT, id: 'f2f2f2f2-a2a2-4b3b-8c4c-d5d5d5d5d5d5', filepath: 'uploads/2025/01/doc.pdf' },
      ];
      ctx.db._chains.select.limit.mockResolvedValue(items);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      const result = await caller.listAttachments({ postId: POST_ID });

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://cdn.example.com/uploads/2025/01/photo.jpg');
      expect(result[1].url).toBe('https://cdn.example.com/uploads/2025/01/doc.pdf');
      expect(ctx.db.select).toHaveBeenCalled();
      expect(getStorage).toHaveBeenCalled();
    });

    it('returns empty array when no attachments exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      const result = await caller.listAttachments({ postId: POST_ID });

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // addAttachment
  // =========================================================================
  describe('addAttachment', () => {
    const addInput = {
      postId: POST_ID,
      filepath: 'uploads/2025/01/photo.jpg',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 204800,
      fileType: 1,
    };

    it('inserts attachment record with correct values', async () => {
      const created = { ...MOCK_ATTACHMENT };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([created]);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      const result = await caller.addAttachment(addInput);

      expect(result).toEqual(created);
      expect(ctx.db.insert).toHaveBeenCalled();
      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: POST_ID,
          filepath: 'uploads/2025/01/photo.jpg',
          filename: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 204800,
          fileType: 1,
          uploadedById: 'user-1',
        })
      );
    });
  });

  // =========================================================================
  // updateAttachment
  // =========================================================================
  describe('updateAttachment', () => {
    it('updates altText and returns success', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.update.returning.mockResolvedValue([{ id: ATTACHMENT_ID }]);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      const result = await caller.updateAttachment({
        id: ATTACHMENT_ID,
        altText: 'A beautiful sunset',
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith({ altText: 'A beautiful sunset' });
    });

    it('throws NOT_FOUND when attachment does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.update.returning.mockResolvedValue([]);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      await expect(
        caller.updateAttachment({ id: ATTACHMENT_ID, altText: 'New alt' })
      ).rejects.toThrow('Attachment not found');
    });
  });

  // =========================================================================
  // deleteAttachment
  // =========================================================================
  describe('deleteAttachment', () => {
    it('soft-deletes the attachment and returns success', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.update.returning.mockResolvedValue([{ id: ATTACHMENT_ID }]);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      const result = await caller.deleteAttachment({ id: ATTACHMENT_ID });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) })
      );
    });

    it('throws NOT_FOUND when attachment does not exist or already deleted', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.update.returning.mockResolvedValue([]);

      const caller = cmsAttachmentsRouter.createCaller(ctx as never);
      await expect(
        caller.deleteAttachment({ id: ATTACHMENT_ID })
      ).rejects.toThrow('Attachment not found');
    });
  });
});
