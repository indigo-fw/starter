/**
 * Email dependency injection — separate file to avoid circular imports.
 */

import type { EmailBranding } from './template';

export interface EmailDeps {
  /** Resolve email branding (may hit DB). Core caches internally if needed. */
  getBranding: () => Promise<EmailBranding>;
  /** Optional: check DB for template override before falling back to file */
  getTemplateOverride?: (template: string, locale: string) => Promise<{ subject: string; html: string } | null>;
  /** Directory containing email templates (default: process.cwd() + '/emails') */
  templatesDir?: string;
}

let _deps: EmailDeps | null = null;

export function setEmailDeps(deps: EmailDeps): void {
  _deps = deps;
}

export function getEmailDeps(): EmailDeps {
  if (!_deps) {
    throw new Error(
      'Email deps not configured. Call setEmailDeps() during server startup ' +
      '(e.g. in src/config/email-deps.ts).',
    );
  }
  return _deps;
}
