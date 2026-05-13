/**
 * Typed accessors over `PlanDefinition.features`.
 *
 * `features` is `Record<string, unknown>` (so projects can add their own
 * flags), which means call sites otherwise litter `plan.features.x as number
 * ?? default` everywhere. These helpers centralize the coercion + defaults,
 * and handle the common "unlimited" sentinel: a feature value of `null` means
 * "no limit", which the numeric helpers surface as `Infinity` so callers can
 * branch on `Number.isFinite()`.
 *
 * Project usage:
 *
 *   featureNumber(plan, 'maxSources', 5)        // → number (or Infinity if null)
 *   featureBool(plan, 'canExport', false)       // → boolean
 *   featureLimit(plan, 'maxSources', 5)         // → number, null → Infinity
 *
 * Wrap them in named functions in your config layer for readability:
 *
 *   export const planSourceLimit = (p) => featureLimit(p, 'maxSources', 5);
 *   export const planCanExport   = (p) => featureBool(p, 'canExport', false);
 */

import type { PlanDefinition } from '../types/billing';

/** Raw numeric feature, with a fallback. `null` → `Infinity`. */
export function featureNumber(plan: PlanDefinition, key: string, fallback: number): number {
  const raw = plan.features[key];
  if (raw === null) return Infinity;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

/**
 * Numeric *limit* feature. Like `featureNumber` but additionally treats any
 * value at or above `unlimitedAt` as effectively unlimited (→ `Infinity`),
 * so a config can say `maxSources: 100000` and consumers still get a clean
 * `Infinity` for "show ∞ / don't enforce".
 */
export function featureLimit(plan: PlanDefinition, key: string, fallback: number, unlimitedAt = 100_000): number {
  const n = featureNumber(plan, key, fallback);
  return n >= unlimitedAt ? Infinity : n;
}

/** Boolean feature flag, with a fallback. Strict `=== true`. */
export function featureBool(plan: PlanDefinition, key: string, fallback = false): boolean {
  const raw = plan.features[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

/** String feature, with a fallback. */
export function featureString(plan: PlanDefinition, key: string, fallback = ''): string {
  const raw = plan.features[key];
  return typeof raw === 'string' ? raw : fallback;
}
