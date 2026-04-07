import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, asc } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { saasTickets, saasTicketMessages } from '@/core-support/schema/support-tickets';
import { user } from '@/server/db/schema/auth';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/audit';
import { sendNotification, sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { resolveOrgId } from '@/server/lib/resolve-org';

/** Fire-and-forget WS broadcast (dynamic import to avoid static ws dependency) */
function broadcastTicketEvent(ticketId: string, type: string, payload: Record<string, unknown>): void {
  // Include `type` in payload so useChannel callback can discriminate event types
  import('@/server/lib/ws')
    .then(({ broadcastToChannel }) => broadcastToChannel(`support:${ticketId}`, type, { ...payload, type }))
    .catch(() => {/* WS not available */});
}

const supportAdminProcedure = sectionProcedure('settings');

export const supportRouter = createTRPCRouter({
  // ─── Customer-facing (protectedProcedure, org-scoped) ─────────────────────

  /** List user's tickets in active org */
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const userId = ctx.session.user.id;
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        eq(saasTickets.organizationId, orgId),
        eq(saasTickets.userId, userId),
      ];
      if (input.status) conditions.push(eq(saasTickets.status, input.status));

      const where = and(...conditions);

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: saasTickets.id,
            subject: saasTickets.subject,
            status: saasTickets.status,
            priority: saasTickets.priority,
            createdAt: saasTickets.createdAt,
            updatedAt: saasTickets.updatedAt,
          })
          .from(saasTickets)
          .where(where)
          .orderBy(desc(saasTickets.updatedAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(saasTickets)
          .where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get single ticket + messages (must own or be staff) */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(eq(saasTickets.id, input.id))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      // Must own the ticket or be staff
      const isOwner = ticket.userId === ctx.session.user.id;
      if (!isOwner) {
        const { Policy } = await import('@/core/policy');
        if (!Policy.for(ctx.session.user.role).can('section.settings')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
      }

      const messages = await ctx.db
        .select({
          id: saasTicketMessages.id,
          userId: saasTicketMessages.userId,
          isStaff: saasTicketMessages.isStaff,
          body: saasTicketMessages.body,
          attachments: saasTicketMessages.attachments,
          createdAt: saasTicketMessages.createdAt,
        })
        .from(saasTicketMessages)
        .where(eq(saasTicketMessages.ticketId, input.id))
        .orderBy(asc(saasTicketMessages.createdAt))
        .limit(200);

      return { ...ticket, messages };
    }),

  /** Create a new ticket */
  create: protectedProcedure
    .input(z.object({
      subject: z.string().min(1).max(255),
      body: z.string().min(1).max(5000),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const userId = ctx.session.user.id;

      const ticketId = crypto.randomUUID();
      await ctx.db.insert(saasTickets).values({
        id: ticketId,
        organizationId: orgId,
        userId,
        subject: input.subject,
        status: 'open',
        priority: input.priority,
      });

      // Add initial message
      await ctx.db.insert(saasTicketMessages).values({
        ticketId,
        userId,
        isStaff: false,
        body: input.body,
      });

      logAudit({
        db: ctx.db,
        userId,
        action: 'support.create',
        entityType: 'ticket',
        entityId: ticketId,
        metadata: { subject: input.subject, priority: input.priority },
      });

      // Notify org admins
      sendOrgNotification(orgId, {
        title: 'New support ticket',
        body: `New ticket: ${input.subject}`,
        type: NotificationType.INFO,
        category: NotificationCategory.SYSTEM,
        actionUrl: `/dashboard/settings/support/${ticketId}`,
      });

      return { id: ticketId };
    }),

  /** Reply to a ticket (customer) */
  reply: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      body: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(and(
          eq(saasTickets.id, input.ticketId),
          eq(saasTickets.userId, ctx.session.user.id),
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status === 'closed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot reply to a closed ticket' });
      }

      const messageId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(saasTicketMessages).values({
        id: messageId,
        ticketId: input.ticketId,
        userId: ctx.session.user.id,
        isStaff: false,
        body: input.body,
      });

      // Auto-transition: user reply -> awaiting_admin
      await ctx.db
        .update(saasTickets)
        .set({ status: 'awaiting_admin', updatedAt: now })
        .where(eq(saasTickets.id, input.ticketId));

      // Broadcast new message via WebSocket
      broadcastTicketEvent(input.ticketId, 'ticket_message', {
        id: messageId,
        ticketId: input.ticketId,
        userId: ctx.session.user.id,
        isStaff: false,
        body: input.body,
        createdAt: now.toISOString(),
      });

      // Notify assigned admin if any
      if (ticket.assignedTo) {
        sendNotification({
          userId: ticket.assignedTo,
          title: 'Customer reply on ticket',
          body: `Reply on: ${ticket.subject}`,
          type: NotificationType.INFO,
          category: NotificationCategory.SYSTEM,
          actionUrl: `/dashboard/settings/support/${input.ticketId}`,
        });
      }

      return { success: true };
    }),

  /** Provide satisfaction feedback on a closed/resolved ticket */
  provideFeedback: protectedProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      satisfaction: z.enum(['negative', 'neutral', 'positive']),
      comment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(and(
          eq(saasTickets.id, input.ticketId),
          eq(saasTickets.userId, ctx.session.user.id),
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ticket must be closed to provide feedback' });
      }

      await ctx.db
        .update(saasTickets)
        .set({
          satisfaction: input.satisfaction,
          satisfactionComment: input.comment ?? null,
          updatedAt: new Date(),
        })
        .where(eq(saasTickets.id, input.ticketId));

      return { success: true };
    }),

  /** Close own ticket */
  close: protectedProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(and(
          eq(saasTickets.id, input.ticketId),
          eq(saasTickets.userId, ctx.session.user.id),
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      await ctx.db
        .update(saasTickets)
        .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(saasTickets.id, input.ticketId));

      return { success: true };
    }),

  // ─── Admin (sectionProcedure('settings')) ─────────────────────────────────

  /** List all tickets (admin) */
  adminList: supportAdminProcedure
    .input(z.object({
      status: z.enum(['open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      assignedTo: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) conditions.push(eq(saasTickets.status, input.status));
      if (input.priority) conditions.push(eq(saasTickets.priority, input.priority));
      if (input.assignedTo) conditions.push(eq(saasTickets.assignedTo, input.assignedTo));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: saasTickets.id,
            organizationId: saasTickets.organizationId,
            userId: saasTickets.userId,
            subject: saasTickets.subject,
            status: saasTickets.status,
            priority: saasTickets.priority,
            assignedTo: saasTickets.assignedTo,
            source: saasTickets.source,
            createdAt: saasTickets.createdAt,
            updatedAt: saasTickets.updatedAt,
          })
          .from(saasTickets)
          .where(where)
          .orderBy(desc(saasTickets.updatedAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(saasTickets).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get any ticket + messages (admin) */
  adminGet: supportAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(eq(saasTickets.id, input.id))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const messages = await ctx.db
        .select()
        .from(saasTicketMessages)
        .where(eq(saasTicketMessages.ticketId, input.id))
        .orderBy(asc(saasTicketMessages.createdAt))
        .limit(200);

      // Get creator info
      const [creator] = await ctx.db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, ticket.userId))
        .limit(1);

      return { ...ticket, messages, creator: creator ?? null };
    }),

  /** Staff reply (isStaff=true) */
  adminReply: supportAdminProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      body: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(eq(saasTickets.id, input.ticketId))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const messageId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(saasTicketMessages).values({
        id: messageId,
        ticketId: input.ticketId,
        userId: ctx.session.user.id,
        isStaff: true,
        body: input.body,
      });

      // Auto-transition: staff reply -> awaiting_user
      await ctx.db
        .update(saasTickets)
        .set({ status: 'awaiting_user', updatedAt: now })
        .where(eq(saasTickets.id, input.ticketId));

      // Broadcast new message via WebSocket
      broadcastTicketEvent(input.ticketId, 'ticket_message', {
        id: messageId,
        ticketId: input.ticketId,
        userId: ctx.session.user.id,
        isStaff: true,
        body: input.body,
        createdAt: now.toISOString(),
      });

      // Notify ticket creator
      sendNotification({
        userId: ticket.userId,
        title: 'Staff reply on your ticket',
        body: `Reply on: ${ticket.subject}`,
        type: NotificationType.INFO,
        category: NotificationCategory.SYSTEM,
        actionUrl: `/account/support/${input.ticketId}`,
      });

      return { success: true };
    }),

  /** Assign ticket to admin user */
  assign: supportAdminProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      assignedTo: z.string().uuid().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(saasTickets)
        .set({ assignedTo: input.assignedTo, updatedAt: new Date() })
        .where(eq(saasTickets.id, input.ticketId));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'support.assign',
        entityType: 'ticket',
        entityId: input.ticketId,
        metadata: { assignedTo: input.assignedTo },
      });

      return { success: true };
    }),

  /** Manual status transition */
  changeStatus: supportAdminProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      status: z.enum(['open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed']),
    }))
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === 'resolved') updates.resolvedAt = new Date();
      if (input.status === 'closed') updates.closedAt = new Date();

      await ctx.db
        .update(saasTickets)
        .set(updates)
        .where(eq(saasTickets.id, input.ticketId));

      // Broadcast status change via WebSocket
      broadcastTicketEvent(input.ticketId, 'ticket_status', {
        ticketId: input.ticketId,
        status: input.status,
      });

      // Notify ticket creator of status change
      const [ticket] = await ctx.db
        .select({ userId: saasTickets.userId, subject: saasTickets.subject })
        .from(saasTickets)
        .where(eq(saasTickets.id, input.ticketId))
        .limit(1);

      if (ticket) {
        sendNotification({
          userId: ticket.userId,
          title: `Ticket ${input.status}`,
          body: `Your ticket "${ticket.subject}" has been marked as ${input.status}.`,
          type: input.status === 'resolved' ? NotificationType.SUCCESS : NotificationType.INFO,
          category: NotificationCategory.SYSTEM,
          actionUrl: `/account/support/${input.ticketId}`,
        });
      }

      return { success: true };
    }),

  /** Get ticket stats (admin) */
  getStats: supportAdminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        status: saasTickets.status,
        count: count(),
      })
      .from(saasTickets)
      .groupBy(saasTickets.status);

    const stats: Record<string, number> = { total: 0 };
    for (const row of rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }
    return stats;
  }),
});
