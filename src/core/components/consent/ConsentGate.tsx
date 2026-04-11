'use client';

import type { ReactNode } from 'react';
import { useConsent } from '../../lib/consent/context';
import type { ConsentCategory } from '../../lib/consent/types';

interface ConsentGateProps {
  /** Only render children if this category is consented to. */
  category: ConsentCategory;
  children: ReactNode;
  /** Optional fallback to render when consent is not granted. */
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on consent state.
 * Use around analytics scripts, marketing pixels, etc.
 *
 * @example
 * <ConsentGate category="analytics">
 *   <GA4Script />
 * </ConsentGate>
 */
export function ConsentGate({ category, children, fallback = null }: ConsentGateProps) {
  const { consent } = useConsent();

  if (consent[category]) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
