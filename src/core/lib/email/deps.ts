/**
 * Email dependency injection — separate file to avoid circular imports.
 */

import type { EmailBranding } from './template';

export interface EmailSendOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** Override FROM address for this email (default: FROM_EMAIL env var) */
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

export interface EmailRetryPolicy {
  attempts: number;
  backoff: { type: 'exponential' | 'fixed'; delay: number };
}

export interface EmailDeps {
  /** Resolve email branding (may hit DB). Core caches internally if needed. */
  getBranding: () => Promise<EmailBranding>;
  /** Optional: check DB for template override before falling back to file */
  getTemplateOverride?: (template: string, locale: string) => Promise<{ subject: string; html: string } | null>;
  /** Directory containing email templates (default: process.cwd() + '/emails') */
  templatesDir?: string;
  /**
   * Optional: custom email sender (e.g. Resend, Postmark, SendGrid API).
   * If not provided, core uses SMTP via nodemailer.
   */
  sendEmail?: (options: EmailSendOptions) => Promise<void>;
  /** Optional: override queue rate limiter (default: { max: 5, duration: 60_000 }) */
  rateLimiter?: { max: number; duration: number };
  /** Optional: override worker concurrency (default: 5) */
  concurrency?: number;
  /** Optional: override retry policy (default: 6 attempts, exponential backoff starting at 5min) */
  retryPolicy?: EmailRetryPolicy;
  /**
   * Optional: extra layout variables injected into the email layout alongside branding.
   * Use for custom placeholders like {{YEAR}}, {{UNSUBSCRIBE_URL}}, etc.
   */
  extraLayoutVars?: Record<string, string> | (() => Record<string, string>);
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
