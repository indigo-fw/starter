/**
 * Content variable resolution — replaces [[VAR]] placeholders in CMS content
 * with values from the options registry (dashboard-editable) at render time.
 *
 * Syntax: [[COMPANY_NAME]], [[SITE_NAME]], etc.
 * Distinct from shortcodes which use single brackets: [callout type="info"]
 *
 * Variables are stored as-is in the DB and resolved on every render.
 * Changing company info in Dashboard > Settings takes effect immediately.
 *
 * Variable sources:
 *   - [[SITE_NAME]], [[SITE_URL]]: from site.* options (or env fallback)
 *   - [[COMPANY_*]], [[CONTACT_EMAIL]]: from company.* options
 */

import { db } from '@/server/db';
import { cmsOptions } from '@/server/db/schema/cms';
import { inArray } from 'drizzle-orm';
import { clientEnv, siteDefaults } from '@/config/site';

// ─── Cached Options Fetch ───────────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 1000; // 1 hour — invalidated on save via invalidateContentVarsCache()

let _cache: { vars: Record<string, string>; ts: number } | null = null;

const OPTION_KEYS = [
  'site.name', 'site.url',
  'company.name', 'company.address', 'company.id',
  'company.jurisdiction', 'company.contact_email',
] as const;

async function fetchVarsFromDb(): Promise<Record<string, string>> {
  try {
    const rows = await db
      .select({ key: cmsOptions.key, value: cmsOptions.value })
      .from(cmsOptions)
      .where(inArray(cmsOptions.key, [...OPTION_KEYS]))
      .limit(OPTION_KEYS.length);

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
  return {
    SITE_NAME: opts['site.name'] || clientEnv.siteName,
    SITE_URL: opts['site.url'] || clientEnv.appUrl,
    COMPANY_NAME: opts['company.name'] || siteDefaults.companyName,
    COMPANY_ADDRESS: opts['company.address'] || siteDefaults.companyAddress,
    COMPANY_ID: opts['company.id'] || siteDefaults.companyId,
    COMPANY_JURISDICTION: opts['company.jurisdiction'] || siteDefaults.companyJurisdiction,
    CONTACT_EMAIL: opts['company.contact_email'] || siteDefaults.contactEmail,
  };
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
    const { getPublisher, getSubscriber } = await import('@/core/lib/redis');
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

/** List of all available content variables with labels and current values. */
export function getContentVarDefs(): ContentVarDef[] {
  const vars = getVarsSync();
  return [
    { key: 'SITE_NAME', label: 'Site Name', value: vars.SITE_NAME },
    { key: 'SITE_URL', label: 'Site URL', value: vars.SITE_URL },
    { key: 'COMPANY_NAME', label: 'Company Name', value: vars.COMPANY_NAME },
    { key: 'COMPANY_ADDRESS', label: 'Company Address', value: vars.COMPANY_ADDRESS },
    { key: 'COMPANY_ID', label: 'Company ID', value: vars.COMPANY_ID },
    { key: 'COMPANY_JURISDICTION', label: 'Jurisdiction', value: vars.COMPANY_JURISDICTION },
    { key: 'CONTACT_EMAIL', label: 'Contact Email', value: vars.CONTACT_EMAIL },
  ];
}

// ─── Resolution Functions ───────────────────────────────────────────────────

/**
 * Replace [[VAR]] placeholders in a string (synchronous).
 * Uses cached values. Call preloadContentVars() at server startup to warm cache.
 */
export function resolveContentVars(text: string): string {
  if (!text.includes('[[')) return text;
  const vars = getVarsSync();
  return text.replace(/\[\[(\w+)\]\]/g, (match, key) => vars[key] ?? match);
}

/**
 * Replace [[VAR]] placeholders in a string (async — fetches from DB if cache expired).
 * Use in async contexts (tRPC procedures, server components) for guaranteed fresh values.
 */
export async function resolveContentVarsAsync(text: string): Promise<string> {
  if (!text.includes('[[')) return text;
  const vars = await getVarsAsync();
  return text.replace(/\[\[(\w+)\]\]/g, (match, key) => vars[key] ?? match);
}

/**
 * Resolve [[VAR]] placeholders in all string fields of an object (shallow).
 * Returns a new object with resolved values. Non-string fields pass through.
 */
export function resolveRecordVars<T extends Record<string, unknown>>(record: T): T {
  let hasVars = false;
  for (const val of Object.values(record)) {
    if (typeof val === 'string' && val.includes('[[')) { hasVars = true; break; }
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
