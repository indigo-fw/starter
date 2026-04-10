import { and, eq, gte, lte, lt } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptions } from '@/core-subscriptions/schema/subscriptions';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';
import { member } from '@/server/db/schema/organization';
import { user } from '@/server/db/schema/auth';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { createLogger } from '@/core/lib/infra/logger';
import { logAudit } from '@/core/lib/infra/audit';
import { getSubscriptionsDeps } from '@/core-subscriptions/deps';


import {
  reconcileStalePendingTransactions,
  type ProviderCheckFn,
} from '@/core-subscriptions/lib/reconciliation-service';

const log = createLogger('dunning');

/**
 * Check for subscriptions expiring within 7 days and send reminders.
 * Skips if already reminded (checks audit log).
 */
export async function checkExpiringSubscriptions(): Promise<void> {
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const expiring = await db
    .select({
      id: saasSubscriptions.id,
      organizationId: saasSubscriptions.organizationId,
      planId: saasSubscriptions.planId,
      providerId: saasSubscriptions.providerId,
      currentPeriodEnd: saasSubscriptions.currentPeriodEnd,
    })
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.status, 'active'),
        lte(saasSubscriptions.currentPeriodEnd, sevenDaysOut),
        gte(saasSubscriptions.currentPeriodEnd, now)
      )
    )
    .limit(200);

  for (const sub of expiring) {
    if (!sub.currentPeriodEnd) continue;

    // Check if already reminded
    const [alreadyReminded] = await db
      .select({ id: cmsAuditLog.id })
      .from(cmsAuditLog)
      .where(
        and(
          eq(cmsAuditLog.action, 'dunning.expiring'),
          eq(cmsAuditLog.entityId, sub.id)
        )
      )
      .limit(1);

    if (alreadyReminded) continue;

    const plan = getSubscriptionsDeps().getPlan(sub.planId);
    const daysLeft = Math.ceil(
      (sub.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Send notification to all org members
    getSubscriptionsDeps().sendOrgNotification(sub.organizationId, {
      title: 'Subscription expiring soon',
      body: `Your ${plan?.name ?? sub.planId} plan expires in ${daysLeft} days. Please renew to avoid service interruption.`,
      actionUrl: '/dashboard/settings/billing',
    });

    // Send email to org members
    const admins = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, sub.organizationId))
      .limit(10);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    for (const admin of admins) {
      getSubscriptionsDeps().enqueueTemplateEmail(admin.email, 'subscription-expiring', {
        planName: plan?.name ?? sub.planId,
        daysLeft: String(daysLeft),
        billingUrl: `${appUrl}/dashboard/settings/billing`,
      }).catch((err) => log.error('Failed to send expiring email', { error: String(err) }));
    }

    logAudit({
      db,
      userId: 'system',
      action: 'dunning.expiring',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { orgId: sub.organizationId, daysLeft },
    });

    log.info('Sent expiring reminder', { subId: sub.id, orgId: sub.organizationId, daysLeft });
  }
}

/**
 * Check for expired subscriptions and mark as past_due.
 * Only for non-Stripe providers (Stripe handles this via webhooks).
 */
export async function checkExpiredSubscriptions(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select({
      id: saasSubscriptions.id,
      organizationId: saasSubscriptions.organizationId,
      planId: saasSubscriptions.planId,
      providerId: saasSubscriptions.providerId,
    })
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.status, 'active'),
        lte(saasSubscriptions.currentPeriodEnd, now)
      )
    )
    .limit(200);

  for (const sub of expired) {
    // Stripe handles its own expiration via webhooks
    if (sub.providerId === 'stripe') continue;

    await db
      .update(saasSubscriptions)
      .set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(saasSubscriptions.id, sub.id));

    const plan = getSubscriptionsDeps().getPlan(sub.planId);

    getSubscriptionsDeps().sendOrgNotification(sub.organizationId, {
      title: 'Subscription expired',
      body: `Your ${plan?.name ?? sub.planId} plan has expired. Please renew to continue using premium features.`,
      actionUrl: '/dashboard/settings/billing',
    });

    // Send expired email to org members
    const admins = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, sub.organizationId))
      .limit(10);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    for (const admin of admins) {
      getSubscriptionsDeps().enqueueTemplateEmail(admin.email, 'subscription-expired', {
        planName: plan?.name ?? sub.planId,
        billingUrl: `${appUrl}/dashboard/settings/billing`,
      }).catch((err) => log.error('Failed to send expired email', { error: String(err) }));
    }

    logAudit({
      db,
      userId: 'system',
      action: 'dunning.expired',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { orgId: sub.organizationId },
    });

    log.info('Marked subscription as past_due', { subId: sub.id, orgId: sub.organizationId });
  }
}

