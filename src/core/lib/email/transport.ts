/**
 * SMTP transport singleton — reuses a single connection for all emails.
 */

import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

export const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@localhost';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// ---------------------------------------------------------------------------
// Singleton
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
// Send
// ---------------------------------------------------------------------------

/** Send an email via the SMTP transport. Throws if SMTP is not configured. */
export async function sendEmail(
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
  if (previewUrl) {
    console.log(`Email preview: ${previewUrl}`);
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
