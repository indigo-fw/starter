/** Consent categories for cookie/tracking management. */
export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

/** Map of consent categories to their granted state. */
export type ConsentState = Record<ConsentCategory, boolean>;

/** All consent categories. */
export const CONSENT_CATEGORIES: ConsentCategory[] = ['necessary', 'analytics', 'marketing'];

/** Default state — only necessary cookies are granted. */
export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
};
