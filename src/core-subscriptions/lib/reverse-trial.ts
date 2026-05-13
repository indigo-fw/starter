/**
 * Reverse trial — give every new signup a no-card, full-tier trial.
 *
 * `PlanDefinition.trialDays` only does a *Stripe-checkout* trial (card up
 * front, starts when they subscribe). The reverse trial is the conversion
 * pattern: on signup, the user gets full top-tier access for N days with no
 * card; when it lapses without converting, they drop to Free. Implemented as
 * a `saas_subscriptions` row with `providerId='trial'`, `status='trialing'`,
 * `trialEnd = now + N days`, `planId = <top tier>` — so the existing plan
 * resolver picks it up (as long as it treats `'trialing'` as active, which
 * it should).
 *
 * Opt-in. Wire it in your project:
 *
 *   // src/config/deps/subscriptions-deps.ts (already in core-subscriptions' serverInit)
 *   import { setReverseTrialConfig } from '@/core-subscriptions/lib/reverse-trial';
 *   import { registerHook } from '@/core/lib/module/module-hooks';
 *   import { grantReverseTrialOnSignup } from '@/core-subscriptions/lib/reverse-trial';
 *
 *   setReverseTrialConfig({ plan: 'pro', days: 14 });
 *   registerHook('user.created', (_, orgId) => grantReverseTrialOnSignup(orgId));
 *
 *   // server.ts — alongside the dunning cron
 *   registerCronJob({ name: 'reverse-trial-expiry', pattern: '0 2 * * *', handler: async () => {
 *     const { expireDueReverseTrials } = await import('./src/core-subscriptions/lib/reverse-trial');
 *     await expireDueReverseTrials();
 *   }});
 *   registerCronJob({ name: 'reverse-trial-warnings', pattern: '0 3 * * *', handler: async () => {
 *     const { sendReverseTrialWarnings } = await import('./src/core-subscriptions/lib/reverse-trial');
 *     await sendReverseTrialWarnings();   // requires a `trial-ending` email template + user prefs for idempotency
 *   }});
 *
 * If `setReverseTrialConfig` is never called, all of these are no-ops, so
 * existing behavior is unchanged.
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { saasSubscriptions } from '@/core-subscriptions/schema/subscriptions';
import { member } from '@/server/db/schema/organization';
import { user } from '@/server/db/schema/auth';
import { createLogger } from '@/core/lib/infra/logger';
import { enqueueTemplateEmail } from '@/core/lib/email';
import { getUserPref, patchUserPrefs } from '@/core/lib/preferences';
import { getSubscriptionsDeps } from '@/core-subscriptions/deps';

const log = createLogger('reverse-trial');

const TRIAL_PROVIDER = 'trial';

interface ReverseTrialConfig {
  /** Plan id to grant during the trial (e.g. 'pro'). Must match a PlanDefinition. */
  plan: string;
  /** Trial length in days. */
  days: number;
}

let config: ReverseTrialConfig | null = null;

export function setReverseTrialConfig(cfg: ReverseTrialConfig): void {
  config = cfg;
}

/** Reset reverse-trial config to unconfigured. Primary use is in tests. */
export function clearReverseTrialConfig(): void {
  config = null;
}

export function getReverseTrialConfig(): ReverseTrialConfig | null {
  return config;
}

/**
 * Grant the reverse trial to a freshly-created org. No-op if reverse trial
 * isn't configured, the org already has any active/trialing subscription, or
 * `orgId` is null (org creation failed upstream).
 */
export async function grantReverseTrialOnSignup(orgId: string | null): Promise<void> {
  if (!config || !orgId) return;
  try {
    const existing = await db
      .select({ id: saasSubscriptions.id })
      .from(saasSubscriptions)
      .where(and(
        eq(saasSubscriptions.organizationId, orgId),
        sql`${saasSubscriptions.status} IN ('active', 'trialing', 'past_due')`,
      ))
      .limit(1);
    if (existing.length > 0) return;

    const trialEnd = new Date();
    trialEnd.setUTCDate(trialEnd.getUTCDate() + config.days);
    await db.insert(saasSubscriptions).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      providerId: TRIAL_PROVIDER,
      providerCustomerId: `trial:${orgId}`,
      planId: config.plan,
      status: 'trialing',
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEnd,
      trialEnd,
    });
    log.info('reverse trial granted', { orgId, plan: config.plan, days: config.days, trialEnd });
  } catch (err) {
    log.warn('failed to grant reverse trial', { orgId, error: String(err) });
  }
}

