/**
 * Content variable resolution — replaces %VAR% placeholders in CMS content
 * with values from the options registry (dashboard-editable) at render time.
 *
 * Syntax: %COMPANY_NAME%, %SITE_NAME%, etc.
 * Distinct from shortcodes which use brackets: [callout type="info"]
 *
 * Variables are stored as-is in the DB and resolved on every render.
 * Changing company info in Dashboard > Settings takes effect immediately.
 *
 * Variable sources:
 *   - %SITE_NAME%, %SITE_URL%: from site.* options (or env fallback)
 *   - %COMPANY_*%, %CONTACT_EMAIL%: from company.* options
 */

import { db } from '@/server/db';
import { cmsOptions } from '@/server/db/schema/cms';
import { sql } from 'drizzle-orm';
import { clientEnv, siteDefaults } from '@/config/site';

// ─── Cached Options Fetch ───────────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 1000; // 1 hour — invalidated on save via invalidateContentVarsCache()

let _cache: { vars: Record<string, string>; ts: number } | null = null;

/** Built-in option keys that map to content variables. */
const OPTION_KEYS = [
  'site.name', 'site.url',
  'company.name', 'company.address', 'company.id',
  'company.jurisdiction', 'company.contact_email',
  'company.vat', 'company.phone', 'company.country',
  'company.support_email',
] as const;

async function fetchVarsFromDb(): Promise<Record<string, string>> {
  try {
    const rows = await db
      .select({ key: cmsOptions.key, value: cmsOptions.value })
      .from(cmsOptions)
      .where(
        // Fetch built-in option keys + any custom variable keys (var.*)
        sql`${cmsOptions.key} = ANY(${[...OPTION_KEYS]}) OR ${cmsOptions.key} LIKE 'var.%'`
      )
      .limit(200);

    const opts: Record<string, string> = {};
    for (const row of rows) {
      if (typeof row.value === 'string') opts[row.key] = row.value;
    }
    return opts;
  } catch {
    // DB not available (build time, CLI without DB) — return empty
    return {};
  }
}

function buildVarMap(opts: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {
    // Site
    SITE_NAME: opts['site.name'] || clientEnv.siteName,
    SITE_URL: opts['site.url'] || clientEnv.appUrl,
    // Company
    COMPANY_NAME: opts['company.name'] || siteDefaults.companyName,
    COMPANY_ADDRESS: opts['company.address'] || siteDefaults.companyAddress,
    COMPANY_ID: opts['company.id'] || siteDefaults.companyId,
    COMPANY_JURISDICTION: opts['company.jurisdiction'] || siteDefaults.companyJurisdiction,
    CONTACT_EMAIL: opts['company.contact_email'] || siteDefaults.contactEmail,
    COMPANY_VAT: opts['company.vat'] || siteDefaults.companyVat,
    COMPANY_PHONE: opts['company.phone'] || siteDefaults.companyPhone,
    COMPANY_COUNTRY: opts['company.country'] || siteDefaults.companyCountry,
    SUPPORT_EMAIL: opts['company.support_email'] || siteDefaults.supportEmail || opts['company.contact_email'] || siteDefaults.contactEmail,
    // Auto-generated
    CURRENT_YEAR: new Date().getFullYear().toString(),
  };

  // Custom variables: var.MY_THING → %MY_THING%
  for (const [key, value] of Object.entries(opts)) {
    if (key.startsWith('var.')) {
      vars[key.slice(4).toUpperCase()] = value;
    }
  }

  return vars;
}

/**
 * Get the current variable map (cached, async).
 * Fetches from DB on first call and after TTL expiry.
 */
async function getVarsAsync(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_cache && now - _cache.ts < CACHE_TTL) return _cache.vars;

  const opts = await fetchVarsFromDb();
  const vars = buildVarMap(opts);
  _cache = { vars, ts: now };
  return vars;
}

/**
 * Get the variable map synchronously (uses last cached value or static fallbacks).
 * Used by synchronous render paths (ShortcodeRenderer, etc.).
 */
function getVarsSync(): Record<string, string> {
  if (_cache) return _cache.vars;
  // No cache yet — return static fallbacks, async fetch will populate cache
  return buildVarMap({});
}

const INVALIDATION_CHANNEL = 'content-vars:invalidate';
let _publisher: import('ioredis').default | null | undefined;

