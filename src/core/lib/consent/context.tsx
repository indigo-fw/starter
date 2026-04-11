'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ConsentState } from './types';
import { DEFAULT_CATEGORIES, buildDefaultConsent } from './types';
import { getStoredConsent, setStoredConsent } from './storage';
import type { ConsentStorageOptions } from './storage';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ConsentContextValue {
  /** Current consent state. */
  consent: ConsentState;
  /** Whether the user has made a consent choice. */
  hasConsented: boolean;
  /** All category names (for UI rendering). */
  categories: string[];
  /** Update consent state (merges with current). */
  updateConsent: (state: Partial<ConsentState>) => void;
  /** Accept all categories. */
  acceptAll: () => void;
  /** Reject all non-necessary categories. */
  rejectNonEssential: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ConsentProviderProps {
  children: ReactNode;
  /**
   * Consent categories to use. Default: ['necessary', 'analytics', 'marketing'].
   * Projects can add custom categories (e.g. 'preferences', 'functional').
   * 'necessary' is always included and always true.
   */
  categories?: string[];
  /** Called when consent changes (for server-side sync, analytics, etc.) */
  onConsentChange?: (state: ConsentState) => void;
  /** Override storage key, cookie name, or cookie max-age for multi-tenant setups. */
  storage?: ConsentStorageOptions;
}

export function ConsentProvider({
  children,
  categories: categoriesProp,
  onConsentChange,
  storage: storageOptions,
}: ConsentProviderProps) {
  const categories = useMemo(() => {
    const cats = categoriesProp ?? DEFAULT_CATEGORIES;
    // Ensure 'necessary' is always first
    return cats.includes('necessary') ? cats : ['necessary', ...cats];
  }, [categoriesProp]);

  const [consent, setConsent] = useState<ConsentState>(() => buildDefaultConsent(categories));
  const [hasConsented, setHasConsented] = useState(false);

  // Read stored consent on mount
  useEffect(() => {
    const stored = getStoredConsent(storageOptions);
    if (stored) {
      // Merge stored with defaults for any new categories
      const merged = { ...buildDefaultConsent(categories), ...stored };
      setConsent(merged);
      setHasConsented(true);
    }
  }, [categories, storageOptions]);

  const updateConsent = useCallback(
    (partial: Partial<ConsentState>) => {
      const next = { ...consent, ...partial, necessary: true };
      setConsent(next);
      setHasConsented(true);
      setStoredConsent(next, storageOptions);
      onConsentChange?.(next);
    },
    [consent, onConsentChange],
  );

  const acceptAll = useCallback(() => {
    const all: Partial<ConsentState> = {};
    for (const cat of categories) {
      all[cat] = true;
    }
    updateConsent(all);
  }, [categories, updateConsent]);

  const rejectNonEssential = useCallback(() => {
    const rejected: Partial<ConsentState> = {};
    for (const cat of categories) {
      rejected[cat] = cat === 'necessary';
    }
    updateConsent(rejected);
  }, [categories, updateConsent]);

  const value = useMemo(
    () => ({ consent, hasConsented, categories, updateConsent, acceptAll, rejectNonEssential }),
    [consent, hasConsented, categories, updateConsent, acceptAll, rejectNonEssential],
  );

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error('useConsent must be used within <ConsentProvider>');
  }
  return ctx;
}
