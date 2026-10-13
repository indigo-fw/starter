import { TRPCError } from '@trpc/server';
import { createHmac } from 'crypto';
import { eq } from 'drizzle-orm';

import { invalidateUserSessions } from '@/core/lib/auth/session-invalidation';
import { logAudit } from '@/core/lib/infra/audit';
import { createLogger } from '@/core/lib/infra/logger';
import { runGuard, runHook } from '@/core/lib/module/module-hooks';
import { Policy } from '@/core/policy';
import type { DbClient } from '@/server/db';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { account, session, user } from '@/server/db/schema/auth';

const logger = createLogger('GDPR');

export type AnonymizationMode = 'full' | 'pseudonymize';

function pseudonymize(userId: string): { name: string; email: string } {
  const secret = process.env.BETTER_AUTH_SECRET ?? 'indigo-default-secret';
  const hash = createHmac('sha256', secret).update(userId).digest('hex');
  return {
    name: `User-${hash.slice(0, 8)}`,
    email: `${hash.slice(0, 12)}@anon.local`,
  };
}

/** Check if a user record has been anonymized */
export function isAnonymized(userRecord: { email: string }): boolean {
  return (
    userRecord.email.endsWith('@gdpr.invalid') ||
    userRecord.email.endsWith('@anon.local')
  );
}

/**
 * Anonymize a user's PII for GDPR compliance.
 * Deletes sessions + accounts, overwrites user PII, bans the account.
 *
 * Modes:
 * - 'full' (default): replaces PII with non-reversible placeholder data
 * - 'pseudonymize': replaces PII with HMAC-derived deterministic pseudonyms
 */
export async function anonymizeUser(
  db: DbClient,
  userId: string,
  adminId?: string,
  mode: AnonymizationMode = 'full'
): Promise<void> {
  // 1. Validate: user exists, not already anonymized, and is not staff
  const [target] = await db
    .select({ id: user.id, role: user.role, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  // TRPCErrors (not plain Error) so routers can pass refusals straight through
  // with the right status, and treat anything else as an internal failure
  // whose message must not reach the client.
  if (!target) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  if (isAnonymized(target)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'User has already been deleted',
    });
  }

  if (Policy.for(target.role).canAccessAdmin()) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot anonymize a staff account',
    });
  }

  // 2. Run pre-delete hooks (e.g. cancel subscriptions)
  try {
    await runHook('user.beforeDelete', userId);
  } catch (err) {
    logger.warn('user.beforeDelete hook failed', {
      userId,
      error: String(err),
    });
  }

  // 3. Let every installed module erase its own record of this person BEFORE
  //    anything is destroyed. runGuard (not runHook) so a failing scrubber
  //    aborts here — retryable, with the user row still intact — instead of
  //    reporting success while module-owned PII survives.
  await runGuard('user.anonymize', userId);

  // 4. Delete all sessions (FK cascades handle related data) and void the
  //    cookie-cached ones so the erased account can't keep acting for 5 min
  await db.delete(session).where(eq(session.userId, userId));
  invalidateUserSessions(userId);

  // 5. Delete all accounts (credentials, OAuth tokens)
  await db.delete(account).where(eq(account.userId, userId));

  // 6. Overwrite user PII based on mode
  if (mode === 'pseudonymize') {
    const pseudo = pseudonymize(userId);
    await db
      .update(user)
      .set({
        name: pseudo.name,
        email: pseudo.email,
        image: null,
        lastIp: null,
        banned: true,
        banReason: 'GDPR pseudonymization',
        emailVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  } else {
    await db
      .update(user)
      .set({
        name: 'deleted_user',
        email: `deleted-${userId}@gdpr.invalid`,
        image: null,
        lastIp: null,
        banned: true,
        banReason: 'GDPR deletion',
        emailVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  }

  // 7. Audit log
  logAudit({
    db,
    userId: adminId ?? userId,
    action: mode === 'pseudonymize' ? 'gdpr_pseudonymize' : 'gdpr_anonymize',
    entityType: 'user',
    entityId: userId,
    metadata: { mode, self_service: !adminId },
  });
}

/**
 * Export all user data as a JSON object for GDPR data portability.
 */
export async function exportUserData(
  db: DbClient,
  userId: string
): Promise<Record<string, unknown>> {
  const [userData] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      lang: user.lang,
      country: user.country,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userData) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  // Collect audit log entries for this user
  const auditEntries = await db
    .select()
    .from(cmsAuditLog)
    .where(eq(cmsAuditLog.userId, userId))
    .limit(1000);

  const bundle: Record<string, unknown> = {
    user: userData,
    auditLog: auditEntries,
  };

  // Let each installed module add what IT knows about this person — support
  // tickets, comments, orders, chat history. Core cannot see module tables, so
  // without this the export silently omits most of the user's data. A guard,
  // not a fire-and-forget hook: a failing exporter must not produce a bundle
  // that looks complete.
  await runGuard('user.export', userId, bundle);

  return { ...bundle, exportedAt: new Date().toISOString() };
}
