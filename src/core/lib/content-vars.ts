/**
 * Content variable resolution — replaces {{VAR}} placeholders in CMS content
 * with values from site.ts at render time.
 *
 * Used by ShortcodeRenderer before markdown conversion.
 * Variables are stored as-is in the DB (e.g. {{COMPANY_NAME}}) and resolved
 * on every render so changes to site.ts take effect immediately.
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
 * Replace {{VAR}} placeholders in content with site config values.
 * Fast path: skips regex if no `{{` found in the string.
 */
export function resolveContentVars(text: string): string {
  if (!text.includes('{{')) return text;
  const vars = getVars();
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
