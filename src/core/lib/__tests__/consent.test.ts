import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredConsent,
  setStoredConsent,
  clearStoredConsent,
  hasConsentChoice,
} from '../consent/storage';
import type { StoredConsent } from '../consent/types';
import {
  CONSENT_RECORD_VERSION,
  DEFAULT_CONSENT,
  buildDefaultConsent,
  categoriesEqual,
  isStoredConsentCurrent,
  parseStoredConsent,
} from '../consent/types';

// Mock localStorage + document.cookie behavior
const storage = new Map<string, string>();
const cookieJar = new Map<string, string>();

function cookieString(): string {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

beforeEach(() => {
  storage.clear();
  cookieJar.clear();

  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { protocol: 'https:' });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  });

  // Minimal document.cookie shim — supports get (concatenated) and set
  // (assignment of `name=value; attr; attr`). Honors max-age=0 as deletion.
  let _cookie = '';
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        // Build from cookieJar on every read so deletions reflect immediately.
        return cookieString();
      },
      set cookie(v: string) {
        _cookie = v;
        const [pair, ...attrs] = v.split(';').map((s) => s.trim());
        const eq = pair.indexOf('=');
        if (eq < 0) return;
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        const deleted = attrs.some((a) => /^max-age=0$/i.test(a));
        if (deleted) {
          cookieJar.delete(name);
        } else {
          cookieJar.set(name, value);
        }
      },
    },
  });
  // Silence "unused" lint
  void _cookie;
});

function makeRecord(overrides: Partial<StoredConsent> = {}): StoredConsent {
  return {
    v: CONSENT_RECORD_VERSION,
    state: { necessary: true, analytics: true, marketing: false },
    consentedAt: '2026-05-20T10:00:00.000Z',
    policyVersion: '1',
    categories: ['necessary', 'analytics', 'marketing'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Storage round-trips
// ---------------------------------------------------------------------------

describe('consent storage', () => {
  it('returns null when no consent stored', () => {
    expect(getStoredConsent()).toBeNull();
  });

  it('stores and retrieves a full record', () => {
    const rec = makeRecord();
    setStoredConsent(rec);

    const retrieved = getStoredConsent();
    expect(retrieved).toEqual(rec);
  });

  it('writes a cookie carrying the full record', () => {
    setStoredConsent(makeRecord());

    expect(document.cookie).toContain('indigo-consent=');
    expect(decodeURIComponent(document.cookie)).toContain('"policyVersion":"1"');
    expect(decodeURIComponent(document.cookie)).toContain('"consentedAt"');
  });

  it('falls back to localStorage when cookie is missing', () => {
    storage.set('indigo-consent', JSON.stringify(makeRecord()));
    // Note: cookieJar empty
    expect(getStoredConsent()).toEqual(makeRecord());
  });

  it('cookie wins over localStorage when both exist and differ', () => {
    const cookieRec = makeRecord({ state: { necessary: true, analytics: true, marketing: true } });
    const lsRec = makeRecord({ state: { necessary: true, analytics: false, marketing: false } });
    storage.set('indigo-consent', JSON.stringify(lsRec));
    cookieJar.set('indigo-consent', encodeURIComponent(JSON.stringify(cookieRec)));

    expect(getStoredConsent()).toEqual(cookieRec);
  });

  it('clearStoredConsent removes both cookie and localStorage', () => {
    setStoredConsent(makeRecord());
    expect(getStoredConsent()).not.toBeNull();

    clearStoredConsent();
    expect(getStoredConsent()).toBeNull();
    expect(cookieJar.has('indigo-consent')).toBe(false);
    expect(storage.has('indigo-consent')).toBe(false);
  });

  it('hasConsentChoice reflects presence', () => {
    expect(hasConsentChoice()).toBe(false);
    setStoredConsent(makeRecord());
    expect(hasConsentChoice()).toBe(true);
  });

  it('handles corrupted JSON gracefully', () => {
    cookieJar.set('indigo-consent', 'not-json');
    storage.set('indigo-consent', 'not-json');
    expect(getStoredConsent()).toBeNull();
  });

  it('rejects records with the wrong format version', () => {
    cookieJar.set(
      'indigo-consent',
      encodeURIComponent(JSON.stringify({ ...makeRecord(), v: 999 })),
    );
    expect(getStoredConsent()).toBeNull();
  });

  it('rejects records with missing required fields', () => {
    cookieJar.set(
      'indigo-consent',
      encodeURIComponent(JSON.stringify({ v: 1, state: { necessary: true } })),
    );
    expect(getStoredConsent()).toBeNull();
  });

  it('rejects records with non-boolean state values', () => {
    cookieJar.set(
      'indigo-consent',
      encodeURIComponent(
        JSON.stringify({ ...makeRecord(), state: { necessary: 'yes' } }),
      ),
    );
    expect(getStoredConsent()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defaults / helpers
// ---------------------------------------------------------------------------

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

describe('categoriesEqual', () => {
  it('treats reordered lists as equal', () => {
    expect(categoriesEqual(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });

  it('detects added category', () => {
    expect(categoriesEqual(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });

  it('detects removed category', () => {
    expect(categoriesEqual(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Record-current invalidation rules
// ---------------------------------------------------------------------------

describe('isStoredConsentCurrent', () => {
  it('returns false for null', () => {
    expect(isStoredConsentCurrent(null, ['necessary'], '1')).toBe(false);
  });

  it('returns true when version, policy, and categories all match', () => {
    expect(
      isStoredConsentCurrent(
        makeRecord(),
        ['necessary', 'analytics', 'marketing'],
        '1',
      ),
    ).toBe(true);
  });

  it('invalidates when policy version differs (force re-consent on policy bump)', () => {
    expect(
      isStoredConsentCurrent(
        makeRecord({ policyVersion: '1' }),
        ['necessary', 'analytics', 'marketing'],
        '2',
      ),
    ).toBe(false);
  });

  it('invalidates when a new category was added (user never saw it)', () => {
    expect(
      isStoredConsentCurrent(
        makeRecord({ categories: ['necessary', 'analytics', 'marketing'] }),
        ['necessary', 'analytics', 'marketing', 'preferences'],
        '1',
      ),
    ).toBe(false);
  });

  it('invalidates when a category was removed (record is stale)', () => {
    expect(
      isStoredConsentCurrent(
        makeRecord({ categories: ['necessary', 'analytics', 'marketing'] }),
        ['necessary', 'analytics'],
        '1',
      ),
    ).toBe(false);
  });

  it('invalidates when format version differs', () => {
    expect(
      isStoredConsentCurrent(
        { ...makeRecord(), v: 999 } as unknown as StoredConsent,
        ['necessary', 'analytics', 'marketing'],
        '1',
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseStoredConsent — defensive against malformed input
// ---------------------------------------------------------------------------

describe('parseStoredConsent', () => {
  it('accepts a well-formed record', () => {
    expect(parseStoredConsent(makeRecord())).toEqual(makeRecord());
  });

  it('rejects non-object input', () => {
    expect(parseStoredConsent(null)).toBeNull();
    expect(parseStoredConsent('string')).toBeNull();
    expect(parseStoredConsent(42)).toBeNull();
  });

  it('rejects record with non-string categories', () => {
    expect(
      parseStoredConsent({ ...makeRecord(), categories: ['necessary', 42] }),
    ).toBeNull();
  });

  it('rejects record with non-array categories', () => {
    expect(
      parseStoredConsent({ ...makeRecord(), categories: 'necessary' }),
    ).toBeNull();
  });
});
