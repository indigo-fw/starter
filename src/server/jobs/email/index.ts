import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

import { inArray } from 'drizzle-orm';

import { db as appDb } from '@/server/db';
import { cmsOptions } from '@/server/db/schema';
import { createQueue, createWorker } from '@/core/lib/queue';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('Email');

// ---------------------------------------------------------------------------
// Template types
// ---------------------------------------------------------------------------

export type TemplateName =
  | 'welcome'
  | 'verify-email'
  | 'password-reset'
  | 'invitation'
  | 'payment-failed'
  | 'subscription-activated'
  | 'subscription-expiring'
  | 'subscription-expired'
  | 'subscription-canceled';

export const TEMPLATE_NAMES: TemplateName[] = [
  'welcome',
  'verify-email',
  'password-reset',
  'invitation',
  'payment-failed',
  'subscription-activated',
  'subscription-expiring',
  'subscription-expired',
  'subscription-canceled',
];

// ---------------------------------------------------------------------------
// Email job payload (carried through the queue)
// ---------------------------------------------------------------------------

interface EmailJob {
  to: string;
  template: TemplateName;
  data: Record<string, string>;
  locale: string;
}

interface RawEmailJob {
  to: string;
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Transport (singleton — reuse SMTP connection)
// ---------------------------------------------------------------------------

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@localhost';
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let _transport: Mail | null = null;

function getTransport(): Mail | null {
  if (_transport) return _transport;
  if (!SMTP_HOST) return null;

  _transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth:
      SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return _transport;
}

// ---------------------------------------------------------------------------
// Layout loader (lazy singleton — zero repeated I/O)
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === 'development';

let _layoutHtml: string | null = null;

function loadLayout(): string {
  if (_layoutHtml && !isDev) return _layoutHtml;
  const layoutPath = path.join(process.cwd(), 'emails/layout.html');
  _layoutHtml = fs.readFileSync(layoutPath, 'utf-8');
  return _layoutHtml;
}

// ---------------------------------------------------------------------------
// Template file loader with locale fallback + caching
// ---------------------------------------------------------------------------

interface ParsedTemplate {
  subject: string;
  preheader: string;
  body: string;
}

const COMMENT_RE = /^<!--\s*(subject|preheader):\s*(.*?)\s*-->\n?/gm;

const _templateCache = new Map<string, ParsedTemplate>();

/**
 * Load and parse an email template file.
 * Extracts `<!-- subject: ... -->` and `<!-- preheader: ... -->` HTML comments.
 * The remaining content is the body.
 */
function loadTemplateFile(template: string, locale = 'en'): ParsedTemplate {
  const cacheKey = `${locale}:${template}`;
  if (!isDev) {
    const cached = _templateCache.get(cacheKey);
    if (cached) return cached;
  }

  const emailsDir = path.join(process.cwd(), 'emails');
  const localePath = path.join(emailsDir, locale, `${template}.html`);

  let raw: string;
  if (locale !== 'en' && !fs.existsSync(localePath)) {
    const fallbackPath = path.join(emailsDir, 'en', `${template}.html`);
    raw = fs.readFileSync(fallbackPath, 'utf-8');
  } else {
    raw = fs.readFileSync(localePath, 'utf-8');
  }

  let subject = '';
  let preheader = '';
  const body = raw.replace(COMMENT_RE, (_match, key: string, value: string) => {
    if (key === 'subject') subject = value;
    if (key === 'preheader') preheader = value;
    return '';
  });

  if (!subject) {
    logger.warn(`Template "${template}" missing <!-- subject: ... --> comment`);
  }

  const parsed: ParsedTemplate = { subject, preheader, body };
  _templateCache.set(cacheKey, parsed);
  return parsed;
}

// ---------------------------------------------------------------------------
// Branding (DB options with fallbacks)
// ---------------------------------------------------------------------------

interface EmailBranding {
  siteName: string;
  siteUrl: string;
  contactEmail: string;
  logoUrl: string;
  brandColor: string;
}

const BRANDING_CACHE_TTL = 5 * 60_000; // 5 minutes
let _brandingCache: { data: EmailBranding; expiry: number } | null = null;

async function getBranding(): Promise<EmailBranding> {
  if (_brandingCache && Date.now() < _brandingCache.expiry) {
    return _brandingCache.data;
  }

  const keys = [
    'site.name',
    'site.url',
    'site.logo',
    'email.site_name',
    'email.site_url',
    'email.contact_email',
    'email.logo_url',
    'email.brand_color',
  ];

  const opts: Record<string, string> = {};
  let dbSuccess = false;
  try {
    const rows = await appDb
      .select({ key: cmsOptions.key, value: cmsOptions.value })
      .from(cmsOptions)
      .where(inArray(cmsOptions.key, keys))
      .limit(keys.length);
    for (const row of rows) {
      opts[row.key] = typeof row.value === 'string' ? row.value : String(row.value ?? '');
    }
    dbSuccess = true;
  } catch {
    // DB not available — use fallbacks, don't cache
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const siteName = opts['email.site_name'] || opts['site.name'] || 'Indigo';
  const siteUrl = opts['email.site_url'] || opts['site.url'] || appUrl;
  const contactEmail = opts['email.contact_email'] || FROM_EMAIL;
  const brandColor = opts['email.brand_color'] || '#e91e63';

  let logoUrl: string;
  const logoValue = opts['email.logo_url'] || opts['site.logo'] || '';
  if (!logoValue) {
    logoUrl = '';
  } else if (/^https?:\/\//i.test(logoValue)) {
    logoUrl = logoValue;
  } else {
    logoUrl = `${siteUrl.replace(/\/+$/, '')}/${logoValue.replace(/^\/+/, '')}`;
  }

  const branding = { siteName, siteUrl, contactEmail, logoUrl, brandColor };
  if (dbSuccess) {
    _brandingCache = { data: branding, expiry: Date.now() + BRANDING_CACHE_TTL };
  }
  return branding;
}

// ---------------------------------------------------------------------------
// Layout application
// ---------------------------------------------------------------------------

function applyLayout(
  content: string,
  branding: EmailBranding,
  preheader: string,
): string {
  const preheaderBlock = preheader
    ? `<span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;mso-hide:all;overflow:hidden">${preheader}&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</span>`
    : '';

  // Show logo image when configured, text-only header otherwise
  const headerBlock = branding.logoUrl
    ? `<a href="${branding.siteUrl}" target="_blank" style="color:${branding.brandColor}; text-decoration:none; display:block"><img src="${branding.logoUrl}" alt="${branding.siteName}" height="40" style="border:0; display:block; margin:0 auto; max-width:100%"></a>`
    : `<a href="${branding.siteUrl}" target="_blank" style="color:${branding.brandColor}; text-decoration:none; font-size:20px; font-weight:700">${branding.siteName}</a>`;

  return loadLayout()
    .replace(/\{\{SITE_NAME\}\}/g, branding.siteName)
    .replace(/\{\{SITE_URL\}\}/g, branding.siteUrl)
    .replace(/\{\{CONTACT_EMAIL\}\}/g, branding.contactEmail)
    .replace(/\{\{BRAND_COLOR\}\}/g, branding.brandColor)
    .replace(/\{\{HEADER_BLOCK\}\}/g, headerBlock)
    .replace(/\{\{PREHEADER_BLOCK\}\}/g, preheaderBlock)
    .replace(/\{\{CONTENT\}\}/g, content);
}

// ---------------------------------------------------------------------------
// Template rendering (HTML escaping + placeholder replacement)
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replacePlaceholders(
  text: string,
  vars: Record<string, string>,
  escape = true,
): string {
  // {{{key}}} — triple braces = raw (unescaped), like Handlebars
  let result = text.replace(
    /\{\{\{(\w+)\}\}\}/g,
    (_match, key: string) => vars[key] ?? _match,
  );

  // {{key}} or {{key|fallback}} — double braces = escaped (when escape=true)
  result = result.replace(
    /\{\{(\w+)(?:\|([^}]*))?\}\}/g,
    (_match, key: string, fallback?: string) => {
      const value = vars[key];
      if (value !== undefined && value !== '')
        return escape ? escapeHtml(value) : value;
      if (fallback === undefined) return _match;
      const resolved = vars[fallback] || fallback;
      return escape ? escapeHtml(resolved) : resolved;
    },
  );

  return result;
}

/**
 * Render a template to final HTML with branding layout.
 * Checks DB overrides first, falls back to file-based templates.
 */
export async function renderTemplate(
  template: TemplateName,
  data: Record<string, string>,
  locale = 'en',
): Promise<{ subject: string; html: string }> {
  const branding = await getBranding();

  const vars: Record<string, string> = {
    siteName: branding.siteName,
    siteUrl: branding.siteUrl,
    contactEmail: branding.contactEmail,
    brandColor: branding.brandColor,
    ...data,
  };

  // 1. Check for DB override (locale-specific first, then default)
  let subject: string;
  let content: string;
  let preheader = '';

  try {
    // Try locale-specific key first, fall back to base key
    const localeKey = `email.template.${locale}.${template}`;
    const baseKey = `email.template.en.${template}`;
    const keysToCheck = locale !== 'en' ? [localeKey, baseKey] : [baseKey];

    const rows = await appDb
      .select({ key: cmsOptions.key, value: cmsOptions.value })
      .from(cmsOptions)
      .where(inArray(cmsOptions.key, keysToCheck))
      .limit(keysToCheck.length);

    // Prefer locale-specific override
    const row = rows.find((r) => r.key === localeKey) ?? rows.find((r) => r.key === baseKey);

    if (row?.value) {
      const override = row.value as { subject?: string; html?: string };
      if (override.html) {
        content = replacePlaceholders(override.html, vars);
        subject = override.subject
          ? replacePlaceholders(override.subject, vars, false)
          : template;
        const html = applyLayout(content, branding, '');
        return { subject, html };
      }
    }
  } catch {
    // DB not available — fall through to file
  }

  // 2. Fall back to file-based template
  const parsed = loadTemplateFile(template, locale);
  content = replacePlaceholders(parsed.body, vars);
  subject = replacePlaceholders(parsed.subject, vars, false);
  preheader = parsed.preheader
    ? replacePlaceholders(parsed.preheader, vars, false)
    : '';
  const html = applyLayout(content, branding, preheader);

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Send email via SMTP
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    throw new Error('SMTP not configured (set SMTP_HOST)');
  }

