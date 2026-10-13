/**
 * SMTP transport singleton — reuses a single connection for all emails.
 * Projects can override the entire transport via `setEmailDeps({ sendEmail })`.
 */
import { createLogger } from '../infra/logger';
import { getEmailDeps } from './deps';
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

const logger = createLogger('email-transport');

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

export const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@localhost';

/**
 * Dry-run mode: log emails to console instead of delivering them.
 * Enabled by EMAIL_DRY_RUN=1 or automatically when INDIGO_ROBOTS_PROFILE=demo.
 * Prevents outbound email to user-provided signup addresses on the demo instance.
 */
const IS_DRY_RUN =
  process.env.EMAIL_DRY_RUN === '1' ||
  process.env.EMAIL_DRY_RUN === 'true' ||
  process.env.INDIGO_ROBOTS_PROFILE === 'demo';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/**
 * A delivery failure no retry will fix: recipient or sender rejected (SMTP
 * 5xx envelope), credentials refused. The email worker maps this to a BullMQ
 * `UnrecoverableError` so the job fails immediately — and alerts now —
 * instead of burning the whole retry envelope (hours) on an address that can
 * never receive. Transient failures (connection, timeout, 4xx) throw plain
 * errors and keep retrying.
 */
export class PermanentEmailError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentEmailError';
  }
}

/** Duck-typed so the check survives the class being loaded in two module graphs. */
export function isPermanentEmailError(err: unknown): boolean {
  return (
    err instanceof PermanentEmailError ||
    (err instanceof Error && err.name === 'PermanentEmailError')
  );
}

/** Rethrow a nodemailer error, upgraded to PermanentEmailError when retrying is pointless. */
function rethrowClassified(err: unknown): never {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const permanent =
    e.code === 'EENVELOPE' || // recipient/sender rejected
    e.code === 'EAUTH' || // credentials refused
    (typeof e.responseCode === 'number' &&
      e.responseCode >= 500 &&
      e.responseCode < 600);
  if (permanent) {
    throw new PermanentEmailError(
      `SMTP permanent failure (${e.code ?? e.responseCode}): ${e.message ?? String(err)}`,
      { cause: err }
    );
  }
  throw err;
}

// ---------------------------------------------------------------------------
// SMTP Singleton (fallback when no custom sendEmail in deps)
// ---------------------------------------------------------------------------

let _transport: Mail | null = null;

/** Get SMTP transport. Returns null if SMTP_HOST is not configured. */
export function getTransport(): Mail | null {
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
// Send — uses DI transport if provided, falls back to SMTP
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  /** Extra message headers, e.g. RFC 8058 `List-Unsubscribe` for bulk mail. */
  headers?: Record<string, string>;
}

/**
 * Send an email. If `deps.sendEmail` is configured (e.g. Resend, Postmark),
 * uses that. Otherwise falls back to SMTP via nodemailer.
 *
 * When IS_DRY_RUN is true (EMAIL_DRY_RUN=1 or INDIGO_ROBOTS_PROFILE=demo),
 * the email is logged to stdout and not delivered.
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  opts: SendEmailOptions = {}
): Promise<void> {
  if (IS_DRY_RUN) {
    const toStr = Array.isArray(to) ? to.join(', ') : to;
    logger.info(`[EMAIL DRY RUN] To: ${toStr} | Subject: ${subject}`);
    return;
  }

  let deps: ReturnType<typeof getEmailDeps> | null = null;
  try {
    deps = getEmailDeps();
  } catch {
    // Deps not configured yet — use SMTP directly
  }

  // Use custom transport if provided
  if (deps?.sendEmail) {
    await deps.sendEmail({
      to,
      subject,
      html,
      from: FROM_EMAIL,
      replyTo: opts.replyTo,
      cc: opts.cc,
      bcc: opts.bcc,
      headers: opts.headers,
    });
    return;
  }

  // Fallback to SMTP
  const transport = getTransport();
  if (!transport) {
    throw new Error(
      'SMTP not configured (set SMTP_HOST) and no custom sendEmail in EmailDeps'
    );
  }

  let info: Awaited<ReturnType<Mail['sendMail']>>;
  try {
    info = await transport.sendMail({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      replyTo: opts.replyTo,
      cc: opts.cc,
      bcc: opts.bcc,
      headers: opts.headers,
    });
  } catch (err) {
    rethrowClassified(err);
  }

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    logger.info(`Email preview: ${previewUrl}`);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Basic email format validation. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

// Addresses left behind by GDPR anonymization (core/lib/analytics/gdpr.ts).
// They are shaped like real addresses, so format validation alone would let a
// win-back or notification email reach the mailbox of someone who asked to be
// erased — refuse them at the queue boundary.
const ANONYMIZED_PATTERNS = [/@gdpr\.invalid$/i, /@anon\.local$/i];

/** Whether the address belongs to an anonymized (GDPR-deleted) account. */
export function isAnonymizedAddress(email: string): boolean {
  return ANONYMIZED_PATTERNS.some((re) => re.test(email.trim()));
}
