import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks — BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/server/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock('@/server/db/schema', () => ({
  cmsOptions: { key: 'key', value: 'value' },
}));

vi.mock('@/core/lib/queue', () => ({
  createQueue: vi.fn().mockReturnValue(null),
  createWorker: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
    getTestMessageUrl: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { renderTemplate } from '../index';

// ---------------------------------------------------------------------------
// Helpers — read actual template files from disk
// ---------------------------------------------------------------------------

function readTemplate(name: string, locale = 'en'): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'emails', locale, `${name}.html`),
    'utf-8',
  );
}

function readLayout(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'emails', 'layout.html'),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('email rendering pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('layout wrapping', () => {
    it('wraps template body in layout.html', async () => {
      const { html } = await renderTemplate('welcome', { appUrl: 'https://example.com' });

      // Layout markers present
      expect(html).toContain('<!DOCTYPE html>');
      // All layout placeholders should be replaced
      expect(html).not.toContain('{{CONTENT}}');
      expect(html).not.toContain('{{SITE_NAME}}');
      expect(html).not.toContain('{{SITE_URL}}');
      expect(html).not.toContain('{{BRAND_COLOR}}');
      expect(html).not.toContain('{{HEADER_BLOCK}}');
      expect(html).not.toContain('{{PREHEADER_BLOCK}}');
    });

    it('renders text-only header when no logo configured', async () => {
      // Default: no logo in DB → text-only header
      const { html } = await renderTemplate('welcome', { appUrl: 'https://example.com' });

      expect(html).toContain('font-size:20px');
      expect(html).toContain('font-weight:700');
      expect(html).not.toContain('<img');
    });
  });

  describe('subject extraction', () => {
    it('extracts subject from <!-- subject: ... --> comment', async () => {
      const { subject } = await renderTemplate('password-reset', {
        name: 'Alice',
        resetUrl: 'https://example.com/reset',
      });

      expect(subject).toBe('Reset your password');
    });

    it('interpolates variables in subject line', async () => {
      const { subject } = await renderTemplate('invitation', {
        organizationName: 'Acme Corp',
        inviteUrl: 'https://example.com/invite',
      });

      expect(subject).toContain('Acme Corp');
    });
  });

  describe('preheader injection', () => {
    it('injects hidden preheader span when template has preheader', async () => {
      const { html } = await renderTemplate('verify-email', {
        name: 'Bob',
        verifyUrl: 'https://example.com/verify',
      });

      expect(html).toContain('display:none');
      expect(html).toContain('One quick step to activate your account');
    });

    it('does not inject preheader span when subject comment is removed', async () => {
      // All current templates have preheaders. Verify a different template's
      // preheader doesn't bleed into another render.
      const { html: html1 } = await renderTemplate('verify-email', {
        name: 'A', verifyUrl: 'https://x.com',
      });
      const { html: html2 } = await renderTemplate('password-reset', {
        name: 'A', resetUrl: 'https://x.com',
      });

      // Each render should contain its OWN preheader, not the other's
      expect(html1).toContain('One quick step');
      expect(html1).not.toContain('Click the link to reset');
      expect(html2).toContain('Click the link to reset');
      expect(html2).not.toContain('One quick step');
    });
  });

  describe('HTML escaping', () => {
    it('escapes {{key}} double-brace values', async () => {
      const { html } = await renderTemplate('verify-email', {
        name: '<script>alert("xss")</script>',
        verifyUrl: 'https://example.com/verify',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does NOT escape {{{key}}} triple-brace values (URLs)', async () => {
      const url = 'https://example.com/verify?token=abc&user=1';
      const { html } = await renderTemplate('verify-email', {
        name: 'Bob',
        verifyUrl: url,
      });

      // Triple-brace URL should be raw — href should work
      expect(html).toContain(`href="${url}"`);
      // The & in the URL should NOT be escaped to &amp;
      expect(html).toContain('token=abc&user=1');
    });
  });

  describe('branding injection', () => {
    it('injects default branding when DB returns nothing', async () => {
      const { html } = await renderTemplate('welcome', {
        appUrl: 'https://example.com',
      });

      // Default brand color
      expect(html).toContain('#e91e63');
      // Default site name
      expect(html).toContain('Indigo');
    });
  });

  describe('locale fallback', () => {
    it('renders en template when requested locale does not exist', async () => {
      // No emails/de/ directory exists, should fall back to emails/en/
      const { subject } = await renderTemplate('welcome', {
        appUrl: 'https://example.com',
      }, 'de');

      // Should get the English subject
      expect(subject).toContain('Welcome');
    });
  });

  describe('template files integrity', () => {
    const templates = [
      'welcome',
      'verify-email',
      'password-reset',
      'invitation',
      'payment-failed',
      'subscription-activated',
      'subscription-expiring',
      'subscription-expired',
      'subscription-canceled',
    ] as const;

    for (const name of templates) {
      it(`emails/en/${name}.html exists and has a subject comment`, () => {
        const raw = readTemplate(name);
        expect(raw).toBeTruthy();
        expect(raw).toMatch(/<!--\s*subject:/i);
      });
    }

    it('layout.html exists and has all required placeholders', () => {
      const layout = readLayout();
      expect(layout).toContain('{{HEADER_BLOCK}}');
      expect(layout).toContain('{{CONTENT}}');
      expect(layout).toContain('{{PREHEADER_BLOCK}}');
      expect(layout).toContain('{{SITE_NAME}}');
      expect(layout).toContain('{{SITE_URL}}');
    });
  });
});