  const info = await transport.sendMail({
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  });

  // Ethereal provides a preview URL for each sent email
  const previewUrl = nodemailer.getTestMessageUrl(info);
  logger.info(`Sent to ${to}: "${subject}"`);
  if (previewUrl) {
    logger.info(`Preview URL: ${previewUrl}`);
  }
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const emailQueue = createQueue('email');

/**
 * Enqueue a templated email.
 * Validates recipients, carries locale through the queue for template resolution.
 */
export async function enqueueTemplateEmail(
  to: string | string[],
  template: TemplateName,
  vars: Record<string, string>,
  locale = 'en',
): Promise<void> {
  const recipients = Array.isArray(to) ? to : [to];
  const valid = recipients.filter((e) => EMAIL_RE.test(e.trim()));

  if (valid.length === 0) {
    logger.warn('No valid recipients, skipping enqueue', { template, to: recipients });
    return;
  }

  if (emailQueue) {
    await emailQueue.add('send-template', {
      to: valid.join(','),
      template,
      data: vars,
      locale,
    } satisfies EmailJob, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 5 * 60_000 },
    });
  } else {
    // No Redis — render and send synchronously in dev
    logger.info(`Sending directly (no Redis): ${template} -> ${valid.join(', ')}`);
    const { subject, html } = await renderTemplate(template, vars, locale);
    await sendEmail(valid, subject, html);
  }
}