/**
 * Check for subscriptions with expired grace periods and mark as past_due.
 * Grace periods are set when a payment fails (e.g. Stripe invoice.payment_failed).
 */
export async function checkGracePeriods(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select({
      id: saasSubscriptions.id,
      organizationId: saasSubscriptions.organizationId,
      planId: saasSubscriptions.planId,
    })
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.status, 'active'),
        lt(saasSubscriptions.gracePeriodEndsAt, now)
      )
    )
    .limit(200);

  for (const sub of expired) {
    await db
      .update(saasSubscriptions)
      .set({ status: 'past_due', gracePeriodEndsAt: null, updatedAt: new Date() })
      .where(eq(saasSubscriptions.id, sub.id));

    const plan = getSubscriptionsDeps().getPlan(sub.planId);

    getSubscriptionsDeps().sendOrgNotification(sub.organizationId, {
      title: 'Payment overdue',
      body: `Your ${plan?.name ?? sub.planId} plan grace period has ended. Please update your payment method to avoid losing access.`,
      actionUrl: '/dashboard/settings/billing',
    });

    logAudit({
      db,
      userId: 'system',
      action: 'dunning.grace_expired',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { orgId: sub.organizationId },
    });

    log.info('Grace period expired, marked past_due', { subId: sub.id, orgId: sub.organizationId });
  }
}

/**
 * Check for long-overdue subscriptions (past_due > 30 days) and cancel them.
 * Downgrades to free plan. Only for non-Stripe providers (Stripe handles its own lifecycle).
 */
export async function checkLongOverdueSubscriptions(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const overdue = await db
    .select({
      id: saasSubscriptions.id,
      organizationId: saasSubscriptions.organizationId,
      planId: saasSubscriptions.planId,
      providerId: saasSubscriptions.providerId,
    })
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.status, 'past_due'),
        lte(saasSubscriptions.updatedAt, thirtyDaysAgo)
      )
    )
    .limit(200);

  for (const sub of overdue) {
    // Stripe handles its own cancellation lifecycle
    if (sub.providerId === 'stripe') continue;

    await db
      .update(saasSubscriptions)
      .set({ status: 'canceled', planId: 'free', updatedAt: new Date() })
      .where(eq(saasSubscriptions.id, sub.id));

    const plan = getSubscriptionsDeps().getPlan(sub.planId);

    getSubscriptionsDeps().sendOrgNotification(sub.organizationId, {
      title: 'Subscription canceled',
      body: `Your ${plan?.name ?? sub.planId} plan has been canceled due to non-payment. You have been downgraded to the free plan.`,
      actionUrl: '/dashboard/settings/billing',
    });

    // Send cancellation email to org members
    const admins = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, sub.organizationId))
      .limit(10);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    for (const admin of admins) {
      getSubscriptionsDeps().enqueueTemplateEmail(admin.email, 'subscription-canceled', {
        planName: plan?.name ?? sub.planId,
        billingUrl: `${appUrl}/dashboard/settings/billing`,
      }).catch((err) => log.error('Failed to send cancellation email', { error: String(err) }));
    }

    logAudit({
      db,
      userId: 'system',
      action: 'dunning.canceled',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { orgId: sub.organizationId, previousPlan: sub.planId },
    });

    log.info('Canceled long-overdue subscription', { subId: sub.id, orgId: sub.organizationId });
  }
}

