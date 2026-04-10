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

vi.mock('@/core/crud/admin-crud', () => ({
  buildAdminList: vi.fn().mockResolvedValue({
    results: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  }),
  buildStatusCounts: vi.fn().mockResolvedValue({
    all: 0,
    published: 0,
    draft: 0,
    scheduled: 0,
    trashed: 0,
  }),
  ensureSlugUnique: vi.fn().mockResolvedValue(undefined),
  softDelete: vi.fn().mockResolvedValue(undefined),
  softRestore: vi.fn().mockResolvedValue(undefined),
  permanentDelete: vi.fn().mockResolvedValue(undefined),
  fetchOrNotFound: vi.fn(),
  updateContentStatus: vi.fn().mockResolvedValue(undefined),
  generateCopySlug: vi.fn().mockResolvedValue('slug-copy'),
  getTranslationSiblings: vi.fn().mockResolvedValue([]),
  serializeExport: vi.fn().mockReturnValue({ data: '[]', contentType: 'application/json' }),
  prepareTranslationCopy: vi.fn().mockResolvedValue({ slug: 'slug-en', translationGroup: 'group-1', previewToken: 'tok' }),
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 100;
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

vi.mock('@/core/crud/taxonomy-helpers', () => ({
  syncTermRelationships: vi.fn().mockResolvedValue(undefined),
  getTermRelationships: vi.fn().mockResolvedValue([]),
  deleteAllTermRelationships: vi.fn().mockResolvedValue(undefined),
  deleteTermRelationshipsByTerm: vi.fn().mockResolvedValue(undefined),
  resolveTagsForPosts: vi.fn().mockImplementation((_db: unknown, items: Record<string, unknown>[]) =>
    items.map((item) => ({ ...item, tags: [] }))
  ),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: vi.fn().mockImplementation((name: string) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  ),
}));

vi.mock('@/server/db/schema', () => ({
  cmsTerms: {
    id: 'cms_terms.id',
    taxonomyId: 'cms_terms.taxonomy_id',
    name: 'cms_terms.name',
    slug: 'cms_terms.slug',
    lang: 'cms_terms.lang',
    status: 'cms_terms.status',
    order: 'cms_terms.order',
    createdAt: 'cms_terms.created_at',
    updatedAt: 'cms_terms.updated_at',
    deletedAt: 'cms_terms.deleted_at',
  },
  cmsTermRelationships: {
    objectId: 'cms_term_relationships.object_id',
    termId: 'cms_term_relationships.term_id',
    taxonomyId: 'cms_term_relationships.taxonomy_id',
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
import { tagsRouter } from '../tags';
import {
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
  fetchOrNotFound,
} from '@/core/crud/admin-crud';
import { deleteTermRelationshipsByTerm } from '@/core/crud/taxonomy-helpers';
import { logAudit } from '@/core/lib/infra/audit';
import { slugify } from '@/core/lib/content/slug';
import { createMockCtx } from './test-helpers';

const MOCK_TAG = {
  id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
  taxonomyId: 'tag',
  name: 'Next.js',
  slug: 'nextjs',
  lang: 'en',
  status: 1,
  order: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tagsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // counts
  // =========================================================================
  describe('counts', () => {
    it('returns status counts', async () => {
      const mockCounts = { all: 10, published: 7, draft: 2, scheduled: 0, trash: 1 };
      asMock(buildStatusCounts).mockResolvedValue(mockCounts);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.counts();

      expect(result).toEqual(mockCounts);
      expect(buildStatusCounts).toHaveBeenCalledOnce();
    });

    it('passes the cmsTerms table to buildStatusCounts', async () => {
      asMock(buildStatusCounts).mockResolvedValue({
        all: 0,
        published: 0,
        draft: 0,
        scheduled: 0,
        trash: 0,
      });

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.counts();

      expect(buildStatusCounts).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        expect.anything()
      );
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns the tag when found', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: MOCK_TAG.id });

      expect(result).toEqual(MOCK_TAG);
      expect(result.name).toBe('Next.js');
      expect(result.slug).toBe('nextjs');
      expect(fetchOrNotFound).toHaveBeenCalledWith(
        ctx.db, expect.anything(), MOCK_TAG.id, 'Tag', expect.anything()
      );
    });

    it('throws NOT_FOUND when tag does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' })
      );

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(
        caller.get({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Tag not found');
    });

    it('rejects a non-UUID id', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(caller.get({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    it('creates a tag and returns it', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.create({ name: 'Next.js', lang: 'en' });

      expect(result).toEqual(MOCK_TAG);
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('slugifies the name when no slug is provided', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      await caller.create({ name: 'Next.js', lang: 'en' });

      expect(slugify).toHaveBeenCalledWith('Next.js');
    });

    it('uses the provided slug instead of slugifying the name', async () => {
      const customSlug = 'my-custom-slug';
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([{ ...MOCK_TAG, slug: customSlug }]);

      const caller = tagsRouter.createCaller(ctx as never);
      await caller.create({ name: 'Next.js', slug: customSlug, lang: 'en' });

      // slugify should NOT be called when an explicit slug is provided
      expect(slugify).not.toHaveBeenCalled();
    });

    it('calls ensureSlugUnique before inserting', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      await caller.create({ name: 'Next.js', lang: 'en' });

      expect(ensureSlugUnique).toHaveBeenCalledOnce();
      expect(ensureSlugUnique).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({
          table: expect.anything(),
          slug: expect.any(String),
        }),
        'Tag'
      );
    });

    it('calls logAudit after successful creation', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      await caller.create({ name: 'Next.js', lang: 'en' });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.create',
          entityType: 'tag',
          entityId: MOCK_TAG.id,
          entityTitle: 'Next.js',
        })
      );
    });

    it('defaults lang to "en" and status to published', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      await caller.create({ name: 'Next.js' });

      // insert was called with default values
      expect(ctx.db.insert).toHaveBeenCalled();
      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({ lang: 'en', status: 1 })
      );
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('updates the tag and returns success', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.update({ id: MOCK_TAG.id, name: 'Updated Tag' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when tag does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' })
      );

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(
        caller.update({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4', name: 'X' })
      ).rejects.toThrow('Tag not found');
    });

    it('checks slug uniqueness when a new slug is provided', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_TAG.id, slug: 'brand-new-slug' });

      expect(ensureSlugUnique).toHaveBeenCalledOnce();
      expect(ensureSlugUnique).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({
          slug: 'brand-new-slug',
          excludeId: MOCK_TAG.id,
        }),
        'Tag'
      );
    });

    it('skips slug uniqueness check when slug is unchanged', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_TAG.id, slug: 'nextjs' });

      expect(ensureSlugUnique).not.toHaveBeenCalled();
    });

    it('calls logAudit after update', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_TAG.id, name: 'Updated Tag' });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.update',
          entityType: 'tag',
          entityId: MOCK_TAG.id,
          entityTitle: MOCK_TAG.name,
        })
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(caller.update({ id: 'not-a-uuid', name: 'X' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // delete (soft-delete)
  // =========================================================================
  describe('delete', () => {
    it('calls softDelete and returns success', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: MOCK_TAG.id });

      expect(result).toEqual({ success: true });
      expect(softDelete).toHaveBeenCalledOnce();
      expect(softDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_TAG.id
      );
    });

    it('calls logAudit after soft-delete', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.delete({ id: MOCK_TAG.id });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.delete',
          entityType: 'tag',
          entityId: MOCK_TAG.id,
        })
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // restore
  // =========================================================================
  describe('restore', () => {
    it('calls softRestore and returns success', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.restore({ id: MOCK_TAG.id });

      expect(result).toEqual({ success: true });
      expect(softRestore).toHaveBeenCalledOnce();
      expect(softRestore).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_TAG.id
      );
    });

    it('calls logAudit after restore', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.restore({ id: MOCK_TAG.id });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.restore',
          entityType: 'tag',
          entityId: MOCK_TAG.id,
        })
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(caller.restore({ id: 'bad' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // permanentDelete
  // =========================================================================
  describe('permanentDelete', () => {
    it('calls permanentDelete and returns success', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.permanentDelete({ id: MOCK_TAG.id });

      expect(result).toEqual({ success: true });
      expect(permanentDelete).toHaveBeenCalledOnce();
      expect(permanentDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_TAG.id,
        'tag',
        expect.any(Function)
      );
    });

    it('cleans up term relationships via the cleanup callback', async () => {
      asMock(permanentDelete).mockImplementationOnce(
        async (_db: unknown, _cols: unknown, _id: string, _type: unknown, cleanupFn: ((tx: unknown, id: string) => Promise<void>) | undefined) => {
          // Simulate the cleanup callback being invoked with a mock tx
          await cleanupFn!({} as never, _id);
        }
      );

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.permanentDelete({ id: MOCK_TAG.id });

      expect(deleteTermRelationshipsByTerm).toHaveBeenCalledOnce();
      expect(deleteTermRelationshipsByTerm).toHaveBeenCalledWith(
        expect.anything(),
        MOCK_TAG.id,
        'tag'
      );
    });

    it('calls logAudit after permanent deletion', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.permanentDelete({ id: MOCK_TAG.id });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.permanentDelete',
          entityType: 'tag',
          entityId: MOCK_TAG.id,
        })
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(caller.permanentDelete({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // getOrCreate
  // =========================================================================
  describe('getOrCreate', () => {
    it('returns an existing tag when found', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.getOrCreate({ name: 'Next.js', lang: 'en' });

      expect(result).toEqual(MOCK_TAG);
      // Should not attempt to insert
      expect(ctx.db.insert).not.toHaveBeenCalled();
    });

    it('restores a soft-deleted tag and returns it with deletedAt cleared', async () => {
      const trashedTag = { ...MOCK_TAG, deletedAt: new Date('2025-06-01'), status: 0 };
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([trashedTag]);

      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.getOrCreate({ name: 'Next.js', lang: 'en' });

      // Should call update to un-trash
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: null, status: 1 })
      );
      expect(result.deletedAt).toBeNull();
      expect(result.status).toBe(1);
    });

    it('creates a new tag when none exists', async () => {
      const ctx = createMockCtx();
      // First select returns nothing (tag doesn't exist yet)
      ctx.db._chains.select.limit.mockResolvedValue([]);
      ctx.db._chains.insert.returning.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.getOrCreate({ name: 'Next.js', lang: 'en' });

      expect(ctx.db.insert).toHaveBeenCalled();
      expect(result).toEqual(MOCK_TAG);
    });

    it('handles race condition (unique constraint) by re-fetching the tag', async () => {
      const ctx = createMockCtx();
      // First select: no existing tag
      // Second select (after race): returns the concurrently-inserted tag
      let selectCallCount = 0;
      ctx.db._chains.select.limit.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve([]);
        return Promise.resolve([MOCK_TAG]);
      });

      // Insert fails with a unique constraint violation
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      ctx.db._chains.insert.returning.mockRejectedValue(pgError);

      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.getOrCreate({ name: 'Next.js', lang: 'en' });

      expect(result).toEqual(MOCK_TAG);
      // select called twice: initial lookup + re-fetch after race
      expect(selectCallCount).toBe(2);
    });

    it('re-throws non-unique-constraint errors', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const unexpectedError = new Error('connection lost');
      ctx.db._chains.insert.returning.mockRejectedValue(unexpectedError);

      const caller = tagsRouter.createCaller(ctx as never);

      await expect(caller.getOrCreate({ name: 'Next.js', lang: 'en' })).rejects.toThrow(
        'connection lost'
      );
    });
  });

  // =========================================================================
  // getBySlug (public)
  // =========================================================================
  describe('getBySlug', () => {
    it('returns a published tag by slug', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({ slug: 'nextjs', lang: 'en' });

      expect(result).toEqual(MOCK_TAG);
      expect(result.slug).toBe('nextjs');
    });

    it('throws NOT_FOUND when no published tag matches the slug', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = tagsRouter.createCaller(ctx as never);

      await expect(
        caller.getBySlug({ slug: 'nonexistent-tag', lang: 'en' })
      ).rejects.toThrow('Tag not found');
    });

    it('defaults lang to "en"', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_TAG]);

      const caller = tagsRouter.createCaller(ctx as never);
      // Omit lang — the Zod default of 'en' should apply
      const result = await caller.getBySlug({ slug: 'nextjs' });

      expect(result).toEqual(MOCK_TAG);
    });
  });

  // =========================================================================
  // bulkDelete
  // =========================================================================
  describe('bulkDelete', () => {
    it('soft-deletes multiple tags and returns the count', async () => {
      const ids = [
        'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
        'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5',
      ];
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.bulkDelete({ ids });

      expect(result).toEqual({ count: 2 });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) })
      );
    });

    it('returns count=0 and does not query DB when ids array is empty', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.bulkDelete({ ids: [] });

      expect(result).toEqual({ count: 0 });
      expect(ctx.db.update).not.toHaveBeenCalled();
    });

    it('calls logAudit with bulkDelete action', async () => {
      const ids = [
        'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
        'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5',
      ];
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.bulkDelete({ ids });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.bulkDelete',
          entityType: 'tag',
          metadata: { ids },
        })
      );
    });

    it('does not call logAudit when ids array is empty', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.bulkDelete({ ids: [] });

      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // bulkPublish
  // =========================================================================
  describe('bulkPublish', () => {
    it('publishes multiple tags and returns the count', async () => {
      const ids = [
        'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
        'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5',
      ];
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.bulkPublish({ ids });

      expect(result).toEqual({ count: 2 });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 1 })
      );
    });

    it('returns count=0 and does not query DB when ids array is empty', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.bulkPublish({ ids: [] });

      expect(result).toEqual({ count: 0 });
      expect(ctx.db.update).not.toHaveBeenCalled();
    });

    it('calls logAudit with bulkPublish action', async () => {
      const ids = [
        'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
        'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5',
      ];
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.bulkPublish({ ids });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.bulkPublish',
          entityType: 'tag',
          metadata: { ids },
        })
      );
    });

    it('does not call logAudit when ids array is empty', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.bulkPublish({ ids: [] });

      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateStatus
  // =========================================================================
  describe('updateStatus', () => {
    it('updates tag status and returns success', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      const result = await caller.updateStatus({ id: MOCK_TAG.id, status: 0 });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 0 })
      );
    });

    it('throws NOT_FOUND when tag does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' })
      );

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(
        caller.updateStatus({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4', status: 1 })
      ).rejects.toThrow('Tag not found');
    });

    it('calls logAudit with updateStatus action and metadata', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_TAG);

      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);
      await caller.updateStatus({ id: MOCK_TAG.id, status: 0 });

      expect(logAudit).toHaveBeenCalledOnce();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'tag.updateStatus',
          entityType: 'tag',
          entityId: MOCK_TAG.id,
          metadata: { status: 0 },
        })
      );
    });

    it('rejects status outside the 0–2 range', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(
        caller.updateStatus({ id: MOCK_TAG.id, status: 5 })
      ).rejects.toThrow();
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = tagsRouter.createCaller(ctx as never);

      await expect(
        caller.updateStatus({ id: 'bad-id', status: 1 })
      ).rejects.toThrow();
    });
  });
});
