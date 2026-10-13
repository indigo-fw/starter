/**
 * Disposable-email detection for sign-up and email-change paths.
 *
 * The blocklist is a static JSON import (not a runtime file read) so it
 * survives Next.js bundling — `process.cwd()`-relative reads break once the
 * route is compiled into `.next/server`. Source list: the public
 * disposable-email-domains project, lowercased + deduped at build time.
 *
 * Matching walks every parent domain down to the registrable pair, so
 * `anything.mailinator.com` is caught by a `mailinator.com` entry — the usual
 * dodge of pointing a wildcard MX at a listed domain fails.
 */
import disposableDomains from './disposable-domains.json';

export const DISPOSABLE_EMAIL_MESSAGE =
  'Disposable email addresses are not allowed.';

const BLOCKED_DOMAINS = new Set<string>(disposableDomains);

/** Extend the built-in list — projects call this once at boot from a deps file. */
export function addDisposableDomains(domains: readonly string[]): void {
  for (const domain of domains) {
    const normalized = normalizeDomain(domain);
    if (normalized) BLOCKED_DOMAINS.add(normalized);
  }
}

/** Current blocklist size — handy for health output and tests. */
export function disposableDomainCount(): number {
  return BLOCKED_DOMAINS.size;
}

function normalizeDomain(domain: string): string | null {
  const trimmed = domain.trim().toLowerCase().replace(/\.+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True when the address's domain, or any parent of it with at least two
 * labels, is on the blocklist. Malformed input (no `@`, empty domain,
 * non-string) is `false` — format validation is Better Auth's job.
 */
export function isDisposableEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = normalizeDomain(email.slice(at + 1));
  if (!domain) return false;

  const labels = domain.split('.');
  for (let i = 0; i <= labels.length - 2; i++) {
    if (BLOCKED_DOMAINS.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}
