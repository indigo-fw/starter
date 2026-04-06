/**
 * core-store dependency injection.
 *
 * Injects payment processing (via core-billing) and notifications.
 * Framework conventions (trpc, db, user/org tables) imported directly.
 */

export interface StoreDeps {
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
