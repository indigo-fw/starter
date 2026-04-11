/**
 * Consent categories for cookie/tracking management.
 *
 * Core provides 3 built-in categories. Projects can add custom ones
 * (e.g. 'preferences', 'functional') by passing them to <ConsentProvider>.
 */

/** Built-in consent categories. Projects can use any string as a category. */
export type BuiltInConsentCategory = 'necessary' | 'analytics' | 'marketing';

/** Consent category — string-based so projects can extend with custom categories. */
export type ConsentCategory = string;

/** Map of consent categories to their granted state. */
export type ConsentState = Record<string, boolean>;

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
