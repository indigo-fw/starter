import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '../trpc';
import { organization, member, invitation } from '@/server/db/schema';
import { auth } from '@/lib/auth';
import { logAudit } from '@/core/lib/infra/audit';
import { sendNotification, sendBulkNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { runGuard } from '@/core/lib/module/module-hooks';

export const organizationsRouter = createTRPCRouter({
  /** List organizations the current user is a member of */
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db
      .select({
        orgId: member.organizationId,
        role: member.role,
        orgName: organization.name,
        orgSlug: organization.slug,
        orgLogo: organization.logo,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, ctx.session.user.id))
      .orderBy(desc(organization.createdAt))
      .limit(50);

    return memberships;
  }),

  /** Get a single organization by ID (must be a member) */
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, input.id), eq(member.userId, ctx.session.user.id)))
        .limit(1);

      if (!memberRecord) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
      }

      const [org] = await ctx.db
        .select()
        .from(organization)
        .where(eq(organization.id, input.id))
        .limit(1);

      return { ...org, memberRole: memberRecord.role };
    }),

  /** Create a new organization via Better Auth */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api.createOrganization({
        headers: ctx.headers,
        body: { name: input.name, slug: input.slug },
      });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'organization.create',
        entityType: 'organization',
        entityId: (result as { id: string }).id,
        metadata: { name: input.name },
      });

      return result;
    }),

  /** Update organization (owner/admin only — enforced by Better Auth) */
  update: protectedProcedure
    .input(z.object({
      id: z.string().min(1).max(255),
      name: z.string().min(1).max(100).optional(),
      logo: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api.updateOrganization({
        headers: ctx.headers,
        body: { organizationId: input.id, data: { name: input.name, logo: input.logo } },
      });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'organization.update',
        entityType: 'organization',
        entityId: input.id,
      });

      return result;
    }),

  /** Delete organization (owner only — enforced by Better Auth) */
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await auth.api.deleteOrganization({
        headers: ctx.headers,
        body: { organizationId: input.id },
      });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'organization.delete',
        entityType: 'organization',
        entityId: input.id,
      });

      return { success: true };
    }),

  /** Set the active organization in the current session */
  setActive: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(255).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await auth.api.setActiveOrganization({
        headers: ctx.headers,
        body: { organizationId: input.organizationId },
      });
      return { success: true };
    }),

  /** Invite a member by email (owner/admin — enforced by Better Auth) */
  inviteMember: protectedProcedure
    .input(z.object({
      organizationId: z.string().min(1).max(255),
      email: z.string().email(),
      role: z.enum(['admin', 'member']).default('member'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check maxMembers feature gate
      const currentMembers = await ctx.db
        .select({ id: member.id })
        .from(member)
        .where(eq(member.organizationId, input.organizationId))
        .limit(1000);

      // Throws TRPCError if plan limit exceeded (no-op if subscriptions module not installed)
      await runGuard('feature.require', input.organizationId, 'maxMembers', currentMembers.length);

      const result = await auth.api.createInvitation({
        headers: ctx.headers,
        body: {
          organizationId: input.organizationId,
          email: input.email,
          role: input.role,
        },
      });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'organization.invite',
        entityType: 'organization',
        entityId: input.organizationId,
        metadata: { email: input.email, role: input.role },
      });

      return result;
    }),

  /** List members of an organization (must be a member) */
  listMembers: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      // Verify caller is a member
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, ctx.session.user.id)))
        .limit(1);

      if (!memberRecord) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member' });
      }

      const result = await auth.api.getFullOrganization({
        headers: ctx.headers,
        query: { organizationId: input.organizationId },
      });

      return result;
    }),

  /** Remove a member from an organization (owner/admin — enforced by Better Auth) */
  removeMember: protectedProcedure
    .input(z.object({
      organizationId: z.string().min(1).max(255),
      memberId: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      // Look up the member's userId and org name before removal
      const [memberRecord] = await ctx.db
        .select({ userId: member.userId, orgName: organization.name })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, input.organizationId),
          )
        )
        .limit(1);

      await auth.api.removeMember({
        headers: ctx.headers,
        body: {
          organizationId: input.organizationId,
          memberIdOrEmail: input.memberId,
        },
      });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'organization.removeMember',
        entityType: 'organization',
        entityId: input.organizationId,
        metadata: { memberId: input.memberId },
      });

      // Notify the removed member
      if (memberRecord) {
        sendNotification({
          userId: memberRecord.userId,
          title: 'Removed from organization',
          body: `You have been removed from ${memberRecord.orgName}.`,
          type: NotificationType.WARNING,
          category: NotificationCategory.ORGANIZATION,
          orgId: input.organizationId,
        });
      }

      return { success: true };
    }),

  /** Leave an organization */
  leave: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await auth.api.removeMember({
        headers: ctx.headers,
        body: {
          organizationId: input.organizationId,
          memberIdOrEmail: ctx.session.user.id,
        },
      });
      return { success: true };
    }),

  /** List pending invitations for an organization (must be a member) */
  listInvitations: protectedProcedure
    .input(z.object({ organizationId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, ctx.session.user.id)))
        .limit(1);

      if (!memberRecord) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member' });
      }

      const invitations_list = await ctx.db
        .select()
        .from(invitation)
        .where(and(
          eq(invitation.organizationId, input.organizationId),
          eq(invitation.status, 'pending'),
        ))
        .orderBy(desc(invitation.createdAt))
        .limit(50);

      return invitations_list;
    }),

  /** Cancel a pending invitation */
  cancelInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await auth.api.cancelInvitation({
        headers: ctx.headers,
        body: { invitationId: input.invitationId },
      });
      return { success: true };
    }),

  /** Accept an invitation to join an organization */
  acceptInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      // Look up invitation details before accepting
      const [inv] = await ctx.db
        .select({
          organizationId: invitation.organizationId,
          orgName: organization.name,
        })
        .from(invitation)
        .innerJoin(organization, eq(invitation.organizationId, organization.id))
        .where(eq(invitation.id, input.invitationId))
        .limit(1);

      await auth.api.acceptInvitation({
        headers: ctx.headers,
        body: { invitationId: input.invitationId },
      });

      // Notify org admins/owners that a new member joined
      if (inv) {
        const adminMembers = await ctx.db
          .select({ userId: member.userId })
          .from(member)
          .where(
            and(
              eq(member.organizationId, inv.organizationId),
              inArray(member.role, ['owner', 'admin']),
            )
          )
          .limit(100);

        const adminUserIds = adminMembers
          .map((m) => m.userId)
          .filter((id) => id !== ctx.session.user.id);

        if (adminUserIds.length > 0) {
          sendBulkNotification(adminUserIds, {
            title: 'New member joined',
            body: `${ctx.session.user.email ?? 'A new user'} has joined ${inv.orgName}.`,
            type: NotificationType.INFO,
            category: NotificationCategory.ORGANIZATION,
            orgId: inv.organizationId,
          });
        }
      }

      return { success: true };
    }),
});
