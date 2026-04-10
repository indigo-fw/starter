import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptions } from '@/core-subscriptions/schema/subscriptions';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('subscription-service');

/**
 * Activate or update a subscription for an organization.
 * Upserts by providerSubscriptionId (or inserts if not present).
 */
export async function activateSubscription(params: {
  organizationId: string;
  planId: string;
  providerId: string;
  interval: 'monthly' | 'yearly';
  providerCustomerId: string;
  providerSubscriptionId?: string;
  providerPriceId?: string;
  status?: string;
  periodStart?: Date;
  periodEnd?: Date;
  trialEnd?: Date;
}) {
  const {
    organizationId,
    planId,
    providerId,
    providerCustomerId,
    providerSubscriptionId,
    providerPriceId,
    status = 'active',
    periodStart,
    periodEnd,
    trialEnd,
  } = params;

  if (providerSubscriptionId) {
    await db
      .insert(saasSubscriptions)
      .values({
        organizationId,
        providerId,
        providerCustomerId,
        providerSubscriptionId,
        providerPriceId: providerPriceId ?? null,
        planId,
        status,
        currentPeriodStart: periodStart ?? null,
        currentPeriodEnd: periodEnd ?? null,
        trialEnd: trialEnd ?? null,
      })
      .onConflictDoUpdate({
        target: saasSubscriptions.providerSubscriptionId,
        set: {
          providerPriceId: providerPriceId ?? null,
          planId,
          status,
          currentPeriodStart: periodStart ?? null,
          currentPeriodEnd: periodEnd ?? null,
          trialEnd: trialEnd ?? null,
          updatedAt: new Date(),
        },
      });
  } else {
    // No subscription ID (e.g. crypto one-time) — upsert by org+provider
    const [existing] = await db
      .select({ id: saasSubscriptions.id })
      .from(saasSubscriptions)
      .where(
        and(
          eq(saasSubscriptions.organizationId, organizationId),
          eq(saasSubscriptions.providerId, providerId),
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(saasSubscriptions)
        .set({
          providerCustomerId,
          providerPriceId: providerPriceId ?? null,
          planId,
          status,
          currentPeriodStart: periodStart ?? null,
          currentPeriodEnd: periodEnd ?? null,
          updatedAt: new Date(),
        })
        .where(eq(saasSubscriptions.id, existing.id));
    } else {
      await db.insert(saasSubscriptions).values({
        organizationId,
        providerId,
        providerCustomerId,
        providerPriceId: providerPriceId ?? null,
        planId,
        status,
        currentPeriodStart: periodStart ?? null,
        currentPeriodEnd: periodEnd ?? null,
      });
    }
  }

  logger.info('Subscription activated', { organizationId, planId, providerId });
}

/**
 * Update a subscription by provider subscription ID.
 */
export async function updateSubscription(
  providerSubscriptionId: string,
  data: {
    planId?: string;
    status?: string;
    providerPriceId?: string;
    periodStart?: Date;
    periodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
  }
) {
  await db
    .update(saasSubscriptions)
    .set({
      ...(data.planId !== undefined && { planId: data.planId }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.providerPriceId !== undefined && { providerPriceId: data.providerPriceId }),
      ...(data.periodStart !== undefined && { currentPeriodStart: data.periodStart }),
      ...(data.periodEnd !== undefined && { currentPeriodEnd: data.periodEnd }),
      ...(data.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: data.cancelAtPeriodEnd }),
      updatedAt: new Date(),
    })
    .where(eq(saasSubscriptions.providerSubscriptionId, providerSubscriptionId));
}

/**
 * Cancel a subscription by provider subscription ID.
 * If cancelAtPeriodEnd was set, keeps the current plan until period ends.
 * If immediate cancellation, downgrades to free immediately.
 */
export async function cancelSubscription(providerSubscriptionId: string) {
  // Check if this is a cancel-at-period-end subscription
  const [sub] = await db
    .select({
      cancelAtPeriodEnd: saasSubscriptions.cancelAtPeriodEnd,
      currentPeriodEnd: saasSubscriptions.currentPeriodEnd,
    })
    .from(saasSubscriptions)
    .where(eq(saasSubscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1);

  const isPeriodEnd = sub?.cancelAtPeriodEnd && sub?.currentPeriodEnd && sub.currentPeriodEnd > new Date();

  await db
    .update(saasSubscriptions)
    .set({
      status: 'canceled',
      // Keep current plan if canceling at period end and period hasn't ended yet
      ...(isPeriodEnd ? {} : { planId: 'free' }),
      updatedAt: new Date(),
    })
    .where(eq(saasSubscriptions.providerSubscriptionId, providerSubscriptionId));
}

/**
 * Get the current subscription for an organization.
 */
export async function getSubscription(orgId: string) {
  const [sub] = await db
    .select()
    .from(saasSubscriptions)
    .where(eq(saasSubscriptions.organizationId, orgId))
    .limit(1);

  return sub ?? null;
}

/**
 * Look up organization ID by provider subscription ID.
 */
export async function getOrgByProviderSubscription(providerSubscriptionId: string) {
  const [sub] = await db
    .select({ organizationId: saasSubscriptions.organizationId })
    .from(saasSubscriptions)
    .where(eq(saasSubscriptions.providerSubscriptionId, providerSubscriptionId))
    .limit(1);

  return sub?.organizationId ?? null;
}
