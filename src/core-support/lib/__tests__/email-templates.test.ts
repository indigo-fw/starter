/**
 * Renders the shipped support templates through the real layout so a broken
 * placeholder or missing subject comment fails here, not in a customer inbox.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { TICKET_EMAIL_TEMPLATES } from '@/core-support/lib/email-notifications';
import { renderTemplate } from '@/core/lib/email';
import type { EmailBranding } from '@/core/lib/email';

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
  default: { createTransport: vi.fn(), getTestMessageUrl: vi.fn() },
}));

const BRANDING: EmailBranding = {
  siteName: 'Indigo',
  siteUrl: 'http://localhost:3000',
  contactEmail: 'noreply@localhost',
  logoUrl: '',
  brandColor: '#e91e63',
};

const TICKET_URL = 'https://app.example.com/dashboard/settings/support/t-1';

function render(template: string, data: Record<string, string>) {
  return renderTemplate(template, data, 'en', BRANDING);
}

describe('support email templates', () => {
  it('ships every template both installed (emails/en) and as the module source (_templates/emails)', () => {
    for (const name of Object.values(TICKET_EMAIL_TEMPLATES)) {
      const installed = path.join(
        process.cwd(),
        'emails',
        'en',
        `${name}.html`
      );
      const source = path.join(
        process.cwd(),
        'src',
        'core-support',
        '_templates',
        'emails',
        `${name}.html`
      );
      expect(fs.existsSync(installed), installed).toBe(true);
      expect(fs.existsSync(source), source).toBe(true);
      expect(fs.readFileSync(installed, 'utf-8')).toBe(
        fs.readFileSync(source, 'utf-8')
      );
    }
  });

  it('renders the staff new-ticket email with subject, preview and link', async () => {
    const { subject, html } = await render(
      TICKET_EMAIL_TEMPLATES.staffNewTicket,
      {
        subject: 'Login <broken>',
        priority: 'high',
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
        preview: 'I cannot log in',
        ticketUrl: TICKET_URL,
      }
    );

    expect(subject).toBe('New support ticket: Login <broken>');
    expect(html).toContain('Login &lt;broken&gt;');
    expect(html).toContain('alice@example.com');
    expect(html).toContain('I cannot log in');
    expect(html).toContain(`href="${TICKET_URL}"`);
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('falls back to a generic name when the customer has none', async () => {
    const { html } = await render(TICKET_EMAIL_TEMPLATES.staffCustomerReply, {
      subject: 's',
      customerName: '',
      customerEmail: 'alice@example.com',
      preview: 'p',
      ticketUrl: TICKET_URL,
    });

    expect(html).toContain('A customer');
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('renders the customer answer email', async () => {
    const { subject, html } = await render(
      TICKET_EMAIL_TEMPLATES.customerStaffReply,
      {
        name: '',
        subject: 'Login broken',
        preview: 'We fixed it',
        ticketUrl: 'https://app.example.com/de/account/support/t-1',
      }
    );

    expect(subject).toBe('New reply on your ticket: Login broken');
    expect(html).toContain('Hi there');
    expect(html).toContain('We fixed it');
    expect(html).toContain('/de/account/support/t-1');
    expect(html).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
