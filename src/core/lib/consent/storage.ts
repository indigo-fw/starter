/**
 * Consent storage — client-side cookie I/O.
 *
 * The cookie is the source of truth: it survives across tabs, is readable
 * server-side for hydration-stable SSR, and carries a real expiry. localStorage
 * is mirrored as a best-effort cache only — every read still goes through the
 * cookie so the two never drift.
 */

import type { StoredConsent } from './types';
import { parseStoredConsent } from './types';

const DEFAULT_STORAGE_KEY = 'indigo-consent';
const DEFAULT_COOKIE_NAME = 'indigo-consent';
const DEFAULT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export interface ConsentStorageOptions {
  /** localStorage mirror key. */
  storageKey?: string;
  /** Cookie name (also used by the server reader). */
  cookieName?: string;
  /** Cookie max-age in seconds. */
  cookieMaxAge?: number;
  /** Cookie domain (e.g. '.example.com'). Defaults to current host. */
  cookieDomain?: string;
  /** Set Secure cookie attribute. Defaults to true when on https. */
  cookieSecure?: boolean;
}

function readClientCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split('; ');
  const prefix = `${name}=`;
  for (const c of cookies) {
    if (c.startsWith(prefix)) return c.slice(prefix.length);
  }
  return null;
}

function tryParse(raw: string | null): StoredConsent | null {
  if (!raw) return null;
  try {
    return parseStoredConsent(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

/**
 * Read the stored consent record on the client.
 * Cookie wins; localStorage is only consulted if the cookie is missing
 * (e.g. third-party cookies stripped) — and even then it's a best-effort read.
 */
export function getStoredConsent(options?: ConsentStorageOptions): StoredConsent | null {
  if (typeof window === 'undefined') return null;

  const cookieName = options?.cookieName ?? DEFAULT_COOKIE_NAME;
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;

  const fromCookie = tryParse(readClientCookie(cookieName));
  if (fromCookie) return fromCookie;

  try {
    return tryParse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

/**
 * Persist a consent record. Writes both cookie (source of truth, SSR-readable)
 * and a localStorage mirror (fast client access).
 */
export function setStoredConsent(record: StoredConsent, options?: ConsentStorageOptions): void {
  if (typeof window === 'undefined') return;

  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const cookieName = options?.cookieName ?? DEFAULT_COOKIE_NAME;
  const maxAge = options?.cookieMaxAge ?? DEFAULT_COOKIE_MAX_AGE;
  const domain = options?.cookieDomain;
  const secure =
    options?.cookieSecure ??
    (typeof location !== 'undefined' && location.protocol === 'https:');

  try {
    const json = JSON.stringify(record);
    try {
      localStorage.setItem(storageKey, json);
    } catch {
      // localStorage may be unavailable (incognito/quota) — cookie alone is fine.
    }

    const parts = [
      `${cookieName}=${encodeURIComponent(json)}`,
      'path=/',
      `max-age=${maxAge}`,
      'SameSite=Lax',
    ];
    if (domain) parts.push(`domain=${domain}`);
    if (secure) parts.push('Secure');
    document.cookie = parts.join('; ');
  } catch {
    // Last-resort guard — never let storage errors break consent flow.
  }
}

/** Erase the cookie + localStorage mirror. Used when consent is withdrawn or invalidated. */
export function clearStoredConsent(options?: ConsentStorageOptions): void {
  if (typeof window === 'undefined') return;

  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const cookieName = options?.cookieName ?? DEFAULT_COOKIE_NAME;
  const domain = options?.cookieDomain;

  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }

  try {
    const parts = [`${cookieName}=`, 'path=/', 'max-age=0', 'SameSite=Lax'];
    if (domain) parts.push(`domain=${domain}`);
    document.cookie = parts.join('; ');
  } catch {
    // ignore
  }
}

/** True iff any stored consent record exists. Does NOT validate freshness. */
export function hasConsentChoice(options?: ConsentStorageOptions): boolean {
  return getStoredConsent(options) !== null;
}