/**
 * Invalidate the content variables cache locally AND across all instances (via Redis pub/sub).
 * Called by the options router when settings are saved.
 */
export function invalidateContentVarsCache(): void {
  _cache = null;
  // Broadcast to other instances (fire-and-forget, no-op without Redis)
  if (_publisher) _publisher.publish(INVALIDATION_CHANNEL, '1').catch(() => {});
}

/**
 * Initialize cross-instance cache invalidation via Redis pub/sub.
 * Call once at server startup. No-op without Redis.
 * Sets up both the publisher (for invalidateContentVarsCache) and
 * the subscriber (to receive invalidation signals from other instances).
 */
export async function initContentVarsSync(): Promise<void> {
  try {
    const { getPublisher, getSubscriber } = await import('@/core/lib/infra/redis');
    _publisher = getPublisher();

    const sub = getSubscriber();
    if (!sub) return;
    await sub.subscribe(INVALIDATION_CHANNEL);
    sub.on('message', (channel: string) => {
      if (channel === INVALIDATION_CHANNEL) _cache = null;
    });
  } catch {
    // Redis not available — local invalidation only
  }
}

// ─── Variable Definitions (for editor toolbar) ─────────────────────────────

/** Variable definition for UI display (editor toolbar, documentation). */
export interface ContentVarDef {
  key: string;
  label: string;
  value: string;
}

/** Built-in variable definitions with human-readable labels. */
const BUILTIN_VAR_LABELS: Record<string, string> = {
  SITE_NAME: 'Site Name',
  SITE_URL: 'Site URL',
  COMPANY_NAME: 'Company Name',
  COMPANY_ADDRESS: 'Company Address',
  COMPANY_ID: 'Company ID',
  COMPANY_JURISDICTION: 'Jurisdiction',
  CONTACT_EMAIL: 'Contact Email',
  COMPANY_VAT: 'VAT Number',
  COMPANY_PHONE: 'Phone',
  COMPANY_COUNTRY: 'Country',
  SUPPORT_EMAIL: 'Support Email',
  CURRENT_YEAR: 'Current Year',
};

/**
 * List of all available content variables with labels and current values.
 * Includes built-in variables and any custom variables (var.* options).
 */
export function getContentVarDefs(): ContentVarDef[] {
  const vars = getVarsSync();
  const defs: ContentVarDef[] = [];

  for (const [key, value] of Object.entries(vars)) {
    if (!value && !BUILTIN_VAR_LABELS[key]) continue; // skip empty custom vars
    defs.push({
      key,
      label: BUILTIN_VAR_LABELS[key] ?? key, // custom vars use their key as label
      value,
    });
  }

  return defs;
}

// ─── Resolution Functions ───────────────────────────────────────────────────

/**
 * Replace %VAR% placeholders in a string (synchronous).
 * Uses cached values. Call preloadContentVars() at server startup to warm cache.
 */
export function resolveContentVars(text: string): string {
  if (!text.includes('%')) return text;
  const vars = getVarsSync();
  return text.replace(/%(\w+)%/g, (match, key) => vars[key] ?? match);
}

/**
 * Replace %VAR% placeholders in a string (async — fetches from DB if cache expired).
 * Use in async contexts (tRPC procedures, server components) for guaranteed fresh values.
 */
export async function resolveContentVarsAsync(text: string): Promise<string> {
  if (!text.includes('%')) return text;
  const vars = await getVarsAsync();
  return text.replace(/%(\w+)%/g, (match, key) => vars[key] ?? match);
}

/**
 * Resolve %VAR% placeholders in all string fields of an object (shallow).
 * Returns a new object with resolved values. Non-string fields pass through.
 */
export function resolveRecordVars<T extends Record<string, unknown>>(record: T): T {
  let hasVars = false;
  for (const val of Object.values(record)) {
    if (typeof val === 'string' && val.includes('%')) { hasVars = true; break; }
  }
  if (!hasVars) return record;

  const resolved = { ...record };
  for (const [key, val] of Object.entries(resolved)) {
    if (typeof val === 'string') {
      (resolved as Record<string, unknown>)[key] = resolveContentVars(val);
    }
  }
  return resolved;
}

/**
 * Preload the content variables cache from DB.
 * Call once at server startup so synchronous resolveContentVars() has data.
 */
export async function preloadContentVars(): Promise<void> {
  await getVarsAsync();
}
