/**
 * Email template engine — file-based templates with placeholder replacement.
 *
 * No DB dependency. Branding is passed as a parameter from the DI layer.
 */

import fs from 'node:fs';
import path from 'node:path';

import { createLogger } from '../infra/logger';

const logger = createLogger('Email');
const isDev = process.env.NODE_ENV === 'development';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailBranding {
  siteName: string;
  siteUrl: string;
  contactEmail: string;
  logoUrl: string;
  brandColor: string;
}

export interface ParsedTemplate {
  subject: string;
  preheader: string;
  body: string;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Placeholder replacement
// ---------------------------------------------------------------------------

/**
 * Replace template placeholders.
 * - `{{{key}}}` — raw (unescaped), like Handlebars
 * - `{{key}}` or `{{key|fallback}}` — escaped (when escape=true)
 */
export function replacePlaceholders(
  text: string,
  vars: Record<string, string>,
  escape = true,
): string {
  // Triple braces = raw
  let result = text.replace(
    /\{\{\{(\w+)\}\}\}/g,
    (_match, key: string) => vars[key] ?? _match,
  );

  // Double braces = escaped (with optional fallback)
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

// ---------------------------------------------------------------------------
// Template file loader (with locale fallback + caching)
// ---------------------------------------------------------------------------

const COMMENT_RE = /^<!--\s*(subject|preheader):\s*(.*?)\s*-->\n?/gm;
const _templateCache = new Map<string, ParsedTemplate>();

/**
 * Load and parse an email template file.
 * Extracts `<!-- subject: ... -->` and `<!-- preheader: ... -->` HTML comments.
 */
export function loadTemplateFile(
  template: string,
  locale = 'en',
  templatesDir?: string,
): ParsedTemplate {
  const cacheKey = `${locale}:${template}`;
  if (!isDev) {
    const cached = _templateCache.get(cacheKey);
    if (cached) return cached;
  }

  const emailsDir = templatesDir ?? path.join(process.cwd(), 'emails');
  const templatePath = path.join(emailsDir, locale, `${template}.html`);

  let raw: string;
  if (locale !== 'en' && !fs.existsSync(templatePath)) {
    const fallbackPath = path.join(emailsDir, 'en', `${template}.html`);
    raw = fs.readFileSync(fallbackPath, 'utf-8');
  } else {
    raw = fs.readFileSync(templatePath, 'utf-8');
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
// Layout application
// ---------------------------------------------------------------------------

let _layoutHtml: string | null = null;

function loadLayout(templatesDir?: string): string {
  if (_layoutHtml && !isDev) return _layoutHtml;
  const layoutPath = path.join(
    templatesDir ?? path.join(process.cwd(), 'emails'),
    'layout.html',
  );
  _layoutHtml = fs.readFileSync(layoutPath, 'utf-8');
  return _layoutHtml;
}

/**
 * Apply the layout wrapper to email body content.
 * Extra layout vars (e.g. {{YEAR}}, {{UNSUBSCRIBE_URL}}) are replaced after branding.
 */
export function applyLayout(
  content: string,
  branding: EmailBranding,
  preheader: string,
  templatesDir?: string,
  extraLayoutVars?: Record<string, string>,
): string {
  const preheaderBlock = preheader
    ? `<span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;mso-hide:all;overflow:hidden">${preheader}&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</span>`
    : '';

  const headerBlock = branding.logoUrl
    ? `<a href="${branding.siteUrl}" target="_blank" style="color:${branding.brandColor}; text-decoration:none; display:block"><img src="${branding.logoUrl}" alt="${branding.siteName}" height="40" style="border:0; display:block; margin:0 auto; max-width:100%"></a>`
    : `<a href="${branding.siteUrl}" target="_blank" style="color:${branding.brandColor}; text-decoration:none; font-size:20px; font-weight:700">${branding.siteName}</a>`;

  let html = loadLayout(templatesDir)
    .replace(/\{\{SITE_NAME\}\}/g, branding.siteName)
    .replace(/\{\{SITE_URL\}\}/g, branding.siteUrl)
    .replace(/\{\{CONTACT_EMAIL\}\}/g, branding.contactEmail)
    .replace(/\{\{BRAND_COLOR\}\}/g, branding.brandColor)
    .replace(/\{\{HEADER_BLOCK\}\}/g, headerBlock)
    .replace(/\{\{PREHEADER_BLOCK\}\}/g, preheaderBlock)
    .replace(/\{\{CONTENT\}\}/g, content);

  // Apply extra layout vars from project (e.g. {{YEAR}}, {{UNSUBSCRIBE_URL}})
  if (extraLayoutVars) {
    for (const [key, value] of Object.entries(extraLayoutVars)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
  }

  return html;
}

// ---------------------------------------------------------------------------
// Full render
// ---------------------------------------------------------------------------

/**
 * Render a template with branding + data to final { subject, html }.
 * Optionally checks a DB override via `getTemplateOverride` callback.
 */
export async function renderTemplate(
  template: string,
  data: Record<string, string>,
  locale: string,
  branding: EmailBranding,
  options?: {
    templatesDir?: string;
    getTemplateOverride?: (template: string, locale: string) => Promise<{ subject: string; html: string } | null>;
    extraLayoutVars?: Record<string, string>;
  },
): Promise<{ subject: string; html: string }> {
  const vars: Record<string, string> = {
    siteName: branding.siteName,
    siteUrl: branding.siteUrl,
    contactEmail: branding.contactEmail,
    brandColor: branding.brandColor,
    ...data,
  };

  // 1. Check for DB override
  if (options?.getTemplateOverride) {
    try {
      const override = await options.getTemplateOverride(template, locale);
      if (override) {
        const content = replacePlaceholders(override.html, vars);
        const subject = replacePlaceholders(override.subject, vars, false);
        const html = applyLayout(content, branding, '', options?.templatesDir, options?.extraLayoutVars);
        return { subject, html };
      }
    } catch {
      // DB not available — fall through to file
    }
  }

  // 2. Fall back to file-based template
  const parsed = loadTemplateFile(template, locale, options?.templatesDir);
  const content = replacePlaceholders(parsed.body, vars);
  const subject = replacePlaceholders(parsed.subject, vars, false);
  const preheader = parsed.preheader
    ? replacePlaceholders(parsed.preheader, vars, false)
    : '';
  const html = applyLayout(content, branding, preheader, options?.templatesDir, options?.extraLayoutVars);

  return { subject, html };
}
