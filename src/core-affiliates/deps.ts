/**
 * core-affiliates dependency injection.
 *
 * Framework conventions (trpc, user table, db, audit) are imported directly.
 * Only project-specific cross-module dependencies are injected here.
 */

export interface AffiliatesDeps {
  /**
   * Get revenue data per user for attribution breakdown.
   * Returns a map of userId → { totalRevenueCents, hasSucceededPayment }.
   * If billing is not installed, return empty map — breakdowns show 0 revenue.
   */
  getRevenueByUsers: (userIds: string[]) => Promise<Map<string, { totalRevenueCents: number }>>;

  /**
   * Payment transactions table reference for SQL JOINs in attribution queries.
   * If billing is not installed, pass null — revenue columns show 0.
   */
  paymentTransactionsTable: {
    userId: unknown;
    status: unknown;
    amountCents: unknown;
  } | null;
}

let _deps: AffiliatesDeps | null = null;

export function setAffiliatesDeps(deps: AffiliatesDeps): void {
  _deps = deps;
}

export function getAffiliatesDeps(): AffiliatesDeps {
  if (!_deps) {
    throw new Error(
      'Affiliates dependencies not configured. Call setAffiliatesDeps() at startup — see src/core-affiliates/deps.ts',
    );
  }
  return _deps;
}
