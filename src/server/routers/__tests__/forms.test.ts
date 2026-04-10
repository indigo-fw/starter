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

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
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

vi.mock('@/server/db/schema', () => ({
  cmsForms: {
    id: 'cms_forms.id',
    name: 'cms_forms.name',
    slug: 'cms_forms.slug',
    fields: 'cms_forms.fields',
    recipientEmail: 'cms_forms.recipient_email',
    successMessage: 'cms_forms.success_message',
    honeypotField: 'cms_forms.honeypot_field',
    active: 'cms_forms.active',
    createdAt: 'cms_forms.created_at',
    updatedAt: 'cms_forms.updated_at',
  },
  cmsFormSubmissions: {
    id: 'cms_form_submissions.id',
    formId: 'cms_form_submissions.form_id',
    data: 'cms_form_submissions.data',
    ip: 'cms_form_submissions.ip',
    userAgent: 'cms_form_submissions.user_agent',
    createdAt: 'cms_form_submissions.created_at',
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
import { formsRouter } from '../forms';
import { fetchOrNotFound, ensureSlugUnique } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/infra/audit';
import { createMockCtx } from './test-helpers';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FORM_ID = 'f1f1f1f1-0000-4000-a000-000000000001';
const SUBMISSION_ID = 'a2a2a2a2-0000-4000-a000-000000000002';

const MOCK_FIELDS = [
  { id: 'name', type: 'text' as const, label: 'Name', required: true },
  { id: 'email', type: 'email' as const, label: 'Email', required: true },
  { id: 'message', type: 'textarea' as const, label: 'Message' },
];

const MOCK_FORM = {
  id: FORM_ID,
  name: 'Contact Form',
  slug: 'contact-form',
  fields: MOCK_FIELDS,
  recipientEmail: 'admin@example.com',
  successMessage: 'Thank you!',
  honeypotField: '_trap',
  active: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_SUBMISSION = {
  id: SUBMISSION_ID,
  formId: FORM_ID,
  data: { name: 'Alice', email: 'alice@example.com', message: 'Hello' },
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2025-03-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fetchOrNotFound resolves to MOCK_FORM
    asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns paginated forms', async () => {
      // list uses a concurrent Promise.all with two selects (items + count).
      // Build a dual-track select mock.
      let callIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([MOCK_FORM]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        callIndex++;
        return callIndex % 2 === 1 ? { from: itemsFromMock } : { from: countFromMock };
      });

      const ctx = createMockCtx({ db: { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() } });
      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.list({});

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.name).toBe('Contact Form');
      expect(result.total).toBe(1);
    });

    it('supports pagination parameters', async () => {
      const { parsePagination } = await import('@/core/crud/admin-crud');
      asMock(parsePagination).mockReturnValue({ page: 2, pageSize: 10, offset: 10 });

      let callIndex = 0;
      const limitMock = vi.fn().mockResolvedValue([]);
      const offsetMock = vi.fn().mockReturnValue({ limit: limitMock });
      const orderByMock = vi.fn().mockReturnValue({ offset: offsetMock });
      const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });
      const selectMock = vi.fn().mockImplementation(() => {
        callIndex++;
        return callIndex % 2 === 1 ? { from: fromMock } : { from: countFromMock };
      });

      const ctx = createMockCtx({ db: { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() } });
      const caller = formsRouter.createCaller(ctx as never);
      await caller.list({ page: 2, pageSize: 10 });

      expect(parsePagination).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns a form by id', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: FORM_ID });

      expect(result.id).toBe(FORM_ID);
      expect(result.name).toBe('Contact Form');
      expect(fetchOrNotFound).toHaveBeenCalledWith(ctx.db, expect.anything(), FORM_ID, 'Form');
    });

    it('throws NOT_FOUND when form does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Form not found' })
      );

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(caller.get({ id: FORM_ID })).rejects.toThrow('Form not found');
    });

    it('rejects non-UUID id', async () => {
      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(caller.get({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    const createInput = {
      name: 'Newsletter Signup',
      slug: 'newsletter-signup',
      fields: [{ id: 'email', type: 'email' as const, label: 'Email', required: true }],
      recipientEmail: 'owner@example.com',
      active: true,
    };

    it('creates a form and returns it', async () => {
      const created = { ...MOCK_FORM, id: 'new-form-uuid', name: 'Newsletter Signup', slug: 'newsletter-signup' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([created]);

      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.create(createInput);

      expect(result.name).toBe('Newsletter Signup');
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('auto-generates slug from name when not provided', async () => {
      const { slugify } = await import('@/core/lib/content/slug');
      const created = { ...MOCK_FORM, id: 'new-form-uuid-2', name: 'My Form', slug: 'my-form' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([created]);

      const caller = formsRouter.createCaller(ctx as never);
      await caller.create({ name: 'My Form', fields: [] });

      expect(slugify).toHaveBeenCalledWith('My Form');
    });

    it('checks slug uniqueness before insert', async () => {
      const created = { ...MOCK_FORM, id: 'new-form-uuid-3', name: 'Newsletter Signup', slug: 'newsletter-signup' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([created]);

      const caller = formsRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(ensureSlugUnique).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ slug: 'newsletter-signup' }),
        'Form'
      );
    });

    it('calls logAudit after creation', async () => {
      const created = { ...MOCK_FORM, id: 'audit-form-uuid', name: 'Newsletter Signup', slug: 'newsletter-signup' };
      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([created]);

      const caller = formsRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'create',
          entityType: 'form',
          entityId: created.id,
          entityTitle: 'Newsletter Signup',
        })
      );
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('updates a form and returns success', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.update({ id: FORM_ID, name: 'Updated Form' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when form does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Form not found' })
      );

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(caller.update({ id: FORM_ID, name: 'X' })).rejects.toThrow('Form not found');
    });

    it('checks slug uniqueness when slug changes', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      await caller.update({ id: FORM_ID, slug: 'new-slug' });

      expect(ensureSlugUnique).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ slug: 'new-slug', excludeId: FORM_ID }),
        'Form'
      );
    });

    it('skips slug uniqueness check when slug is unchanged', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      // Pass the same slug as the existing form
      await caller.update({ id: FORM_ID, slug: MOCK_FORM.slug });

      expect(ensureSlugUnique).not.toHaveBeenCalled();
    });

    it('calls logAudit after update', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      await caller.update({ id: FORM_ID, name: 'Updated Name' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entityType: 'form',
          entityId: FORM_ID,
          entityTitle: 'Updated Name',
        })
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================
  describe('delete', () => {
    it('deletes a form and returns success', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: FORM_ID });

      expect(result).toEqual({ success: true });
      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when form does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Form not found' })
      );

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: FORM_ID })).rejects.toThrow('Form not found');
    });

    it('calls logAudit with delete action', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      await caller.delete({ id: FORM_ID });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entityType: 'form',
          entityId: FORM_ID,
          entityTitle: MOCK_FORM.name,
        })
      );
    });

    it('rejects non-UUID id', async () => {
      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: 'bad-id' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // submissions
  // =========================================================================
  describe('submissions', () => {
    it('returns paginated submissions for a form', async () => {
      let callIndex = 0;

      const limitMock = vi.fn().mockResolvedValue([MOCK_SUBMISSION]);
      const offsetMock = vi.fn().mockReturnValue({ limit: limitMock });
      const orderByMock = vi.fn().mockReturnValue({ offset: offsetMock });
      const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        callIndex++;
        return callIndex % 2 === 1 ? { from: fromMock } : { from: countFromMock };
      });

      const ctx = createMockCtx({ db: { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() } });
      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.submissions({ formId: FORM_ID });

      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // =========================================================================
  // deleteSubmission
  // =========================================================================
  describe('deleteSubmission', () => {
    it('deletes a submission and returns success', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_SUBMISSION);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.deleteSubmission({ id: SUBMISSION_ID });

      expect(result).toEqual({ success: true });
      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when submission does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })
      );

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(caller.deleteSubmission({ id: SUBMISSION_ID })).rejects.toThrow('Submission not found');
    });

    it('calls logAudit with form_submission entity type', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_SUBMISSION);

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);
      await caller.deleteSubmission({ id: SUBMISSION_ID });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entityType: 'form_submission',
          entityId: SUBMISSION_ID,
        })
      );
    });
  });

  // =========================================================================
  // exportSubmissions
  // =========================================================================
  describe('exportSubmissions', () => {
    it('exports submissions as JSON with correct filename', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_SUBMISSION]);

      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.exportSubmissions({ formId: FORM_ID, format: 'json' });

      expect(result.filename).toBe('contact-form-submissions.json');
      const parsed = JSON.parse(result.content);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toMatchObject({ id: SUBMISSION_ID, ip: '127.0.0.1' });
    });

    it('exports submissions as CSV with headers', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_SUBMISSION]);

      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.exportSubmissions({ formId: FORM_ID, format: 'csv' });

      expect(result.filename).toBe('contact-form-submissions.csv');
      const lines = result.content.split('\n');
      // Header row includes field labels
      expect(lines[0]).toContain('Submitted At');
      expect(lines[0]).toContain('Name');
      expect(lines[0]).toContain('Email');
      // Data row for submission
      expect(lines.length).toBeGreaterThan(1);
    });

    it('returns empty JSON array when no submissions exist', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_FORM);

      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = formsRouter.createCaller(ctx as never);
      const result = await caller.exportSubmissions({ formId: FORM_ID, format: 'json' });

      const parsed = JSON.parse(result.content);
      expect(parsed).toEqual([]);
    });

    it('throws NOT_FOUND when form does not exist', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Form not found' })
      );

      const ctx = createMockCtx();
      const caller = formsRouter.createCaller(ctx as never);

      await expect(
        caller.exportSubmissions({ formId: FORM_ID, format: 'json' })
      ).rejects.toThrow('Form not found');
    });
  });
});
