/**
 * core-subscriptions dependency injection.
 *
 * Framework conventions (trpc, db, user/org/member tables, audit, core utils)
 * are imported directly. Only project-specific behavior is injected here.
 */
import type { PlanDefinition } from '@/core-subscriptions/types/billing';
import type { PaymentProvider, PaymentProviderConfig } from '@/core-payments/types/payment';

export interface SubscriptionsDeps {
  /** All plan definitions for this project. */
  getPlans: () => PlanDefinition[];

  /** Get a plan by ID. */
  getPlan: (id: string) => PlanDefinition | undefined;

  /** Get a plan by provider price ID. */
  getPlanByProviderPriceId: (providerId: string, priceId: string) => PlanDefinition | undefined;

  /** Get provider price ID for a plan + interval. */
  getProviderPriceId: (plan: PlanDefinition, providerId: string, interval: 'monthly' | 'yearly') => string | null | undefined;

  /** Resolve the active organization ID for a user. */
  resolveOrgId: (activeOrgId: string | null, userId: string) => Promise<string>;

  /** Send a notification to all org members. Fire-and-forget. */
  sendOrgNotification: (orgId: string, params: {
    title: string;
    body: string;
    type?: string;
    category?: string;
    actionUrl?: string;
  }) => void;

  /** Enqueue a template email. Fire-and-forget. Returns a promise (can be caught). */
  enqueueTemplateEmail: (to: string, template: string, data: Record<string, unknown>) => Promise<void>;

  /** Broadcast a real-time event to a WebSocket channel. Fire-and-forget. */
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void;

  // ─── Cross-module: payment capabilities (provided via project wiring) ─────

  /** Get total revenue for a given transaction status. Provided by core-payments. */
  getTransactionRevenue?: (status: string) => Promise<number>;

  /** Get recent transactions with org names (for billing admin). Provided by core-payments. */
  getRecentTransactions?: (limit: number) => Promise<Array<{
    id: string;
    organizationId: string;
    orgName: string | null;
    providerId: string;
    amountCents: number;
    currency: string;
    status: string;
    planId: string | null;
    interval: string | null;
    createdAt: Date;
  }>>;

  /** Get revenue over time (for billing charts). Provided by core-payments. */
  getRevenueOverTime?: (from?: string, to?: string) => Promise<Array<{
    date: string;
    revenue: number;
    count: number;
  }>>;

  /** Get a payment provider instance by ID. Provided by core-payments. */
  getProvider?: (id: string) => Promise<PaymentProvider | null>;

  /** Check if any billing provider is enabled. Provided by core-payments. */
  isBillingEnabled?: () => boolean;

  /** Get enabled provider configs (for UI). Provided by core-payments. */
  getEnabledProviders?: () => PaymentProviderConfig[];

  /** Reconcile stale pending transactions. Provided by core-payments. */
  runReconciliation?: () => Promise<void>;
}

let _deps: SubscriptionsDeps | null = null;

export function setSubscriptionsDeps(deps: SubscriptionsDeps): void {
  _deps = deps;
}

export function getSubscriptionsDeps(): SubscriptionsDeps {
  if (!_deps) {
    throw new Error(
      'Subscriptions dependencies not configured. Call setSubscriptionsDeps() at startup — see src/core-subscriptions/deps.ts',
    );
  }
  return _deps;
}
