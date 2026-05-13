/**
 * Per-signup lifecycle, separated from `auth.ts` so it is directly
 * unit-testable without having to mock the `better-auth` package surface.
 *
 * `auth.ts` calls this once from Better Auth's `databaseHooks.user.create.after`.
 *
 * Steps (order matters):
 *  1. Create a personal organization + owner membership + billing profile.
 *     On failure, `orgId` stays null so downstream hooks know not to scope.
 *  2. Fire the `user.created` hook — modules register handlers in their deps
 *     files to do per-signup work (link orphaned guest rows, grant reverse
 *     trial, etc.) without `auth.ts` hard-importing their schemas.
 *  3. Fire-and-forget email-list sync (verification email serves as welcome).
 *
 * Hook errors are caught + logged — they never fail the signup.
 */
import { count, eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { organization as organizationTable, member } from '@/server/db/schema/organization';
import { billingProfiles } from '@/core-payments/schema/billing-profile';
import { runHook } from '@/core/lib/module/module-hooks';
import { createLogger } from '@/core/lib/infra/logger';
import { slugify } from '@/core/lib/content/slug';
import { syncSubscriber } from '@/core/lib/email-list/index';

const log = createLogger('auth-hooks');

export async function handleUserCreated(
  user: { id: string; email: string; name?: string | null },
): Promise<{ orgId: string | null }> {
  // 1) Personal org + billing profile. Always runs — even in B2C mode the
  // billing module needs an org owner.
  let orgId: string | null = null;
  try {
    const orgName = user.name ? `${user.name}'s workspace` : 'My workspace';
    let slug = slugify(orgName);
    const [existing] = await db
      .select({ count: count() })
      .from(organizationTable)
      .where(eq(organizationTable.slug, slug));
    if ((existing?.count ?? 0) > 0) {
      slug = `${slug}-${user.id.slice(0, 8)}`;
    }

    orgId = crypto.randomUUID();
    await db.insert(organizationTable).values({
      id: orgId,
      name: orgName,
      slug,
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: user.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await db.insert(billingProfiles).values({
      organizationId: orgId,
      legalName: user.name ?? user.email,
    });

    log.info('Personal org created', { userId: user.id, orgId });
  } catch (err: unknown) {
    log.error('Failed to create personal org', { userId: user.id, error: String(err) });
    orgId = null;
  }

  // 2) Module hooks. Errors here never break signup.
  await runHook(
    'user.created',
    { id: user.id, email: user.email, name: user.name ?? null },
    orgId,
  ).catch((err: unknown) => {
    log.warn('user.created hook failed', { userId: user.id, error: String(err) });
  });

  // 3) Email-list sync (fire-and-forget). Verification email = welcome.
  syncSubscriber(user.email, {
    firstName: user.name ?? undefined,
    tags: ['registered'],
  });

  return { orgId };
}
