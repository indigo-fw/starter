'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ConsentState } from './types';
import { DEFAULT_CONSENT } from './types';
import { getStoredConsent, setStoredConsent } from './storage';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ConsentContextValue {
  /** Current consent state. */
  consent: ConsentState;
  /** Whether the user has made a consent choice. */
  hasConsented: boolean;
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
  /** Called when consent changes (for server-side sync, analytics, etc.) */
  onConsentChange?: (state: ConsentState) => void;
}

export function ConsentProvider({ children, onConsentChange }: ConsentProviderProps) {
  const [consent, setConsent] = useState<ConsentState>(DEFAULT_CONSENT);
  const [hasConsented, setHasConsented] = useState(false);

  // Read stored consent on mount
  useEffect(() => {
    const stored = getStoredConsent();
    if (stored) {
      setConsent(stored);
      setHasConsented(true);
    }
  }, []);

  const updateConsent = useCallback(
    (partial: Partial<ConsentState>) => {
      const next = { ...consent, ...partial, necessary: true }; // necessary is always true
      setConsent(next);
      setHasConsented(true);
      setStoredConsent(next);
      onConsentChange?.(next);
    },
    [consent, onConsentChange],
  );

  const acceptAll = useCallback(() => {
    updateConsent({ analytics: true, marketing: true });
  }, [updateConsent]);

  const rejectNonEssential = useCallback(() => {
    updateConsent({ analytics: false, marketing: false });
  }, [updateConsent]);

  const value = useMemo(
    () => ({ consent, hasConsented, updateConsent, acceptAll, rejectNonEssential }),
    [consent, hasConsented, updateConsent, acceptAll, rejectNonEssential],
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
