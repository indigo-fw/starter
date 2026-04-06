/**
 * core-subscriptions dependency injection.
 *
 * Framework conventions (trpc, db, user/org/member tables, audit, core utils)
 * are imported directly. Only project-specific behavior is injected here.
 */
import type { PlanDefinition } from '@/core-subscriptions/types/billing';

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
    actionUrl?: string;
  }) => void;

  /** Enqueue a template email. Fire-and-forget. Returns a promise (can be caught). */
  enqueueTemplateEmail: (to: string, template: string, data: Record<string, unknown>) => Promise<void>;

  /** Broadcast a real-time event to a WebSocket channel. Fire-and-forget. */
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void;
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