/** 10-second timeout for provider API calls */
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Check Stripe for the actual status of a payment session/subscription.
 */
async function checkStripeTransaction(
  providerTxId: string
): Promise<'successful' | 'pending' | 'failed'> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return 'pending';

  // providerTxId could be a checkout session ID or subscription ID
  const isCheckout = providerTxId.startsWith('cs_');

  const url = isCheckout
    ? `https://api.stripe.com/v1/checkout/sessions/${providerTxId}`
    : `https://api.stripe.com/v1/subscriptions/${providerTxId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${stripeKey}` },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  // Rate limited or auth failure — don't mark as failed, try again later
  if (res.status === 429 || res.status === 401) return 'pending';
  // 404 means the resource doesn't exist at Stripe — genuinely failed/expired
  if (res.status === 404) return 'failed';
  // Other server errors — don't make assumptions, keep as pending
  if (!res.ok) return 'pending';

  const data = (await res.json()) as Record<string, unknown>;

  if (isCheckout) {
    const status = data.payment_status as string;
    if (status === 'paid') return 'successful';
    if (status === 'unpaid' || status === 'no_payment_required') return 'pending';
    return 'failed';
  }

  // Subscription status
  const subStatus = data.status as string;
  if (subStatus === 'active' || subStatus === 'trialing') return 'successful';
  if (subStatus === 'past_due' || subStatus === 'incomplete') return 'pending';
  return 'failed';
}

/**
 * Check NOWPayments for the actual status of an invoice.
 */
async function checkNowPaymentsTransaction(
  providerTxId: string
): Promise<'successful' | 'pending' | 'failed'> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return 'pending';

  const isSandbox = process.env.NOWPAYMENTS_SANDBOX !== 'false';
  const baseUrl = isSandbox
    ? 'https://api-sandbox.nowpayments.io/v1'
    : 'https://api.nowpayments.io/v1';

  const res = await fetch(`${baseUrl}/payment/${providerTxId}`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  // Rate limited or auth failure — keep as pending, try again later
  if (res.status === 429 || res.status === 401 || res.status === 403) return 'pending';
  if (res.status === 404) return 'failed';
  if (!res.ok) return 'pending';

  const data = (await res.json()) as Record<string, unknown>;
  const status = data.payment_status as string;

  if (status === 'finished' || status === 'confirmed') return 'successful';
  if (status === 'waiting' || status === 'confirming' || status === 'sending')
    return 'pending';
  return 'failed';
}

/**
 * Reconcile stale pending payment transactions by checking with providers.
 */
export async function runReconciliation(): Promise<void> {
  const providerChecks: Record<string, ProviderCheckFn> = {};

  if (process.env.STRIPE_SECRET_KEY) {
    providerChecks['stripe'] = checkStripeTransaction;
  }
  if (process.env.NOWPAYMENTS_API_KEY) {
    providerChecks['nowpayments'] = checkNowPaymentsTransaction;
  }

  if (Object.keys(providerChecks).length === 0) {
    return;
  }

  const result = await reconcileStalePendingTransactions(
    db,
    saasPaymentTransactions,
    providerChecks,
    { staleThresholdHours: 24 }
  );

  if (result.checked > 0) {
    log.info('Reconciliation results', result);
  }
}

/**
 * Run all dunning checks. Called by the scheduled job.
 */
export async function runDunningChecks(): Promise<void> {
  log.info('Running dunning checks');
  try {
    // Reconcile stale transactions first — recovered payments affect dunning
    await runReconciliation();
    await checkExpiringSubscriptions();
    await checkExpiredSubscriptions();
    await checkGracePeriods();
    await checkLongOverdueSubscriptions();
    log.info('Dunning checks complete');
  } catch (err) {
    log.error('Dunning check failed', { error: String(err) });
  }
}
