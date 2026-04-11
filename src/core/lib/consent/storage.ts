/**
 * Consent storage — localStorage + cookie (for SSR access).
 */

import type { ConsentState } from './types';

const DEFAULT_STORAGE_KEY = 'indigo-consent';
const DEFAULT_COOKIE_NAME = 'indigo-consent';
const DEFAULT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export interface ConsentStorageOptions {
  storageKey?: string;
  cookieName?: string;
  cookieMaxAge?: number;
}

/** Read consent state from localStorage. Returns null if not yet set. */
export function getStoredConsent(options?: ConsentStorageOptions): ConsentState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(options?.storageKey ?? DEFAULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}

/** Write consent state to localStorage + set a cookie for SSR access. */
export function setStoredConsent(state: ConsentState, options?: ConsentStorageOptions): void {
  if (typeof window === 'undefined') return;

  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
  const cookieName = options?.cookieName ?? DEFAULT_COOKIE_NAME;
  const maxAge = options?.cookieMaxAge ?? DEFAULT_COOKIE_MAX_AGE;

  try {
    const json = JSON.stringify(state);
    localStorage.setItem(storageKey, json);

    document.cookie = `${cookieName}=${encodeURIComponent(json)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // Storage not available (incognito, full, etc.)
  }
}

/** Check if user has made a consent choice (accepted or rejected). */
export function hasConsentChoice(options?: ConsentStorageOptions): boolean {
  return getStoredConsent(options) !== null;
}
