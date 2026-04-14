/**
 * core-store dependency injection.
 *
 * Injects payment processing (via core-billing), org resolution, billing profiles,
 * and notifications. Framework conventions (trpc, db, user/org tables) imported directly.
 */

import type { BillingProfileSnapshot } from '@/core-store/types/billing';

export interface StoreDeps {
  /** Resolve the active organization ID for a user. */
  resolveOrgId: (activeOrgId: string | null, userId: string) => Promise<string>;

  /** Get billing profile for an organization. Returns null if not set up yet. */
  getBillingProfile: (organizationId: string) => Promise<BillingProfileSnapshot | null>;

  /**
   * Create a one-time payment checkout session for an order.
   * Returns the checkout URL to redirect the customer to.
   */
  createPaymentCheckout: (params: {
    orderId: string;
    orderNumber: string;
    totalCents: number;
    currency: string;
    customerEmail?: string;
    providerId: string;
    metadata: Record<string, string>;
  }) => Promise<string>;

  /**
   * Send a notification to a specific user.
   */
  sendNotification: (params: {
    userId: string;
    title: string;
    body: string;
    actionUrl?: string;
  }) => void;

  /**
   * Send a template email. Fire-and-forget.
   */
  enqueueTemplateEmail: (to: string, template: string, data: Record<string, unknown>) => Promise<void>;

  /**
   * Create a subscription checkout for subscription-type products.
   * Optional — only wired when core-subscriptions is installed.
   */
  createSubscriptionCheckout?: (params: {
    planId: string;
    organizationId: string;
    customerEmail?: string;
    providerId: string;
  }) => Promise<string>;
}

let _deps: StoreDeps | null = null;

export function setStoreDeps(deps: StoreDeps): void {
  _deps = deps;
}

export function getStoreDeps(): StoreDeps {
  if (!_deps) {
    throw new Error(
      'Store dependencies not configured. Call setStoreDeps() at startup — see src/core-store/deps.ts',
    );
  }
  return _deps;
}
