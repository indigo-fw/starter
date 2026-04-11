import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Mocks — BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/core/lib/infra/queue', () => ({
  createQueue: vi.fn().mockReturnValue(null),
  createWorker: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/infra/logger', () => ({
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

import { renderTemplate } from '@/core/lib/email';
import type { EmailBranding } from '@/core/lib/email';

// ---------------------------------------------------------------------------
// Test branding (no DB)
// ---------------------------------------------------------------------------

const TEST_BRANDING: EmailBranding = {
  siteName: 'Indigo',
  siteUrl: 'http://localhost:3000',
  contactEmail: 'noreply@localhost',
  logoUrl: '',
  brandColor: '#e91e63',
};

function render(template: string, data: Record<string, string>, locale = 'en') {
  return renderTemplate(template, data, locale, TEST_BRANDING);
}

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
      const { html } = await render('welcome', { appUrl: 'https://example.com' });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).not.toContain('{{CONTENT}}');
      expect(html).not.toContain('{{SITE_NAME}}');
      expect(html).not.toContain('{{SITE_URL}}');
      expect(html).not.toContain('{{BRAND_COLOR}}');
      expect(html).not.toContain('{{HEADER_BLOCK}}');
      expect(html).not.toContain('{{PREHEADER_BLOCK}}');
    });

    it('renders text-only header when no logo configured', async () => {
      const { html } = await render('welcome', { appUrl: 'https://example.com' });

      expect(html).toContain('font-size:20px');
      expect(html).toContain('font-weight:700');
      expect(html).not.toContain('<img');
    });
  });

  describe('subject extraction', () => {
    it('extracts subject from <!-- subject: ... --> comment', async () => {
      const { subject } = await render('password-reset', {
        name: 'Alice',
        resetUrl: 'https://example.com/reset',
      });

      expect(subject).toContain('Reset your');
      expect(subject).toContain('password');
    });

    it('interpolates variables in subject line', async () => {
      const { subject } = await render('invitation', {
        organizationName: 'Acme Corp',
        inviteUrl: 'https://example.com/invite',
      });

      expect(subject).toContain('Acme Corp');
    });
  });

  describe('preheader injection', () => {
    it('injects hidden preheader span when template has preheader', async () => {
      const { html } = await render('verify-email', {
        name: 'Bob',
        verifyUrl: 'https://example.com/verify',
      });

      expect(html).toContain('display:none');
      expect(html).toContain('One quick step to activate your account');
    });

    it('does not inject preheader span when subject comment is removed', async () => {
      const { html: html1 } = await render('verify-email', {
        name: 'A', verifyUrl: 'https://x.com',
      });
      const { html: html2 } = await render('password-reset', {
        name: 'A', resetUrl: 'https://x.com',
      });

      expect(html1).toContain('One quick step');
      expect(html1).not.toContain('Click the link to set a new password');
      expect(html2).toContain('Click the link to set a new password');
      expect(html2).not.toContain('One quick step');
    });
  });

  describe('HTML escaping', () => {
    it('escapes {{key}} double-brace values', async () => {
      const { html } = await render('verify-email', {
        name: '<script>alert("xss")</script>',
        verifyUrl: 'https://example.com/verify',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('does NOT escape {{{key}}} triple-brace values (URLs)', async () => {
      const url = 'https://example.com/verify?token=abc&user=1';
      const { html } = await render('verify-email', {
        name: 'Bob',
        verifyUrl: url,
      });

      expect(html).toContain(`href="${url}"`);
      expect(html).toContain('token=abc&user=1');
    });
  });

  describe('branding injection', () => {
    it('injects provided branding', async () => {
      const { html } = await render('welcome', {
        appUrl: 'https://example.com',
      });

      expect(html).toContain('#e91e63');
      expect(html).toContain('Indigo');
    });
  });

  describe('locale fallback', () => {
    it('renders en template when requested locale does not exist', async () => {
      const { subject } = await render('welcome', {
        appUrl: 'https://example.com',
      }, 'de');

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
