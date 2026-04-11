/**
 * Consent storage — localStorage + cookie (for SSR access).
 */

import type { ConsentState } from './types';

const STORAGE_KEY = 'indigo-consent';
const COOKIE_NAME = 'indigo-consent';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/** Read consent state from localStorage. Returns null if not yet set. */
export function getStoredConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}

/** Write consent state to localStorage + set a cookie for SSR access. */
export function setStoredConsent(state: ConsentState): void {
  if (typeof window === 'undefined') return;

  try {
    const json = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, json);

    // Set cookie so server can read consent state (e.g. for conditional script injection)
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(json)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // Storage not available (incognito, full, etc.)
  }
}

/** Check if user has made a consent choice (accepted or rejected). */
export function hasConsentChoice(): boolean {
  return getStoredConsent() !== null;
}
