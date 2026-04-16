import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock fns (available inside vi.mock factories) ---

const {
  mockQueueAdd,
  mockSendEmail,
  mockIsValidEmail,
  mockRenderTemplate,
  mockGetEmailDeps,
  mockBranding,
} = vi.hoisted(() => {
  const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
  const mockSendEmail = vi.fn().mockResolvedValue(undefined);
  const mockIsValidEmail = vi.fn().mockReturnValue(true);
  const mockRenderTemplate = vi.fn().mockResolvedValue({
    subject: 'Test Subject',
    html: '<p>Test</p>',
  });

  const mockBranding = {
    siteName: 'TestSite',
    siteUrl: 'https://test.com',
    contactEmail: 'contact@test.com',
    logoUrl: '',
    brandColor: '#000',
  };

  const mockGetEmailDeps = vi.fn().mockReturnValue({
    getBranding: vi.fn().mockResolvedValue(mockBranding),
    getTemplateOverride: undefined,
    templatesDir: '/emails',
    extraLayoutVars: undefined,
    retryPolicy: undefined,
  });

  return {
    mockQueueAdd,
    mockSendEmail,
    mockIsValidEmail,
    mockRenderTemplate,
    mockGetEmailDeps,
    mockBranding,
  };
});

// --- Mocks ---

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core/lib/infra/queue', () => ({
  createQueue: () => ({ add: mockQueueAdd }),
  createWorker: vi.fn(),
}));

vi.mock('../email/transport', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  isValidEmail: (...args: unknown[]) => mockIsValidEmail(...args),
}));

vi.mock('../email/template', () => ({
  renderTemplate: (...args: unknown[]) => mockRenderTemplate(...args),
}));

vi.mock('../email/deps', () => ({
  getEmailDeps: (...args: unknown[]) => mockGetEmailDeps(...args),
}));

// Import after mocks
import { enqueueEmail, enqueueTemplateEmail } from '../email/queue';

// --- Tests ---

describe('enqueueEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsValidEmail.mockReturnValue(true);
  });

  it('enqueues to BullMQ when queue is available', async () => {
    const payload = { to: 'user@test.com', subject: 'Hello', html: '<p>Hi</p>' };

    await enqueueEmail(payload);

    expect(mockQueueAdd).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'send-raw',
      payload,
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('falls back to direct send when no queue', async () => {
    vi.resetModules();

    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: () => null,
      createWorker: vi.fn(),
    }));
    vi.doMock('../email/transport', () => ({
      sendEmail: mockSendEmail,
      isValidEmail: mockIsValidEmail,
    }));
    vi.doMock('../email/template', () => ({
      renderTemplate: mockRenderTemplate,
    }));
    vi.doMock('../email/deps', () => ({
      getEmailDeps: mockGetEmailDeps,
    }));

    mockIsValidEmail.mockReturnValue(true);
    mockSendEmail.mockClear();

    const { enqueueEmail: enqueueEmailFresh } = await import('../email/queue');

    const payload = { to: 'user@test.com', subject: 'Hello', html: '<p>Hi</p>' };
    await enqueueEmailFresh(payload);

    expect(mockSendEmail).toHaveBeenCalledWith('user@test.com', 'Hello', '<p>Hi</p>');
  });

  it('warns on invalid email address', async () => {
    mockIsValidEmail.mockReturnValue(false);

    const payload = { to: 'not-an-email', subject: 'Hello', html: '<p>Hi</p>' };
    await enqueueEmail(payload);

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips sending if no valid recipient', async () => {
    mockIsValidEmail.mockReturnValue(false);

    const payload = { to: '', subject: 'Hello', html: '<p>Hi</p>' };
    await enqueueEmail(payload);

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('enqueueTemplateEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsValidEmail.mockReturnValue(true);
  });

  it('enqueues template job with correct template name and vars', async () => {
    await enqueueTemplateEmail('user@test.com', 'welcome', { name: 'Alice' }, 'en');

    expect(mockQueueAdd).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'send-template',
      {
        to: 'user@test.com',
        template: 'welcome',
        data: { name: 'Alice' },
        locale: 'en',
      },
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockRenderTemplate).not.toHaveBeenCalled();
  });

  it('falls back to render + send when no queue', async () => {
    vi.resetModules();

    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: () => null,
      createWorker: vi.fn(),
    }));
    vi.doMock('../email/transport', () => ({
      sendEmail: mockSendEmail,
      isValidEmail: mockIsValidEmail,
    }));
    vi.doMock('../email/template', () => ({
      renderTemplate: mockRenderTemplate,
    }));
    vi.doMock('../email/deps', () => ({
      getEmailDeps: mockGetEmailDeps,
    }));

    mockIsValidEmail.mockReturnValue(true);
    mockSendEmail.mockClear();
    mockRenderTemplate.mockClear();
    mockGetEmailDeps.mockClear();
    mockRenderTemplate.mockResolvedValue({
      subject: 'Test Subject',
      html: '<p>Test</p>',
    });
    mockGetEmailDeps.mockReturnValue({
      getBranding: vi.fn().mockResolvedValue(mockBranding),
      getTemplateOverride: undefined,
      templatesDir: '/emails',
      extraLayoutVars: undefined,
      retryPolicy: undefined,
    });

    const { enqueueTemplateEmail: enqueueTemplateFresh } = await import('../email/queue');

    await enqueueTemplateFresh('user@test.com', 'welcome', { name: 'Alice' }, 'en');

    expect(mockRenderTemplate).toHaveBeenCalledWith(
      'welcome',
      { name: 'Alice' },
      'en',
      mockBranding,
      expect.objectContaining({ templatesDir: '/emails' }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(['user@test.com'], 'Test Subject', '<p>Test</p>');
  });

  it('handles array of recipients', async () => {
    await enqueueTemplateEmail(
      ['a@test.com', 'b@test.com'],
      'newsletter',
      { title: 'News' },
      'en',
    );

    expect(mockQueueAdd).toHaveBeenCalledOnce();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'send-template',
      {
        to: 'a@test.com,b@test.com',
        template: 'newsletter',
        data: { title: 'News' },
        locale: 'en',
      },
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
  });

  it('filters out invalid emails from array and skips if none valid', async () => {
    mockIsValidEmail.mockReturnValue(false);

    await enqueueTemplateEmail(
      ['bad1', 'bad2'],
      'welcome',
      { name: 'Test' },
      'en',
    );

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('defaults locale to "en" when not provided', async () => {
    await enqueueTemplateEmail('user@test.com', 'reset-password', { token: 'abc' });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'send-template',
      expect.objectContaining({ locale: 'en' }),
      expect.anything(),
    );
  });
});
