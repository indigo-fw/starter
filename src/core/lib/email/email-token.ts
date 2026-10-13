import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * One-purpose, expiring tokens for no-login email actions — today,
 * one-click unsubscribe.
 *
 * This is NOT a session. A token authorizes exactly its `scope` (one
 * notification channel) for one user, so a forwarded or leaked email can at
 * worst mute that one channel — never grant account access, never reveal data.
 * That is what makes it safe to embed in every outgoing bulk message, which
 * RFC 8058 one-click unsubscribe requires (the recipient's mail provider POSTs
 * the URL with no cookies and no human present).
 *
 * Signed with BETTER_AUTH_SECRET, so rotating that secret invalidates every
 * outstanding token — acceptable: the visible unsubscribe link in the email
 * body still works for a signed-in user.
 */

/** Expiry has to outlive the mail: people unsubscribe from months-old newsletters. */
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface EmailTokenPayload {
  /** User id (UUID). */
  uid: string;
  /** The notification channel this token may act on, e.g. 'marketing'. */
  scope: string;
  /** Expiry, epoch ms. */
  exp: number;
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value)
    throw new Error('BETTER_AUTH_SECRET is required to sign email tokens');
  return value;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

/** Mint a scoped, expiring token for `uid`. */
export function signEmailToken(
  uid: string,
  scope: string,
  ttlMs = DEFAULT_TTL_MS
): string {
  const body = Buffer.from(
    JSON.stringify({ uid, scope, exp: Date.now() + ttlMs })
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** Verify + decode. Returns null for any tampering, wrong shape, or expiry. */
export function verifyEmailToken(token: string): EmailTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  // Constant-time compare so a forged signature can't be brute-forced byte by
  // byte off response timing. Lengths are compared first because
  // timingSafeEqual throws on a length mismatch.
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const p = JSON.parse(
      Buffer.from(body, 'base64url').toString()
    ) as EmailTokenPayload;
    if (
      typeof p.uid !== 'string' ||
      typeof p.scope !== 'string' ||
      typeof p.exp !== 'number' ||
      p.exp < Date.now()
    ) {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

/**
 * RFC 8058 headers for a bulk message. Gmail and Yahoo show a native
 * "Unsubscribe" control when both are present, and both REQUIRE one on bulk
 * mail — without it, deliverability degrades and recipients reach for "spam"
 * instead, which is far more costly to sender reputation.
 *
 * The URL must accept an unauthenticated POST and act immediately: providers
 * POST it themselves, from their own infrastructure.
 */
export function listUnsubscribeHeaders(
  unsubscribeUrl: string
): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
