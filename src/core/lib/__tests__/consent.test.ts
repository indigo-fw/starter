import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoredConsent, setStoredConsent, hasConsentChoice } from '../consent/storage';
import type { ConsentState } from '../consent/types';
import { DEFAULT_CONSENT, buildDefaultConsent } from '../consent/types';

// Mock localStorage
const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();

  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});

describe('consent storage', () => {
  it('returns null when no consent stored', () => {
    expect(getStoredConsent()).toBeNull();
  });

  it('stores and retrieves consent state', () => {
    const state: ConsentState = { necessary: true, analytics: true, marketing: false };
    setStoredConsent(state);

    const retrieved = getStoredConsent();
    expect(retrieved).toEqual(state);
  });

  it('sets a cookie when storing consent', () => {
    setStoredConsent({ necessary: true, analytics: false, marketing: false });

    expect(document.cookie).toContain('indigo-consent=');
    expect(document.cookie).toContain('max-age=');
    expect(document.cookie).toContain('SameSite=Lax');
  });

  it('hasConsentChoice returns false when no consent', () => {
    expect(hasConsentChoice()).toBe(false);
  });

  it('hasConsentChoice returns true after setting consent', () => {
    setStoredConsent(DEFAULT_CONSENT);
    expect(hasConsentChoice()).toBe(true);
  });

  it('handles corrupted localStorage gracefully', () => {
    storage.set('indigo-consent', 'not-json');
    expect(getStoredConsent()).toBeNull();
  });
});

describe('DEFAULT_CONSENT', () => {
  it('has necessary=true, analytics=false, marketing=false', () => {
    expect(DEFAULT_CONSENT).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });
});

describe('buildDefaultConsent', () => {
  it('sets necessary=true, rest=false', () => {
    expect(buildDefaultConsent(['necessary', 'analytics', 'marketing'])).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it('handles custom categories', () => {
    expect(buildDefaultConsent(['necessary', 'preferences', 'functional'])).toEqual({
      necessary: true,
      preferences: false,
      functional: false,
    });
  });
});