/**
 * Flip every reverse-trial row past its `trialEnd` to `status='canceled'`.
 * Only touches `providerId='trial'` rows — real Stripe subscriptions are
 * untouched. Returns the count expired.
 */
export async function expireDueReverseTrials(): Promise<number> {
  const result = await db
    .update(saasSubscriptions)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(
      eq(saasSubscriptions.providerId, TRIAL_PROVIDER),
      eq(saasSubscriptions.status, 'trialing'),
      lt(saasSubscriptions.trialEnd, sql`now()`),
    ))
    .returning({ id: saasSubscriptions.id });
  if (result.length > 0) log.info(`expired ${result.length} reverse trials`);
  return result.length;
}

/** Org IDs whose reverse trial ends in roughly `daysLeft` days (1-day window). */
export async function findReverseTrialsEndingIn(daysLeft: number): Promise<{ orgId: string; trialEnd: Date }[]> {
  const lo = daysLeft - 0.5;
  const hi = daysLeft + 0.5;
  const rows = await db
    .select({ orgId: saasSubscriptions.organizationId, trialEnd: saasSubscriptions.trialEnd })
    .from(saasSubscriptions)
    .where(and(
      eq(saasSubscriptions.providerId, TRIAL_PROVIDER),
      eq(saasSubscriptions.status, 'trialing'),
      sql`${saasSubscriptions.trialEnd} > now() + (${lo} || ' days')::interval`,
      sql`${saasSubscriptions.trialEnd} < now() + (${hi} || ' days')::interval`,
    ));
  return rows
    .filter((r): r is { orgId: string; trialEnd: Date } => r.trialEnd !== null)
    .map((r) => ({ orgId: r.orgId, trialEnd: r.trialEnd }));
}

/**
 * Send "your trial ends in N days" emails at D-3 and D-1.
 *
 * Resolves each org's owner, sends the `trial-ending` template, and records a
 * per-user `cms_user_preferences` flag keyed by the trial-end date so a given
 * warning never goes out twice (idempotent under cron retry / TZ jitter).
 *
 * Requires: a `trial-ending.html` email template and reverse trial configured.
 * No-op otherwise.
 */
export async function sendReverseTrialWarnings(): Promise<void> {
  if (!config) return;
  const planName = (() => { try { return getSubscriptionsDeps().getPlan(config!.plan)?.name ?? config!.plan; } catch { return config!.plan; } })();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  for (const daysLeft of [3, 1]) {
    const ending = await findReverseTrialsEndingIn(daysLeft);
    if (ending.length === 0) continue;
    const orgIds = ending.map((e) => e.orgId);
    // org → owner → email/name (one query for the batch)
    const owners = await db
      .select({ orgId: member.organizationId, userId: member.userId, email: user.email, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(inArray(member.organizationId, orgIds), eq(member.role, 'owner')));
    const byOrg = new Map(owners.map((o) => [o.orgId, o]));

    for (const { orgId, trialEnd } of ending) {
      const owner = byOrg.get(orgId);
      if (!owner?.email) continue;
      const flag = `reverseTrialWarn${daysLeft}d:${trialEnd.toISOString().slice(0, 10)}`;
      if (await getUserPref(owner.userId, flag, false)) continue;
      try {
        await enqueueTemplateEmail(owner.email, 'trial-ending' as Parameters<typeof enqueueTemplateEmail>[1], {
          firstName: owner.name?.split(' ')[0] ?? 'there',
          planName,
          daysLeft: String(daysLeft),
          daysPlural: daysLeft === 1 ? '' : 's',
          pricingUrl: `${appUrl}/pricing`,
          brandColor: '#6d28d9',
        });
        await patchUserPrefs(owner.userId, { [flag]: true });
      } catch (err) {
        log.warn('trial warning email failed', { orgId, error: String(err) });
      }
    }
  }
}
