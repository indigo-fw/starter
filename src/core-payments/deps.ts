/**
 * core-payments dependency injection.
 *
 * Framework conventions (trpc, db, user/org/member tables, audit, core utils)
 * are imported directly. Only project-specific behavior is injected here.
 */
import type { PaymentProviderConfig } from '@/core-payments/types/payment';

/** Minimal plan shape needed by payment providers for price resolution. */
export interface PaymentPlanInfo {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  trialDays?: number;
  providerPrices: Record<string, { monthly?: string; yearly?: string }>;
}

export interface PaymentsDeps {
  /** Get enabled payment provider configs (for UI). */
  getEnabledProviderConfigs: () => PaymentProviderConfig[];

  /** Get a plan by ID (for price resolution in providers). */
  getPlan: (id: string) => PaymentPlanInfo | undefined;

  /** Get a plan by provider price ID (for webhook event processing). */
  getPlanByProviderPriceId: (providerId: string, priceId: string) => PaymentPlanInfo | undefined;

  /** Get provider price ID for a plan + interval. */
  getProviderPriceId: (plan: PaymentPlanInfo, providerId: string, interval: 'monthly' | 'yearly') => string | null | undefined;

  /** Resolve the active organization ID for a user. */
  resolveOrgId: (activeOrgId: string | null, userId: string) => Promise<string>;

  /** Broadcast a real-time event to a WebSocket channel. Fire-and-forget. */
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void;
}

let _deps: PaymentsDeps | null = null;

export function setPaymentsDeps(deps: PaymentsDeps): void {
  _deps = deps;
}

export function getPaymentsDeps(): PaymentsDeps {
  if (!_deps) {
    throw new Error(
      'Payments dependencies not configured. Call setPaymentsDeps() at startup — see src/core-payments/deps.ts',
    );
  }
  return _deps;
}
