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

vi.mock('@/core/crud/cms-helpers', () => ({
  updateWithRevision: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/crud/taxonomy-helpers', () => ({
  syncTermRelationships: vi.fn().mockResolvedValue(undefined),
  getTermRelationships: vi.fn().mockResolvedValue([]),
  deleteAllTermRelationships: vi.fn().mockResolvedValue(undefined),
  deleteTermRelationshipsByTerm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/webhooks/webhooks', () => ({
  dispatchWebhook: vi.fn(),
}));

vi.mock('@/server/translation/translate-fields', () => ({
  createFieldTranslator: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    DEEPL_API_KEY: undefined,
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
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

vi.mock('@/server/db/schema', () => ({
  cmsCategories: {
    id: 'cms_categories.id',
    name: 'cms_categories.name',
    slug: 'cms_categories.slug',
    lang: 'cms_categories.lang',
    title: 'cms_categories.title',
    text: 'cms_categories.text',
    icon: 'cms_categories.icon',
    metaDescription: 'cms_categories.meta_description',
    seoTitle: 'cms_categories.seo_title',
    order: 'cms_categories.order',
    status: 'cms_categories.status',
    publishedAt: 'cms_categories.published_at',
    noindex: 'cms_categories.noindex',
    fallbackToDefault: 'cms_categories.fallback_to_default',
    translationGroup: 'cms_categories.translation_group',
    jsonLd: 'cms_categories.json_ld',
    previewToken: 'cms_categories.preview_token',
    createdAt: 'cms_categories.created_at',
    updatedAt: 'cms_categories.updated_at',
    deletedAt: 'cms_categories.deleted_at',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { categoriesRouter } from '../categories';
import {
  buildStatusCounts,
  ensureSlugUnique,
  softDelete,
  softRestore,
  permanentDelete,
  fetchOrNotFound,
} from '@/core/crud/admin-crud';
import { TRPCError } from '@trpc/server';
import {
  getTermRelationships,
  syncTermRelationships,
  deleteTermRelationshipsByTerm,
} from '@/core/crud/taxonomy-helpers';
import { updateWithRevision } from '@/core/crud/cms-helpers';
import { logAudit } from '@/core/lib/infra/audit';
import { createMockCtx } from './test-helpers';

const MOCK_CATEGORY = {
  id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
  name: 'Technology',
  slug: 'technology',
  lang: 'en',
  title: 'Technology Category',
  text: 'All about tech',
  icon: null,
  metaDescription: 'Technology articles',
  seoTitle: null,
  order: 0,
  status: 1,
  publishedAt: new Date('2025-01-01'),
  noindex: false,
  fallbackToDefault: null,
  translationGroup: null,
  jsonLd: null,
  previewToken: 'tok456',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('categoriesRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // counts
  // =========================================================================
  describe('counts', () => {
    it('returns status counts for categories', async () => {
      const mockCounts = { all: 8, published: 5, draft: 2, scheduled: 0, trash: 1 };
      asMock(buildStatusCounts).mockResolvedValue(mockCounts);

      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.counts();

      expect(result).toEqual(mockCounts);
      expect(buildStatusCounts).toHaveBeenCalledOnce();
    });

    it('passes the correct table to buildStatusCounts', async () => {
      asMock(buildStatusCounts).mockResolvedValue({
        all: 0,
        published: 0,
        draft: 0,
        scheduled: 0,
        trash: 0,
      });

      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.counts();

      expect(buildStatusCounts).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() })
      );
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns a category with tagIds', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      asMock(getTermRelationships).mockResolvedValue([
        { termId: 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111', taxonomyId: 'tag' },
        { termId: 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222', taxonomyId: 'tag' },
      ]);

      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.get({ id: MOCK_CATEGORY.id });

      expect(result.id).toBe(MOCK_CATEGORY.id);
      expect(result.name).toBe('Technology');
      expect(result.tagIds).toEqual([
        'aaaaaaaa-bbbb-4ccc-8ddd-111111111111',
        'aaaaaaaa-bbbb-4ccc-8ddd-222222222222',
      ]);
    });

    it('throws NOT_FOUND when category does not exist', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' })
      );

      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(
        caller.get({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Category not found');
    });

    it('returns empty tagIds when category has no tag relationships', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);
      asMock(getTermRelationships).mockResolvedValue([]);

      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.get({ id: MOCK_CATEGORY.id });

      expect(result.tagIds).toEqual([]);
    });

    it('calls getTermRelationships with tag taxonomy discriminator', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);
      asMock(getTermRelationships).mockResolvedValue([]);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.get({ id: MOCK_CATEGORY.id });

      expect(getTermRelationships).toHaveBeenCalledWith(ctx.db, MOCK_CATEGORY.id, 'tag');
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(caller.get({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    const createInput = {
      name: 'New Category',
      slug: 'new-category',
      lang: 'en',
      title: 'New Category Title',
      text: 'Some description',
      status: 0,
    };

    it('creates a category and returns it', async () => {
      const createdCategory = {
        ...MOCK_CATEGORY,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f0',
        name: 'New Category',
        slug: 'new-category',
        status: 0,
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdCategory]);

      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.create(createInput);

      expect(result.name).toBe('New Category');
      expect(result.slug).toBe('new-category');
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('calls ensureSlugUnique before inserting', async () => {
      const createdCategory = { ...MOCK_CATEGORY, id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f1' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdCategory]);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(ensureSlugUnique).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({
          slug: 'new-category',
          lang: 'en',
        }),
        'Category'
      );
    });

    it('syncs tags when tagIds are provided', async () => {
      const createdCategory = {
        ...MOCK_CATEGORY,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f2',
        name: 'New Category',
        slug: 'new-category',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdCategory]);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.create({
        ...createInput,
        tagIds: [
          'aaaaaaaa-bbbb-4ccc-8ddd-111111111111',
          'aaaaaaaa-bbbb-4ccc-8ddd-222222222222',
        ],
      });

      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        createdCategory.id,
        'tag',
        ['aaaaaaaa-bbbb-4ccc-8ddd-111111111111', 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222']
      );
    });

    it('does not call syncTermRelationships when no tagIds provided', async () => {
      const createdCategory = { ...MOCK_CATEGORY, id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f3' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdCategory]);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(syncTermRelationships).not.toHaveBeenCalled();
    });

    it('calls logAudit after creation', async () => {
      const createdCategory = {
        ...MOCK_CATEGORY,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f4',
        name: 'New Category',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdCategory]);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'create',
          entityType: 'category',
          entityId: createdCategory.id,
          entityTitle: createdCategory.name,
        })
      );
    });

    it('rejects input with slug longer than 255 chars', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(
        caller.create({ ...createInput, slug: 'a'.repeat(256) })
      ).rejects.toThrow();
    });

    it('rejects input with empty name', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(
        caller.create({ ...createInput, name: '' })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('updates a category via updateWithRevision and returns success', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.update({
        id: MOCK_CATEGORY.id,
        name: 'Updated Name',
      });

      expect(result).toEqual({ success: true });
      expect(updateWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          contentType: 'category',
          contentId: MOCK_CATEGORY.id,
          oldRecord: MOCK_CATEGORY,
          userId: 'user-1',
          urlPrefix: '/category/',
        })
      );
    });

    it('throws NOT_FOUND when updating a nonexistent category', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' })
      );

      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(
        caller.update({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4', name: 'X' })
      ).rejects.toThrow('Category not found');
    });

    it('calls ensureSlugUnique when slug changes', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_CATEGORY.id,
        slug: 'new-slug',
      });

      expect(ensureSlugUnique).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({
          slug: 'new-slug',
          excludeId: MOCK_CATEGORY.id,
        }),
        'Category'
      );
    });

    it('does not call ensureSlugUnique when slug is unchanged', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_CATEGORY.id,
        slug: MOCK_CATEGORY.slug, // same slug — no uniqueness check needed
      });

      expect(ensureSlugUnique).not.toHaveBeenCalled();
    });

    it('syncs tag relationships when tagIds are provided', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_CATEGORY.id,
        tagIds: ['aaaaaaaa-bbbb-4ccc-8ddd-333333333333'],
      });

      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        MOCK_CATEGORY.id,
        'tag',
        ['aaaaaaaa-bbbb-4ccc-8ddd-333333333333']
      );
    });

    it('does not call syncTermRelationships when tagIds is not provided', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_CATEGORY.id,
        name: 'Updated Name Only',
      });

      expect(syncTermRelationships).not.toHaveBeenCalled();
    });

    it('calls logAudit with update action after update', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_CATEGORY.id, name: 'Updated Name' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'update',
          entityType: 'category',
          entityId: MOCK_CATEGORY.id,
          entityTitle: 'Updated Name',
        })
      );
    });

    it('uses existing name in audit log when name is not updated', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_CATEGORY.id, order: 5 });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          entityTitle: MOCK_CATEGORY.name,
        })
      );
    });

    it('passes oldSlug and newSlug to updateWithRevision', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_CATEGORY);

      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_CATEGORY.id, slug: 'changed-slug' });

      expect(updateWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          oldSlug: MOCK_CATEGORY.slug,
          newSlug: 'changed-slug',
        })
      );
    });
  });

  // =========================================================================
  // delete (soft-delete)
  // =========================================================================
  describe('delete', () => {
    it('calls softDelete and returns success', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: MOCK_CATEGORY.id });

      expect(result).toEqual({ success: true });
      expect(softDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_CATEGORY.id
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // restore
  // =========================================================================
  describe('restore', () => {
    it('calls softRestore and returns success', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.restore({ id: MOCK_CATEGORY.id });

      expect(result).toEqual({ success: true });
      expect(softRestore).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_CATEGORY.id
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(caller.restore({ id: 'bad' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // permanentDelete
  // =========================================================================
  describe('permanentDelete', () => {
    it('calls permanentDelete and returns success', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.permanentDelete({ id: MOCK_CATEGORY.id });

      expect(result).toEqual({ success: true });
      expect(permanentDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_CATEGORY.id,
        'category',
        expect.any(Function)
      );
    });

    it('passes a cascade callback that cleans up term relationships', async () => {
      let capturedCallback: ((tx: unknown, id: string) => Promise<void>) | undefined;
      asMock(permanentDelete).mockImplementationOnce(
        async (_db: unknown, _cols: unknown, _id: unknown, _contentTypeId: unknown, cascadeFn: unknown) => {
          capturedCallback = cascadeFn as unknown as (tx: unknown, id: string) => Promise<void>;
        }
      );

      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);
      await caller.permanentDelete({ id: MOCK_CATEGORY.id });

      expect(capturedCallback).toBeDefined();

      // Invoke the callback to verify it calls deleteTermRelationshipsByTerm
      const mockTx = {} as unknown;
      await capturedCallback!(mockTx, MOCK_CATEGORY.id);

      expect(deleteTermRelationshipsByTerm).toHaveBeenCalledWith(
        mockTx,
        MOCK_CATEGORY.id,
        'category'
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(caller.permanentDelete({ id: 'bad-id' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // listPublished
  // =========================================================================
  describe('listPublished', () => {
    it('returns paginated published categories', async () => {
      const categories = [
        { ...MOCK_CATEGORY, id: 'e1e1e1e1-0000-4000-a000-000000000001' },
        { ...MOCK_CATEGORY, id: 'e1e1e1e1-0000-4000-a000-000000000002' },
      ];

      // listPublished runs two concurrent selects via Promise.all:
      //   1) select().from().where().orderBy().offset().limit() → items
      //   2) select().from().where() → [{ count: N }]
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue(categories);
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

      const db = {
        select: selectMock,
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };

      const ctx = createMockCtx({ db });
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.listPublished({
        lang: 'en',
        page: 1,
        pageSize: 10,
      });

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('strips previewToken from returned categories', async () => {
      const categoriesWithToken = [{ ...MOCK_CATEGORY, previewToken: 'secret-token' }];

      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue(categoriesWithToken);
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

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
      const ctx = createMockCtx({ db });
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ lang: 'en' });

      expect(result.results[0]).not.toHaveProperty('previewToken');
    });

    it('returns empty results when no published categories exist', async () => {
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

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
      const ctx = createMockCtx({ db });
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ lang: 'en' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('uses default pagination values (page=1, pageSize=100)', async () => {
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

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
      const ctx = createMockCtx({ db });
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.listPublished({});

      // Defaults: page=1, pageSize=100
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(100);
    });

    it('calculates totalPages correctly', async () => {
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 25 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
      const ctx = createMockCtx({ db });
      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ lang: 'en', page: 1, pageSize: 10 });

      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3); // ceil(25/10)
    });
  });

  // =========================================================================
  // getBySlug
  // =========================================================================
  describe('getBySlug', () => {
    it('returns a published category by slug', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_CATEGORY]);

      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({ slug: 'technology', lang: 'en' });

      expect(result.name).toBe('Technology');
      expect(result.slug).toBe('technology');
    });

    it('strips previewToken from the response', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_CATEGORY]);

      const caller = categoriesRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({ slug: 'technology', lang: 'en' });

      expect(result).not.toHaveProperty('previewToken');
    });

    it('throws NOT_FOUND when no published category matches the slug', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(
        caller.getBySlug({ slug: 'nonexistent', lang: 'en' })
      ).rejects.toThrow('Category not found');
    });

    it('uses default lang "en" when not specified', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_CATEGORY]);

      const caller = categoriesRouter.createCaller(ctx as never);
      // lang has a default so omitting it is valid
      const result = await caller.getBySlug({ slug: 'technology' });

      expect(result.name).toBe('Technology');
    });

    it('rejects slug longer than 255 chars', async () => {
      const ctx = createMockCtx();
      const caller = categoriesRouter.createCaller(ctx as never);

      await expect(
        caller.getBySlug({ slug: 'a'.repeat(256), lang: 'en' })
      ).rejects.toThrow();
    });
  });
});
