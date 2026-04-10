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
    url: vi.fn((path: string) => `/uploads/${path}`),
  }),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugifyFilename: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/crud/admin-crud', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, pageSize: 20, offset: 0 }),
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

vi.mock('@/server/db/schema', () => ({
  cmsMedia: {
    id: 'cms_media.id',
    filename: 'cms_media.filename',
    filepath: 'cms_media.filepath',
    fileType: 'cms_media.file_type',
    mimeType: 'cms_media.mime_type',
    fileSize: 'cms_media.file_size',
    altText: 'cms_media.alt_text',
    width: 'cms_media.width',
    height: 'cms_media.height',
    thumbnailPath: 'cms_media.thumbnail_path',
    mediumPath: 'cms_media.medium_path',
    blurDataUrl: 'cms_media.blur_data_url',
    uploadedById: 'cms_media.uploaded_by_id',
    createdAt: 'cms_media.created_at',
    deletedAt: 'cms_media.deleted_at',
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { mediaRouter } from '../media';
import { getStorage, type StorageProvider } from '@/core/storage';
import { slugifyFilename } from '@/core/lib/content/slug';
import { logAudit } from '@/core/lib/infra/audit';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { createMockCtx } from './test-helpers';

const MOCK_MEDIA = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  filename: 'photo.jpg',
  filepath: '2025/01/photo.jpg',
  fileType: 1, // FileType.IMAGE
  mimeType: 'image/jpeg',
  fileSize: 102400,
  altText: 'A test photo',
  width: 1920,
  height: 1080,
  thumbnailPath: '2025/01/photo-thumb.jpg',
  mediumPath: '2025/01/photo-medium.jpg',
  blurDataUrl: 'data:image/jpeg;base64,abc',
  uploadedById: 'user-1',
  createdAt: new Date('2025-01-01'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mediaRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // count
  // =========================================================================
  describe('count', () => {
    it('returns total count of non-deleted media files', async () => {
      const ctx = createMockCtx();
      // count query: select().from().where() → [{ count: 42 }]
      ctx.db._chains.select.where.mockResolvedValue([{ count: 42 }]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.count();

      expect(result).toEqual({ count: 42 });
      expect(ctx.db.select).toHaveBeenCalledOnce();
    });

    it('returns 0 when no media files exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.where.mockResolvedValue([{ count: 0 }]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.count();

      expect(result).toEqual({ count: 0 });
    });

    it('returns 0 when count row is missing', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.where.mockResolvedValue([]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.count();

      expect(result).toEqual({ count: 0 });
    });
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns paginated media with URLs added', async () => {
      const items = [MOCK_MEDIA, { ...MOCK_MEDIA, id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e6' }];

      asMock(parsePagination).mockReturnValue({ page: 1, pageSize: 20, offset: 0 });
      asMock(paginatedResult).mockReturnValue({
        results: items.map((i) => ({ ...i, url: `/uploads/${i.filepath}` })),
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      // list uses Promise.all with two concurrent selects:
      //   1) select().from().where().orderBy().offset().limit() → items
      //   2) select().from().where() → [{ count: N }]
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue(items);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 2 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn() };
      const ctx = createMockCtx({ db });

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.list({ page: 1, pageSize: 20 });

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
      // Each item should have a url property
      expect(result.results[0]).toHaveProperty('url');
      expect(getStorage).toHaveBeenCalled();
    });

    it('adds URL to each item using storage.url(filepath)', async () => {
      const item = { ...MOCK_MEDIA };
      const urlMock = vi.fn((path: string) => `https://cdn.example.com/${path}`);
      asMock(getStorage).mockReturnValue({ url: urlMock } as unknown as StorageProvider);

      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([item]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      asMock(paginatedResult).mockImplementation(
        (items: unknown[], total: number, page: number, pageSize: number) => ({
          results: items as typeof item[],
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        })
      );

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn() };
      const ctx = createMockCtx({ db });

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.list({});

      const firstItem = result.results[0] as typeof item & { url: string };
      expect(firstItem.url).toBe(`https://cdn.example.com/${item.filepath}`);
      expect(urlMock).toHaveBeenCalledWith(item.filepath);
    });

    it('calls parsePagination with the input', async () => {
      asMock(parsePagination).mockReturnValue({ page: 2, pageSize: 10, offset: 10 });

      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn() };
      const ctx = createMockCtx({ db });

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.list({ page: 2, pageSize: 10 });

      expect(parsePagination).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    });

    it('supports optional fileType filter', async () => {
      asMock(parsePagination).mockReturnValue({ page: 1, pageSize: 20, offset: 0 });

      let selectCallIndex = 0;

      const imageItems = [{ ...MOCK_MEDIA, fileType: 1 }];
      const itemsLimitMock = vi.fn().mockResolvedValue(imageItems);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      asMock(paginatedResult).mockImplementation(
        (items: unknown[], total: number, page: number, pageSize: number) => ({
          results: items as typeof imageItems,
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        })
      );

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn() };
      const ctx = createMockCtx({ db });

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.list({ fileType: 1 });

      // Should only return image results
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ fileType: 1 });
    });

    it('returns empty results when no media exists', async () => {
      asMock(parsePagination).mockReturnValue({ page: 1, pageSize: 20, offset: 0 });
      asMock(paginatedResult).mockReturnValue({
        results: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });

      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn() };
      const ctx = createMockCtx({ db });

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.list({});

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // =========================================================================
  // register
  // =========================================================================
  describe('register', () => {
    const registerInput = {
      filename: 'My Photo.JPG',
      filepath: '2025/01/my-photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 102400,
    };

    it('slugifies filename before inserting', async () => {
      asMock(slugifyFilename).mockReturnValue('my-photo.jpg');

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([{ ...MOCK_MEDIA, filename: 'my-photo.jpg' }]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register(registerInput);

      expect(slugifyFilename).toHaveBeenCalledWith('My Photo.JPG');
    });

    it('detects IMAGE file type for image/jpeg mime type', async () => {
      asMock(slugifyFilename).mockReturnValue('my-photo.jpg');

      const createdMedia = { ...MOCK_MEDIA, fileType: 1 };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.register(registerInput);

      expect(ctx.db.insert).toHaveBeenCalled();
      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 1 }) // FileType.IMAGE
      );
      expect(result).toMatchObject({ fileType: 1 });
    });

    it('detects IMAGE file type for image/png mime type', async () => {
      asMock(slugifyFilename).mockReturnValue('photo.png');

      const createdMedia = { ...MOCK_MEDIA, mimeType: 'image/png', fileType: 1 };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register({ ...registerInput, filename: 'photo.png', mimeType: 'image/png' });

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 1 })
      );
    });

    it('detects VIDEO file type for video/mp4 mime type', async () => {
      asMock(slugifyFilename).mockReturnValue('video.mp4');

      const createdMedia = { ...MOCK_MEDIA, mimeType: 'video/mp4', fileType: 2 };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register({ ...registerInput, filename: 'video.mp4', mimeType: 'video/mp4' });

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 2 }) // FileType.VIDEO
      );
    });

    it('detects DOCUMENT file type for application/pdf mime type', async () => {
      asMock(slugifyFilename).mockReturnValue('doc.pdf');

      const createdMedia = { ...MOCK_MEDIA, mimeType: 'application/pdf', fileType: 3 };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register({ ...registerInput, filename: 'doc.pdf', mimeType: 'application/pdf' });

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 3 }) // FileType.DOCUMENT
      );
    });

    it('detects DOCUMENT file type for text/plain mime type', async () => {
      asMock(slugifyFilename).mockReturnValue('readme.txt');

      const createdMedia = { ...MOCK_MEDIA, mimeType: 'text/plain', fileType: 3 };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register({ ...registerInput, filename: 'readme.txt', mimeType: 'text/plain' });

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 3 })
      );
    });

    it('detects OTHER file type for unknown mime type', async () => {
      asMock(slugifyFilename).mockReturnValue('archive.zip');

      const createdMedia = { ...MOCK_MEDIA, mimeType: 'application/zip', fileType: 4 };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register({ ...registerInput, filename: 'archive.zip', mimeType: 'application/zip' });

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 4 }) // FileType.OTHER
      );
    });

    it('sets uploadedById from session user', async () => {
      asMock(slugifyFilename).mockReturnValue('photo.jpg');

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_MEDIA]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register(registerInput);

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedById: 'user-1' })
      );
    });

    it('stores optional fields when provided', async () => {
      asMock(slugifyFilename).mockReturnValue('photo.jpg');

      const inputWithOptionals = {
        ...registerInput,
        altText: 'A beautiful photo',
        width: 1920,
        height: 1080,
        thumbnailPath: '2025/01/photo-thumb.jpg',
        mediumPath: '2025/01/photo-medium.jpg',
        blurDataUrl: 'data:image/jpeg;base64,abc',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_MEDIA]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register(inputWithOptionals);

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          altText: 'A beautiful photo',
          width: 1920,
          height: 1080,
          thumbnailPath: '2025/01/photo-thumb.jpg',
          mediumPath: '2025/01/photo-medium.jpg',
          blurDataUrl: 'data:image/jpeg;base64,abc',
        })
      );
    });

    it('sets optional fields to null when not provided', async () => {
      asMock(slugifyFilename).mockReturnValue('photo.jpg');

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_MEDIA]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register(registerInput);

      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          altText: null,
          width: null,
          height: null,
          thumbnailPath: null,
          mediumPath: null,
          blurDataUrl: null,
        })
      );
    });

    it('calls logAudit with media.upload action', async () => {
      asMock(slugifyFilename).mockReturnValue('my-photo.jpg');

      const createdMedia = { ...MOCK_MEDIA, filename: 'my-photo.jpg' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdMedia]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.register(registerInput);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'media.upload',
          entityType: 'media',
          entityId: createdMedia.id,
          entityTitle: 'my-photo.jpg',
        })
      );
    });

    it('returns the created media record', async () => {
      asMock(slugifyFilename).mockReturnValue('photo.jpg');

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_MEDIA]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.register(registerInput);

      expect(result).toMatchObject({
        id: MOCK_MEDIA.id,
        filename: MOCK_MEDIA.filename,
        filepath: MOCK_MEDIA.filepath,
      });
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe('delete', () => {
    it('soft-deletes an existing media file and returns success', async () => {
      const ctx = createMockCtx();
      // First select: find existing record
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEDIA]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: MOCK_MEDIA.id });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) })
      );
    });

    it('throws NOT_FOUND when media does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = mediaRouter.createCaller(ctx as never);

      await expect(
        caller.delete({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Media file not found');
    });

    it('does not call update when media is not found', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = mediaRouter.createCaller(ctx as never);

      await expect(
        caller.delete({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow();

      expect(ctx.db.update).not.toHaveBeenCalled();
    });

    it('calls logAudit with media.delete action after successful deletion', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEDIA]);

      const caller = mediaRouter.createCaller(ctx as never);
      await caller.delete({ id: MOCK_MEDIA.id });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'media.delete',
          entityType: 'media',
          entityId: MOCK_MEDIA.id,
          entityTitle: MOCK_MEDIA.filename,
        })
      );
    });

    it('does not call logAudit when media is not found', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = mediaRouter.createCaller(ctx as never);

      await expect(
        caller.delete({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow();

      expect(logAudit).not.toHaveBeenCalled();
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = mediaRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // getByIds
  // =========================================================================
  describe('getByIds', () => {
    it('returns empty array when ids array is empty', async () => {
      const ctx = createMockCtx();
      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [] });

      expect(result).toEqual([]);
      // DB should NOT be queried for empty input
      expect(ctx.db.select).not.toHaveBeenCalled();
    });

    it('returns media items with URLs for given IDs', async () => {
      const dbItems = [
        {
          id: MOCK_MEDIA.id,
          filepath: MOCK_MEDIA.filepath,
          altText: MOCK_MEDIA.altText,
          width: MOCK_MEDIA.width,
          height: MOCK_MEDIA.height,
          thumbnailPath: MOCK_MEDIA.thumbnailPath,
          mediumPath: MOCK_MEDIA.mediumPath,
          blurDataUrl: MOCK_MEDIA.blurDataUrl,
        },
      ];

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue(dbItems);

      asMock(getStorage).mockReturnValue({
        url: vi.fn((path: string) => `/uploads/${path}`),
      } as unknown as StorageProvider);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [MOCK_MEDIA.id] });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: MOCK_MEDIA.id,
        url: `/uploads/${MOCK_MEDIA.filepath}`,
        altText: MOCK_MEDIA.altText,
        width: MOCK_MEDIA.width,
        height: MOCK_MEDIA.height,
        blurDataUrl: MOCK_MEDIA.blurDataUrl,
      });
    });

    it('generates thumbnailUrl from thumbnailPath via storage.url', async () => {
      const dbItem = {
        id: MOCK_MEDIA.id,
        filepath: '2025/01/photo.jpg',
        altText: null,
        width: null,
        height: null,
        thumbnailPath: '2025/01/photo-thumb.jpg',
        mediumPath: null,
        blurDataUrl: null,
      };

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([dbItem]);

      const urlMock = vi.fn((path: string) => `/uploads/${path}`);
      asMock(getStorage).mockReturnValue({ url: urlMock } as unknown as StorageProvider);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [MOCK_MEDIA.id] });

      expect(result[0]?.thumbnailUrl).toBe('/uploads/2025/01/photo-thumb.jpg');
      expect(urlMock).toHaveBeenCalledWith('2025/01/photo-thumb.jpg');
    });

    it('sets thumbnailUrl to null when thumbnailPath is null', async () => {
      const dbItem = {
        id: MOCK_MEDIA.id,
        filepath: '2025/01/photo.jpg',
        altText: null,
        width: null,
        height: null,
        thumbnailPath: null,
        mediumPath: null,
        blurDataUrl: null,
      };

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([dbItem]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [MOCK_MEDIA.id] });

      expect(result[0]?.thumbnailUrl).toBeNull();
    });

    it('generates mediumUrl from mediumPath via storage.url', async () => {
      const dbItem = {
        id: MOCK_MEDIA.id,
        filepath: '2025/01/photo.jpg',
        altText: null,
        width: null,
        height: null,
        thumbnailPath: null,
        mediumPath: '2025/01/photo-medium.jpg',
        blurDataUrl: null,
      };

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([dbItem]);

      const urlMock = vi.fn((path: string) => `/uploads/${path}`);
      asMock(getStorage).mockReturnValue({ url: urlMock } as unknown as StorageProvider);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [MOCK_MEDIA.id] });

      expect(result[0]?.mediumUrl).toBe('/uploads/2025/01/photo-medium.jpg');
    });

    it('sets mediumUrl to null when mediumPath is null', async () => {
      const dbItem = {
        id: MOCK_MEDIA.id,
        filepath: '2025/01/photo.jpg',
        altText: null,
        width: null,
        height: null,
        thumbnailPath: null,
        mediumPath: null,
        blurDataUrl: null,
      };

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([dbItem]);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [MOCK_MEDIA.id] });

      expect(result[0]?.mediumUrl).toBeNull();
    });

    it('returns multiple items for multiple IDs', async () => {
      const id1 = 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5';
      const id2 = 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6';

      const dbItems = [
        { id: id1, filepath: 'img1.jpg', altText: null, width: null, height: null, thumbnailPath: null, mediumPath: null, blurDataUrl: null },
        { id: id2, filepath: 'img2.jpg', altText: null, width: null, height: null, thumbnailPath: null, mediumPath: null, blurDataUrl: null },
      ];

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue(dbItems);

      const caller = mediaRouter.createCaller(ctx as never);
      const result = await caller.getByIds({ ids: [id1, id2] });

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(id1);
      expect(result[1]?.id).toBe(id2);
    });

    it('rejects when ids array exceeds 50 items', async () => {
      const ids = Array.from({ length: 51 }, (_, i) =>
        `a${i.toString().padStart(7, '0')}-0000-4000-a000-000000000000`
      );

      const ctx = createMockCtx();
      const caller = mediaRouter.createCaller(ctx as never);

      await expect(caller.getByIds({ ids })).rejects.toThrow();
    });

    it('rejects when ids contain non-UUID values', async () => {
      const ctx = createMockCtx();
      const caller = mediaRouter.createCaller(ctx as never);

      await expect(
        caller.getByIds({ ids: ['not-a-uuid'] })
      ).rejects.toThrow();
    });
  });
});
