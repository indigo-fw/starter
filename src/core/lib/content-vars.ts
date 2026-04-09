/**
 * Content variable resolution — replaces [[VAR]] placeholders in CMS content
 * with values from site.ts at render time.
 *
 * Syntax: [[COMPANY_NAME]], [[SITE_NAME]], etc.
 * Distinct from shortcodes which use single brackets: [callout type="info"]
 *
 * Variables are stored as-is in the DB and resolved on every render,
 * so changes to site.ts take effect immediately without re-syncing.
 */

import { siteDefaults, clientEnv } from '@/config/site';

let _vars: Record<string, string> | null = null;

/** Build the variable map lazily (once per process). */
function getVars(): Record<string, string> {
  if (!_vars) {
    _vars = {
      SITE_NAME: clientEnv.siteName,
      SITE_URL: clientEnv.appUrl,
      COMPANY_NAME: siteDefaults.companyName,
      COMPANY_ADDRESS: siteDefaults.companyAddress,
      COMPANY_ID: siteDefaults.companyId,
      COMPANY_JURISDICTION: siteDefaults.companyJurisdiction,
      CONTACT_EMAIL: siteDefaults.contactEmail,
    };
  }
  return _vars;
}

/**
 * Replace [[VAR]] placeholders in a string with site config values.
 * Fast path: skips regex if no `[[` found in the string.
 */
export function resolveContentVars(text: string): string {
  if (!text.includes('[[')) return text;
  const vars = getVars();
  return text.replace(/\[\[(\w+)\]\]/g, (match, key) => vars[key] ?? match);
}

/**
 * Resolve [[VAR]] placeholders in all string fields of an object (shallow).
 * Returns a new object with resolved values. Non-string fields pass through.
 * Use on DB records before returning to renderers/metadata.
 */
export function resolveRecordVars<T extends Record<string, unknown>>(record: T): T {
  // Fast path: check if any string field contains [[
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
