import { TRPCError } from '@trpc/server';
import type { PlanDefinition, PlanFeatures } from '@/core-subscriptions/types/billing';
import { getSubscription } from './subscription-service';

export interface FeatureCheckResult {
  allowed: boolean;
  limit: unknown;
  current?: unknown;
  message?: string;
}

// ─── Plan resolver (set once by the project at startup) ─────────────────────

interface PlanResolver {
  getPlan: (id: string) => PlanDefinition | undefined;
  getFreePlan: () => PlanDefinition;
}

let _resolver: PlanResolver | null = null;

/**
 * Register the project's plan lookup functions.
 * Call once at app startup (e.g., in server.ts or a top-level import).
 */
export function setPlanResolver(resolver: PlanResolver): void {
  _resolver = resolver;
}

function resolver(): PlanResolver {
  if (!_resolver) {
    throw new Error(
      'Plan resolver not configured. Call setPlanResolver() at startup — see src/core/lib/payment/feature-gate.ts',
    );
  }
  return _resolver;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the PlanFeatures for an organization based on its current subscription.
 * Returns free plan features if no active subscription.
 */
export async function getPlanFeatures(orgId: string): Promise<PlanFeatures> {
  const { getPlan, getFreePlan } = resolver();
  const sub = await getSubscription(orgId);
  if (!sub || sub.status === 'canceled') {
    return getFreePlan().features;
  }

  const plan = getPlan(sub.planId);
  return plan?.features ?? getFreePlan().features;
}

/**
 * Check if a feature is available for an organization.
 *
 * For numeric limits: pass `currentValue` to compare against the limit.
 * For boolean flags: checks if the feature is truthy.
 */
export async function checkFeature(
  orgId: string,
  feature: keyof PlanFeatures,
  currentValue?: number,
): Promise<FeatureCheckResult> {
  const features = await getPlanFeatures(orgId);
  const limit = features[feature];

  // Boolean feature
  if (typeof limit === 'boolean') {
    return {
      allowed: limit,
      limit,
      message: limit ? undefined : `${String(feature)} is not available on your current plan`,
    };
  }

  // Numeric limit
  if (typeof limit === 'number' && currentValue !== undefined) {
    const allowed = currentValue < limit;
    return {
      allowed,
      limit,
      current: currentValue,
      message: allowed ? undefined : `You have reached the limit of ${limit} for ${String(feature)} on your current plan`,
    };
  }

  // Unknown feature type — allow by default
  return { allowed: true, limit };
}

/**
 * Require a feature to be available, or throw a FORBIDDEN TRPCError.
 */
export async function requireFeature(
  orgId: string,
  feature: keyof PlanFeatures,
  currentValue?: number,
): Promise<void> {
  const result = await checkFeature(orgId, feature, currentValue);
  if (!result.allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: result.message ?? `Feature ${String(feature)} is not available on your current plan`,
    });
  }
}
