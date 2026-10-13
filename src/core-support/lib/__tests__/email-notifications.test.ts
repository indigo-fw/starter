import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_MAX_CHARS,
  buildPreview,
  customerTicketUrl,
  notifyCustomerStaffReply,
  notifyStaffCustomerReply,
  notifyStaffNewTicket,
  resolveCustomerLocale,
  staffTicketUrl,
} from '@/core-support/lib/email-notifications';

// vi.mock factories are hoisted above module-level consts; vi.hoisted keeps these ahead of them.
const { mockDeps, mockLogger } = vi.hoisted(() => ({
  mockDeps: {
    enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
    getSupportEmail: vi.fn().mockResolvedValue('support@example.com'),
  },
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/core-support/deps', () => ({
  getSupportDeps: () => mockDeps,
  setSupportDeps: vi.fn(),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('@/lib/constants', () => ({
  DEFAULT_LOCALE: 'en',
  LOCALES: ['en', 'de'],
}));

const TICKET_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const CUSTOMER = { name: 'Alice', email: 'alice@example.com', lang: 'de' };

describe('email-notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeps.getSupportEmail.mockResolvedValue('support@example.com');
    mockDeps.enqueueTemplateEmail.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
  });

  describe('buildPreview', () => {
    it('collapses whitespace and truncates to the preview limit with an ellipsis', () => {
      const long = `line one\n\nline two ${'x'.repeat(PREVIEW_MAX_CHARS)}`;
      const preview = buildPreview(long);
      expect(preview).not.toContain('\n');
      expect(preview.startsWith('line one line two')).toBe(true);
      expect(preview.length).toBe(PREVIEW_MAX_CHARS + 1);
      expect(preview.endsWith('…')).toBe(true);
    });

    it('leaves short text untouched', () => {
      expect(buildPreview('  hello  ')).toBe('hello');
    });
  });

  describe('locale + urls', () => {
    it('falls back to the default locale for unknown or missing lang', () => {
      expect(resolveCustomerLocale('de')).toBe('de');
      expect(resolveCustomerLocale('xx')).toBe('en');
      expect(resolveCustomerLocale(null)).toBe('en');
    });

    it('prefixes non-default locales on the customer url and never on the staff url', () => {
      expect(customerTicketUrl(TICKET_ID, 'de')).toBe(
        `https://app.example.com/de/account/support/${TICKET_ID}`
      );
      expect(customerTicketUrl(TICKET_ID, 'en')).toBe(
        `https://app.example.com/account/support/${TICKET_ID}`
      );
      expect(staffTicketUrl(TICKET_ID)).toBe(
        `https://app.example.com/dashboard/settings/support/${TICKET_ID}`
      );
    });
  });

  describe('notifyStaffNewTicket', () => {
    it('emails the configured support inbox in the default locale', async () => {
      await notifyStaffNewTicket({
        ticketId: TICKET_ID,
        subject: 'Login broken',
        priority: 'high',
        body: 'I cannot log in',
        customer: CUSTOMER,
      });

      expect(mockDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'support@example.com',
        'support-ticket-new',
        expect.objectContaining({
          subject: 'Login broken',
          priority: 'high',
          customerName: 'Alice',
          customerEmail: 'alice@example.com',
          preview: 'I cannot log in',
          ticketUrl: staffTicketUrl(TICKET_ID),
        }),
        'en'
      );
    });

    it('skips with a warning when no support email is configured', async () => {
      mockDeps.getSupportEmail.mockResolvedValue(null);

      await notifyStaffNewTicket({
        ticketId: TICKET_ID,
        subject: 's',
        priority: 'normal',
        body: 'b',
        customer: CUSTOMER,
      });

      expect(mockDeps.enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No support email'),
        expect.objectContaining({ ticketId: TICKET_ID })
      );
    });

    it('logs instead of throwing when the queue rejects', async () => {
      mockDeps.enqueueTemplateEmail.mockRejectedValue(new Error('redis down'));

      await expect(
        notifyStaffNewTicket({
          ticketId: TICKET_ID,
          subject: 's',
          priority: 'normal',
          body: 'b',
          customer: CUSTOMER,
        })
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('staff ticket email'),
        expect.objectContaining({
          error: expect.stringContaining('redis down'),
        })
      );
    });
  });

  describe('notifyStaffCustomerReply', () => {
    it('emails the support inbox with the reply template', async () => {
      await notifyStaffCustomerReply({
        ticketId: TICKET_ID,
        subject: 'Login broken',
        body: 'Still broken',
        customer: CUSTOMER,
      });

      expect(mockDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'support@example.com',
        'support-ticket-reply',
        expect.objectContaining({
          preview: 'Still broken',
          customerEmail: 'alice@example.com',
        }),
        'en'
      );
    });
  });

  describe('notifyCustomerStaffReply', () => {
    it('emails the customer in their language with a localized ticket link', async () => {
      await notifyCustomerStaffReply({
        ticketId: TICKET_ID,
        subject: 'Login broken',
        body: 'We fixed it',
        customer: CUSTOMER,
      });

      expect(mockDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'support-ticket-answer',
        expect.objectContaining({
          name: 'Alice',
          subject: 'Login broken',
          preview: 'We fixed it',
          ticketUrl: `https://app.example.com/de/account/support/${TICKET_ID}`,
        }),
        'de'
      );
      expect(mockDeps.getSupportEmail).not.toHaveBeenCalled();
    });

    it('uses the default locale when the customer never picked one', async () => {
      await notifyCustomerStaffReply({
        ticketId: TICKET_ID,
        subject: 's',
        body: 'b',
        customer: { ...CUSTOMER, name: null, lang: null },
      });

      expect(mockDeps.enqueueTemplateEmail).toHaveBeenCalledWith(
        'alice@example.com',
        'support-ticket-answer',
        expect.objectContaining({
          name: '',
          ticketUrl: expect.not.stringContaining('/de/'),
        }),
        'en'
      );
    });

    it('logs instead of throwing when the queue rejects', async () => {
      mockDeps.enqueueTemplateEmail.mockRejectedValue(new Error('boom'));

      await expect(
        notifyCustomerStaffReply({
          ticketId: TICKET_ID,
          subject: 's',
          body: 'b',
          customer: CUSTOMER,
        })
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('customer ticket email'),
        expect.objectContaining({ ticketId: TICKET_ID })
      );
    });
  });
});