/**
 * Enqueue a raw HTML email (e.g. form submission notifications).
 * No template rendering — HTML is pre-built by the caller.
 */
export async function enqueueEmail(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!EMAIL_RE.test(payload.to.trim())) {
    logger.warn('Invalid recipient, skipping enqueue', { to: payload.to });
    return;
  }

  if (emailQueue) {
    await emailQueue.add('send-raw', payload satisfies RawEmailJob, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 5 * 60_000 },
    });
  } else {
    logger.info(`Sending directly (no Redis): ${payload.subject} -> ${payload.to}`);
    await sendEmail(payload.to, payload.subject, payload.html);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Initialize email worker with rate limiting.
 * Concurrency: 5, Rate: 5 per minute (300/hour SMTP limit).
 */
export function startEmailWorker(): void {
  const worker = createWorker(
    'email',
    async (job) => {
      if (job.name === 'send-raw') {
        const raw = job.data as RawEmailJob;
        await sendEmail(raw.to, raw.subject, raw.html);
        logger.info('Raw email sent', { to: raw.to, subject: raw.subject });
        return;
      }

      // Template email
      const { to, template, data, locale } = job.data as EmailJob;
      const { subject, html } = await renderTemplate(
        template as TemplateName,
        data,
        locale,
      );

      const recipients = to.includes(',') ? to.split(',').map((e) => e.trim()) : to;
      await sendEmail(recipients, subject, html);

      logger.info('Email sent', {
        template,
        recipientCount: Array.isArray(recipients) ? recipients.length : 1,
      });
    },
    5,
    { limiter: { max: 5, duration: 60_000 } },
  );

  if (worker) {
    logger.info('Email worker started (concurrency: 5, rate: 5/min)');
  }
}
