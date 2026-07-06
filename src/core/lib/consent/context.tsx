'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { ConsentState, StoredConsent } from './types';
import {
  CONSENT_RECORD_VERSION,
  DEFAULT_CATEGORIES,
  DEFAULT_POLICY_VERSION,
  buildDefaultConsent,
  isStoredConsentCurrent,
} from './types';
import { getStoredConsent, setStoredConsent, clearStoredConsent } from './storage';
import type { ConsentStorageOptions } from './storage';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface ConsentContextValue {
  /** Flat map of category → granted (UI-facing). */
  consent: ConsentState;
  /** Whether the user has a valid, current consent record. */
  hasConsented: boolean;
  /** Banner visibility — true on first visit OR when reopened via openSettings(). */
  isOpen: boolean;
  /** All category names (in display order). */
  categories: string[];
  /** Current policy version the banner is asking about. */
  policyVersion: string;
  /** ISO timestamp of the last stored choice — null if no choice yet. */
  consentedAt: string | null;
  /** Merge a partial update into the consent state (necessary always remains true). */
  updateConsent: (state: Partial<ConsentState>) => void;
  /** Grant every category. */
  acceptAll: () => void;
  /** Grant only `necessary`. */
  rejectNonEssential: () => void;
  /** Re-open the banner so the user can review/change preferences. */
  openSettings: () => void;
  /** Close the banner without changing anything (only if there's a valid prior consent). */
  closeSettings: () => void;
  /** Withdraw all consent and clear the stored record. */
  withdrawConsent: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ConsentProviderProps {
  children: ReactNode;
  /**
   * Categories to ask about. Default: ['necessary', 'analytics', 'marketing'].
   * 'necessary' is implicit and prepended if omitted.
   * Changing this set invalidates prior consents (user is re-prompted).
   */
  categories?: string[];
  /**
   * Cookie/privacy policy version. Bump whenever the policy materially changes
   * to force re-consent. Default '1'. Changing this invalidates prior consents.
   */
  policyVersion?: string;
  /**
   * Called whenever consent changes — useful for server-side sync, analytics
   * gating, audit logs, etc. Receives both the flat state and the full record.
   */
  onConsentChange?: (state: ConsentState, record: StoredConsent) => void;
  /** Storage overrides (cookie name, max-age, domain). */
  storage?: ConsentStorageOptions;
  /**
   * Server-side initial consent. The public layout reads it via
   * getServerConsent() and passes it here so SSR and first paint agree
   * with the cookie — no consent-gated flicker on hydration.
   *
   * - `undefined` → read from client cookie on mount.
   * - `null` → no prior consent.
   * - `StoredConsent` → use it as the initial value.
   */
  initialConsent?: StoredConsent | null;
}

export function ConsentProvider({
  children,
  categories: categoriesProp,
  policyVersion = DEFAULT_POLICY_VERSION,
  onConsentChange,
  storage: storageOptions,
  initialConsent,
}: ConsentProviderProps) {
  const categories = useMemo(() => {
    const cats = categoriesProp ?? DEFAULT_CATEGORIES;
    return cats.includes('necessary') ? cats : ['necessary', ...cats];
  }, [categoriesProp]);

  // Initial record — server value (if provided) → client cookie → null.
  const [record, setRecord] = useState<StoredConsent | null>(() => {
    if (initialConsent !== undefined) return initialConsent;
    if (typeof window === 'undefined') return null;
    return getStoredConsent(storageOptions);
  });

  // After hydration, reconcile with the client cookie. If the server saw a
  // different (or no) cookie, sync our state — but never overwrite a
  // user-initiated change made in this session.
  const userInteracted = useRef(false);
  useEffect(() => {
    if (userInteracted.current) return;
    const fromClient = getStoredConsent(storageOptions);
    if (!recordsEqual(fromClient, record)) {
      setRecord(fromClient);
    }
    // We only want this reconciliation once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasConsented = isStoredConsentCurrent(record, categories, policyVersion);

  // Live consent state — merges stored answers with defaults so a category
  // present in code but missing from the stored record reads as `false`
  // (defensive against partial records).
  const consent: ConsentState = useMemo(() => {
    const defaults = buildDefaultConsent(categories);
    if (!hasConsented || !record) return defaults;
    return { ...defaults, ...record.state, necessary: true };
  }, [categories, hasConsented, record]);

  // Banner visibility: open if no valid consent yet, or user explicitly reopened.
  const [forceOpen, setForceOpen] = useState(false);
  const isOpen = !hasConsented || forceOpen;

  const commit = useCallback(
    (nextState: ConsentState) => {
      const newRecord: StoredConsent = {
        v: CONSENT_RECORD_VERSION,
        state: { ...nextState, necessary: true },
        consentedAt: new Date().toISOString(),
        policyVersion,
        categories: [...categories],
      };
      userInteracted.current = true;
      setRecord(newRecord);
      setForceOpen(false);
      setStoredConsent(newRecord, storageOptions);
      onConsentChange?.(newRecord.state, newRecord);
    },
    [categories, policyVersion, storageOptions, onConsentChange],
  );

  const updateConsent = useCallback(
    (partial: Partial<ConsentState>) => {
      // Build from current `consent` (which is itself derived from `record`),
      // not from a captured `record` — guarantees `partial` overrides win.
      // Partial<Record<string, boolean>> includes `undefined` in its values,
      // so we copy explicitly to keep the merged shape strictly boolean.
      const merged: ConsentState = { ...consent };
      for (const [k, v] of Object.entries(partial)) {
        if (typeof v === 'boolean') merged[k] = v;
      }
      commit(merged);
    },
    [commit, consent],
  );

  const acceptAll = useCallback(() => {
    const next: ConsentState = {};
    for (const cat of categories) next[cat] = true;
    commit(next);
  }, [categories, commit]);

  const rejectNonEssential = useCallback(() => {
    const next: ConsentState = {};
    for (const cat of categories) next[cat] = cat === 'necessary';
    commit(next);
  }, [categories, commit]);

  const openSettings = useCallback(() => setForceOpen(true), []);
  const closeSettings = useCallback(() => {
    // Only allow dismissal if there's a valid prior consent to fall back to.
    // Otherwise a user could click the page behind the banner and silently
    // "decline" by closing — that's not informed consent.
    if (hasConsented) setForceOpen(false);
  }, [hasConsented]);

  const withdrawConsent = useCallback(() => {
    userInteracted.current = true;
    setRecord(null);
    setForceOpen(false);
    clearStoredConsent(storageOptions);
  }, [storageOptions]);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      hasConsented,
      isOpen,
      categories,
      policyVersion,
      consentedAt: record?.consentedAt ?? null,
      updateConsent,
      acceptAll,
      rejectNonEssential,
      openSettings,
      closeSettings,
      withdrawConsent,
    }),
    [
      consent,
      hasConsented,
      isOpen,
      categories,
      policyVersion,
      record,
      updateConsent,
      acceptAll,
      rejectNonEssential,
      openSettings,
      closeSettings,
      withdrawConsent,
    ],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Throws if rendered outside <ConsentProvider>. Use in consent-aware UI. */
export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within <ConsentProvider>');
  return ctx;
}

/**
 * Returns the consent context or `null` when no provider is in the tree.
 * Use in cross-cutting modules (e.g. attribution, analytics) that must
 * safely fall back to "no consent" if the host project hasn't mounted
 * a <ConsentProvider>.
 */
export function useConsentSafe(): ConsentContextValue | null {
  return useContext(ConsentContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recordsEqual(a: StoredConsent | null, b: StoredConsent | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.consentedAt !== b.consentedAt) return false;
  if (a.policyVersion !== b.policyVersion) return false;
  if (a.categories.length !== b.categories.length) return false;
  for (let i = 0; i < a.categories.length; i++) {
    if (a.categories[i] !== b.categories[i]) return false;
  }
  const aKeys = Object.keys(a.state);
  const bKeys = Object.keys(b.state);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (a.state[k] !== b.state[k]) return false;
  return true;
}
