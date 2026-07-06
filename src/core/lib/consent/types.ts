/**
 * Consent categories and stored-record shape for cookie/tracking management.
 *
 * Core provides 3 built-in categories. Projects can add custom ones
 * (e.g. 'preferences', 'functional') by passing them to <ConsentProvider>.
 *
 * A stored record carries enough metadata to (a) prove consent later
 * (timestamp + policy version, GDPR Art. 7(1)) and (b) detect when the
 * recorded answer no longer covers the current question — e.g. a new
 * category was added, or the cookie policy was updated — so the banner
 * re-prompts instead of silently honoring a stale answer.
 */

/** Built-in consent categories. Projects can use any string as a category. */
export type BuiltInConsentCategory = 'necessary' | 'analytics' | 'marketing';

/** Consent category — string-based so projects can extend with custom categories. */
export type ConsentCategory = string;

/** Flat map of category → granted. This is the runtime-facing shape (what UI cares about). */
export type ConsentState = Record<string, boolean>;

/**
 * Persistent consent record format. Versioned so the schema can evolve;
 * a record with a mismatched `v` is treated as absent (re-prompt).
 */
export interface StoredConsent {
  /** Record format version. Bump when this shape changes. */
  v: typeof CONSENT_RECORD_VERSION;
  /** The granted state at the moment of consent. */
  state: ConsentState;
  /** ISO timestamp of when the user made the choice. */
  consentedAt: string;
  /** Cookie/privacy policy version the user consented to. */
  policyVersion: string;
  /** Categories presented to the user when they consented. */
  categories: string[];
}

/** Current stored-record format version. Bump on breaking changes. */
export const CONSENT_RECORD_VERSION = 1 as const;

/**
 * Default policy version. Projects should bump this in <ConsentProvider policyVersion="...">
 * whenever the cookie policy materially changes, to force re-consent.
 */
export const DEFAULT_POLICY_VERSION = '1';

/** Default built-in categories. */
export const DEFAULT_CATEGORIES: BuiltInConsentCategory[] = ['necessary', 'analytics', 'marketing'];

/** Default state — only necessary cookies are granted. */
export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
};

/** Build default consent state from a list of categories (necessary=true, rest=false). */
export function buildDefaultConsent(categories: string[]): ConsentState {
  const state: ConsentState = {};
  for (const cat of categories) {
    state[cat] = cat === 'necessary';
  }
  return state;
}

/** Two category lists are equivalent iff they contain the same set (order-insensitive). */
export function categoriesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const x of b) if (!setA.has(x)) return false;
  return true;
}

/**
 * A stored record is still authoritative iff it's the current schema version,
 * was given under the current policy version, and covers exactly the current
 * category set. Any mismatch → re-prompt (we can't infer consent for a
 * category the user never saw, nor assume the previous text covered new terms).
 */
export function isStoredConsentCurrent(
  record: StoredConsent | null,
  currentCategories: readonly string[],
  currentPolicyVersion: string,
): record is StoredConsent {
  if (!record) return false;
  if (record.v !== CONSENT_RECORD_VERSION) return false;
  if (record.policyVersion !== currentPolicyVersion) return false;
  if (!categoriesEqual(record.categories, currentCategories)) return false;
  return true;
}

/** Narrow + sanitize a parsed JSON value into a StoredConsent, or null if invalid. */
export function parseStoredConsent(raw: unknown): StoredConsent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== CONSENT_RECORD_VERSION) return null;
  if (typeof r.consentedAt !== 'string') return null;
  if (typeof r.policyVersion !== 'string') return null;
  if (!Array.isArray(r.categories)) return null;
  if (!r.categories.every((c) => typeof c === 'string')) return null;
  if (!r.state || typeof r.state !== 'object') return null;
  const state: ConsentState = {};
  for (const [k, v] of Object.entries(r.state as Record<string, unknown>)) {
    if (typeof v !== 'boolean') return null;
    state[k] = v;
  }
  return {
    v: CONSENT_RECORD_VERSION,
    state,
    consentedAt: r.consentedAt,
    policyVersion: r.policyVersion,
    categories: r.categories as string[],
  };
}
