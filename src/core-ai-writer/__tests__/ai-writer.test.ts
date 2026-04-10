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

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
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

const mockCallAi = vi.fn();
vi.mock('@/core-ai-writer/lib/ai-client', () => ({
  callAi: (...args: unknown[]) => mockCallAi(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { aiWriterRouter } from '@/core-ai-writer/routers/ai-writer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCtx() {
  return {
    session: {
      user: { id: 'user-1', email: 'editor@test.com', role: 'editor' },
      session: { id: 'session-1' },
    },
    headers: new Headers(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aiWriterRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // generatePost
  // =========================================================================
  describe('generatePost', () => {
    it('returns generated HTML content', async () => {
      mockCallAi.mockResolvedValue('<h2>Introduction</h2><p>Test content.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.generatePost({ topic: 'Testing in TypeScript' });

      expect(result.content).toContain('<h2>Introduction</h2>');
      expect(mockCallAi).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4000, // medium length default
        })
      );
    });

    it('uses correct maxTokens for long posts', async () => {
      mockCallAi.mockResolvedValue('<p>Long content.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.generatePost({ topic: 'Testing', length: 'long' });

      expect(mockCallAi).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 8000 })
      );
    });

    it('uses correct maxTokens for short posts', async () => {
      mockCallAi.mockResolvedValue('<p>Short.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.generatePost({ topic: 'Testing', length: 'short' });

      expect(mockCallAi).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 2000 })
      );
    });

    it('throws PRECONDITION_FAILED when AI not configured', async () => {
      mockCallAi.mockResolvedValue(null);

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await expect(
        caller.generatePost({ topic: 'Testing' })
      ).rejects.toThrow('AI is not configured');
    });

    it('passes tone and language to AI', async () => {
      mockCallAi.mockResolvedValue('<p>Content.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.generatePost({ topic: 'Testing', tone: 'casual', language: 'de' });

      const callArgs = mockCallAi.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('Tone: casual');
      expect(userMessage.content).toContain('Language: de');
    });
  });

  // =========================================================================
  // generateOutline
  // =========================================================================
  describe('generateOutline', () => {
    it('returns parsed outline JSON', async () => {
      mockCallAi.mockResolvedValue(JSON.stringify({
        title: 'Test Title',
        outline: [{ heading: 'Intro', points: ['point 1'] }],
        estimatedWordCount: 1000,
        targetKeyword: 'testing',
      }));

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.generateOutline({ topic: 'Testing' });

      expect(result.title).toBe('Test Title');
      expect(result.outline).toHaveLength(1);
      expect(result.targetKeyword).toBe('testing');
    });

    it('strips markdown code fences from JSON', async () => {
      mockCallAi.mockResolvedValue('```json\n{"title":"Test","outline":[],"estimatedWordCount":500,"targetKeyword":"test"}\n```');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.generateOutline({ topic: 'Testing' });

      expect(result.title).toBe('Test');
    });

    it('throws on invalid JSON from AI', async () => {
      mockCallAi.mockResolvedValue('This is not JSON');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await expect(
        caller.generateOutline({ topic: 'Testing' })
      ).rejects.toThrow('AI returned invalid JSON');
    });
  });

  // =========================================================================
  // generateSeo
  // =========================================================================
  describe('generateSeo', () => {
    it('returns SEO metadata from content', async () => {
      mockCallAi.mockResolvedValue(JSON.stringify({
        metaTitle: 'Test Page - Best Practices',
        metaDescription: 'Learn the best practices for testing.',
        focusKeyword: 'testing best practices',
        keywords: ['testing', 'best practices', 'quality'],
      }));

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.generateSeo({
        title: 'Test Page',
        content: '<p>Some content about testing best practices in software development.</p>',
      });

      expect(result.metaTitle).toContain('Test Page');
      expect(result.keywords).toHaveLength(3);
    });

    it('strips HTML before sending to AI', async () => {
      mockCallAi.mockResolvedValue(JSON.stringify({
        metaTitle: 'T', metaDescription: 'D', focusKeyword: 'k', keywords: [],
      }));

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.generateSeo({
        title: 'Test',
        content: '<h2>Heading</h2><p>Paragraph with <strong>bold</strong> text.</p>',
      });

      const callArgs = mockCallAi.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).not.toContain('<h2>');
      expect(userMessage.content).toContain('Heading');
    });
  });

  // =========================================================================
  // analyzeSeo
  // =========================================================================
  describe('analyzeSeo', () => {
    it('returns score and issues', async () => {
      mockCallAi.mockResolvedValue(JSON.stringify({
        score: 72,
        issues: [
          { type: 'warning', message: 'Content is short', fix: 'Add more paragraphs' },
        ],
      }));

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.analyzeSeo({
        title: 'Test',
        content: '<p>Short content.</p>',
      });

      expect(result.score).toBe(72);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('warning');
    });

    it('includes optional fields in prompt', async () => {
      mockCallAi.mockResolvedValue(JSON.stringify({ score: 85, issues: [] }));

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.analyzeSeo({
        title: 'Test',
        content: '<p>Content.</p>',
        metaDescription: 'Test description',
        focusKeyword: 'testing',
      });

      const callArgs = mockCallAi.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('Meta description: Test description');
      expect(userMessage.content).toContain('Focus keyword: testing');
    });
  });

  // =========================================================================
  // translate
  // =========================================================================
  describe('translate', () => {
    it('returns translated content', async () => {
      mockCallAi.mockResolvedValue('<p>Übersetzter Inhalt.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.translate({
        content: '<p>Translated content.</p>',
        targetLanguage: 'German',
      });

      expect(result.content).toContain('Übersetzter');
    });

    it('passes source and target language', async () => {
      mockCallAi.mockResolvedValue('<p>Contenido.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.translate({
        content: '<p>Content.</p>',
        targetLanguage: 'Spanish',
        sourceLanguage: 'English',
      });

      const callArgs = mockCallAi.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toContain('Translate to: Spanish');
      expect(userMessage.content).toContain('Source language: English');
    });

    it('caps maxTokens at 16000', async () => {
      const longContent = '<p>' + 'a'.repeat(20000) + '</p>';
      mockCallAi.mockResolvedValue('<p>Translated.</p>');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.translate({ content: longContent, targetLanguage: 'German' });

      expect(mockCallAi).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 16000 })
      );
    });
  });

  // =========================================================================
  // generateAltText
  // =========================================================================
  describe('generateAltText', () => {
    it('returns alt text for an image', async () => {
      mockCallAi.mockResolvedValue('A golden retriever sitting in a park');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      const result = await caller.generateAltText({
        imageUrl: 'https://example.com/dog.jpg',
      });

      expect(result.altText).toBe('A golden retriever sitting in a park');
    });

    it('includes context in the request when provided', async () => {
      mockCallAi.mockResolvedValue('Company logo on white background');

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await caller.generateAltText({
        imageUrl: 'https://example.com/logo.png',
        context: 'This is our company logo for the about page',
      });

      const callArgs = mockCallAi.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'image_url' }),
          expect.objectContaining({ type: 'text', text: expect.stringContaining('company logo') }),
        ])
      );
    });

    it('throws PRECONDITION_FAILED when AI returns null (vision not supported)', async () => {
      mockCallAi.mockResolvedValue(null);

      const caller = aiWriterRouter.createCaller(createCtx() as never);
      await expect(
        caller.generateAltText({ imageUrl: 'https://example.com/img.jpg' })
      ).rejects.toThrow('AI vision is not available');
    });
  });
});
