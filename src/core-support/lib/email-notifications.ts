/**
 * Ticket email notifications — one email per event, no throttling.
 *
 * Staff mail goes to the configured support inbox (`deps.getSupportEmail`),
 * never to the customer's org: a ticket is a conversation with the operator,
 * and org admins are usually the customer themselves. Customer mail is sent in
 * the customer's UI language because a logged-out customer otherwise never
 * learns that staff answered.
 *
 * Every function here is safe to fire-and-forget: failures are logged, never
 * thrown, so a mail outage cannot fail the ticket mutation that triggered it.
 */
import { getSupportDeps } from '@/core-support/deps';
import { createLogger } from '@/core/lib/infra/logger';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';

const logger = createLogger('support-email');

export const TICKET_EMAIL_TEMPLATES = {
  staffNewTicket: 'support-ticket-new',
  staffCustomerReply: 'support-ticket-reply',
  customerStaffReply: 'support-ticket-answer',
} as const;

/** Enough to decide whether to open the ticket; the full text stays in-app. */
export const PREVIEW_MAX_CHARS = 200;

export interface TicketEmailCustomer {
  name: string | null;
  email: string;
  /** `user.lang` — null when the customer never picked a locale. */
  lang: string | null;
}

interface TicketEmailBase {
  ticketId: string;
  subject: string;
  /** Message body that triggered the notification. */
  body: string;
  customer: TicketEmailCustomer;
}

export function buildPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_MAX_CHARS
    ? `${flat.slice(0, PREVIEW_MAX_CHARS)}…`
    : flat;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
}

/** Falls back to the default locale for unknown codes so a stale `lang` never breaks rendering. */
export function resolveCustomerLocale(lang: string | null | undefined): string {
  return lang && (LOCALES as readonly string[]).includes(lang)
    ? lang
    : DEFAULT_LOCALE;
}

/** Staff ticket page — `/dashboard` is a locale-free passthrough route. */
export function staffTicketUrl(ticketId: string): string {
  return `${appUrl()}/dashboard/settings/support/${ticketId}`;
}

/** Customer ticket page — public routes carry the locale prefix except for the default locale. */
export function customerTicketUrl(ticketId: string, locale: string): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`;
  return `${appUrl()}${prefix}/account/support/${ticketId}`;
}

async function sendToStaff(
  template: string,
  vars: Record<string, string>,
  ticketId: string
): Promise<void> {
  const deps = getSupportDeps();
  try {
    const to = await deps.getSupportEmail();
    if (!to) {
      logger.warn('No support email configured; staff ticket email skipped', {
        template,
        ticketId,
      });
      return;
    }
    await deps.enqueueTemplateEmail(to, template, vars, DEFAULT_LOCALE);
  } catch (err) {
    logger.error('Failed to enqueue staff ticket email', {
      template,
      ticketId,
      error: String(err),
    });
  }
}

export async function notifyStaffNewTicket(
  params: TicketEmailBase & { priority: string }
): Promise<void> {
  await sendToStaff(
    TICKET_EMAIL_TEMPLATES.staffNewTicket,
    {
      subject: params.subject,
      priority: params.priority,
      customerName: params.customer.name ?? '',
      customerEmail: params.customer.email,
      preview: buildPreview(params.body),
      ticketUrl: staffTicketUrl(params.ticketId),
    },
    params.ticketId
  );
}

export async function notifyStaffCustomerReply(
  params: TicketEmailBase
): Promise<void> {
  await sendToStaff(
    TICKET_EMAIL_TEMPLATES.staffCustomerReply,
    {
      subject: params.subject,
      customerName: params.customer.name ?? '',
      customerEmail: params.customer.email,
      preview: buildPreview(params.body),
      ticketUrl: staffTicketUrl(params.ticketId),
    },
    params.ticketId
  );
}

export async function notifyCustomerStaffReply(
  params: TicketEmailBase
): Promise<void> {
  const deps = getSupportDeps();
  const locale = resolveCustomerLocale(params.customer.lang);
  try {
    await deps.enqueueTemplateEmail(
      params.customer.email,
      TICKET_EMAIL_TEMPLATES.customerStaffReply,
      {
        name: params.customer.name ?? '',
        subject: params.subject,
        preview: buildPreview(params.body),
        ticketUrl: customerTicketUrl(params.ticketId, locale),
      },
      locale
    );
  } catch (err) {
    logger.error('Failed to enqueue customer ticket email', {
      ticketId: params.ticketId,
      error: String(err),
    });
  }
}
