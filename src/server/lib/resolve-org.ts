import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '@/server/db';
import { member } from '@/server/db/schema/organization';

/**
 * Resolve the active organization ID for the current user.
 *
 * 1. Returns `activeOrganizationId` if set (user explicitly picked an org).
 * 2. Falls back to the user's first org membership (handles auto-personal-org
 *    case where no org has been explicitly activated yet).
 * 3. Throws if the user has no org at all.
 *
 * The fallback query only runs when `activeOrganizationId` is null — once the
 * user activates an org (via OrgSwitcher or session), it's a zero-cost check.
 */
export async function resolveOrgId(
  activeOrganizationId: string | null | undefined,
  userId: string,
): Promise<string> {
  if (activeOrganizationId) return activeOrganizationId;

  // Fall back to user's first org membership
  const [firstMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);

  if (!firstMembership) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No organization found. Please create or join an organization.',
    });
  }

  return firstMembership.organizationId;
}
