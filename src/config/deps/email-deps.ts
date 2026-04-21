/**
 * Email dependency injection — provides branding + template overrides from CMS.
 */

import { inArray } from 'drizzle-orm';

import { db as appDb } from '@/server/db';
import { cmsOptions } from '@/server/db/schema';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { setEmailDeps, FROM_EMAIL } from '@/core/lib/email';
import type { EmailBranding } from '@/core/lib/email';

// ---------------------------------------------------------------------------
// Branding (DB options with fallbacks, 5-min cache)
// ---------------------------------------------------------------------------

const BRANDING_CACHE_TTL = 5 * 60_000;
let _brandingCache: { data: EmailBranding; expiry: number } | null = null;

async function getBranding(): Promise<EmailBranding> {
  if (_brandingCache && Date.now() < _brandingCache.expiry) {
    return _brandingCache.data;
  }

  const keys = [
    'site.name', 'site.url', 'site.logo',
    'email.site_name', 'email.site_url', 'email.contact_email',
    'email.logo_url', 'email.brand_color',
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
// Template overrides from CMS
// ---------------------------------------------------------------------------

async function getTemplateOverride(
  template: string,
  locale: string,
): Promise<{ subject: string; html: string } | null> {
  const localeKey = `email.template.${locale}.${template}`;
  const baseKey = `email.template.${DEFAULT_LOCALE}.${template}`;
  const keysToCheck = locale !== DEFAULT_LOCALE ? [localeKey, baseKey] : [baseKey];

  const rows = await appDb
    .select({ key: cmsOptions.key, value: cmsOptions.value })
    .from(cmsOptions)
    .where(inArray(cmsOptions.key, keysToCheck))
    .limit(keysToCheck.length);

  const row = rows.find((r) => r.key === localeKey) ?? rows.find((r) => r.key === baseKey);

  if (row?.value) {
    const override = row.value as { subject?: string; html?: string };
    if (override.html) {
      return {
        subject: override.subject ?? template,
        html: override.html,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

setEmailDeps({
  getBranding,
  getTemplateOverride,
});
