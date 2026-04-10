import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';

import type { DbClient } from '@/server/db';
import { user, session, account } from '@/server/db/schema/auth';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { Policy } from '@/core/policy';
import { logAudit } from '@/core/lib/infra/audit';

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
  adminId: string,
  mode: AnonymizationMode = 'full'
): Promise<void> {
  // 1. Validate: user exists and is not staff
  const [target] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!target) {
    throw new Error('User not found');
  }

  if (Policy.for(target.role).canAccessAdmin()) {
    throw new Error('Cannot anonymize a staff account');
  }

  // 2. Delete all sessions (FK cascades handle related data)
  await db.delete(session).where(eq(session.userId, userId));

  // 3. Delete all accounts (credentials, OAuth tokens)
  await db.delete(account).where(eq(account.userId, userId));

  // 4. Overwrite user PII based on mode
  if (mode === 'pseudonymize') {
    const pseudo = pseudonymize(userId);
    await db
      .update(user)
      .set({
        name: pseudo.name,
        email: pseudo.email,
        image: null,
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
        banned: true,
        banReason: 'GDPR deletion',
        emailVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  }

  // 5. Audit log
  logAudit({
    db,
    userId: adminId,
    action: mode === 'pseudonymize' ? 'gdpr_pseudonymize' : 'gdpr_anonymize',
    entityType: 'user',
    entityId: userId,
    metadata: { mode },
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
    throw new Error('User not found');
  }

  // Collect audit log entries for this user
  const auditEntries = await db
    .select()
    .from(cmsAuditLog)
    .where(eq(cmsAuditLog.userId, userId))
    .limit(1000);

  return {
    user: userData,
    auditLog: auditEntries,
    exportedAt: new Date().toISOString(),
  };
}
