import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  notInArray,
} from 'drizzle-orm';
import { z } from 'zod';

import {
  type TicketEmailCustomer,
  notifyCustomerStaffReply,
  notifyStaffCustomerReply,
  notifyStaffNewTicket,
} from '@/core-support/lib/email-notifications';
import {
  saasTicketMessages,
  saasTickets,
} from '@/core-support/schema/support-tickets';
import { paginatedResult, parsePagination } from '@/core/crud/admin-crud';
import { MAX_PAGE } from '@/core/crud/router-schemas';
import { logAudit } from '@/core/lib/infra/audit';
import {
  type RateLimitConfig,
  checkRateLimit,
} from '@/core/lib/infra/rate-limit';
import { getRequestRedis } from '@/core/lib/infra/redis';
import { Policy, Role } from '@/core/policy';
import {
  NotificationCategory,
  NotificationType,
} from '@/core/types/notifications';
import { user } from '@/server/db/schema/auth';
import {
  sendBulkNotification,
  sendNotification,
} from '@/server/lib/notifications';
import { resolveOrgId } from '@/server/lib/resolve-org';
import {
  type Context,
  appealProcedure,
  createTRPCRouter,
  protectedProcedure,
  sectionProcedure,
} from '@/server/trpc';

// ─── Abuse caps ─────────────────────────────────────────────────────────────

/** Per-user ticket creation cap. Fail-open when Redis is down (see `checkRateLimit`). */
const CREATE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60_000,
  maxRequests: 10,
};

/**
 * Customer messages allowed on a ticket before staff answers. Stops a single
 * ticket from becoming an unbounded stream of pings; closing the ticket is the
 * hard stop above this.
 */
export const UNANSWERED_REPLY_LIMIT = 8;

type DbClient = Context['db'];

/** Roles whose holders see the support admin section — the "staff" audience. */
const STAFF_ROLES = Object.values(Role).filter((role) =>
  Policy.for(role).can('section.settings')
);

async function enforceCreateRateLimit(userId: string): Promise<void> {
  const result = await checkRateLimit(
    getRequestRedis(),
    `rl:support:create:${userId}`,
    CREATE_RATE_LIMIT
  );
  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `You have opened too many tickets recently. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s`,
    });
  }
}

/**
 * A banned user may contest the ban, but only in ONE open ticket at a time.
 * `appealProcedure` lets them through the auth gate; without this cap the
 * 10/hour limit would be far too loose for someone with nothing left to lose.
 */
async function enforceBannedSingleTicket(
  db: DbClient,
  userId: string
): Promise<void> {
  const [open] = await db
    .select({ count: count() })
    .from(saasTickets)
    .where(
      and(
        eq(saasTickets.userId, userId),
        notInArray(saasTickets.status, ['resolved', 'closed'])
      )
    )
    .limit(1);
  if ((open?.count ?? 0) > 0) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message:
        'You already have an open ticket. Please continue the conversation there.',
    });
  }
}

/** Counts customer messages since the last staff reply (all of them if staff never replied). */
async function enforceUnansweredReplyLimit(
  db: DbClient,
  ticketId: string
): Promise<void> {
  const [lastStaff] = await db
    .select({ createdAt: saasTicketMessages.createdAt })
    .from(saasTicketMessages)
    .where(
      and(
        eq(saasTicketMessages.ticketId, ticketId),
        eq(saasTicketMessages.isStaff, true)
      )
    )
    .orderBy(desc(saasTicketMessages.createdAt))
    .limit(1);

  const [unanswered] = await db
    .select({ count: count() })
    .from(saasTicketMessages)
    .where(
      and(
        eq(saasTicketMessages.ticketId, ticketId),
        eq(saasTicketMessages.isStaff, false),
        ...(lastStaff
          ? [gt(saasTicketMessages.createdAt, lastStaff.createdAt)]
          : [])
      )
    )
    .limit(1);

  if ((unanswered?.count ?? 0) >= UNANSWERED_REPLY_LIMIT) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message:
        'You have reached the reply limit for this ticket. Please wait for our team to respond.',
    });
  }
}

// ─── Notification helpers ───────────────────────────────────────────────────

async function loadCustomer(
  db: DbClient,
  userId: string
): Promise<TicketEmailCustomer | null> {
  const [row] = await db
    .select({ name: user.name, email: user.email, lang: user.lang })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * In-app notification for every staff member. Staff, not the customer's org:
 * org admins are usually the customer themselves, so an org broadcast told
 * support nothing and the person who opened the ticket everything.
 */
async function notifyStaffInApp(
  db: DbClient,
  params: { title: string; body: string; actionUrl: string }
): Promise<void> {
  const staff = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.role, STAFF_ROLES))
    .limit(100);
  sendBulkNotification(
    staff.map((s) => s.id),
    {
      ...params,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
    }
  );
}

/** Better Auth's admin plugin adds `banned`; the tRPC session type does not surface it. */
function isBanned(sessionUser: object): boolean {
  return (sessionUser as { banned?: boolean | null }).banned === true;
}

/** Fire-and-forget WS broadcast (dynamic import to avoid static ws dependency) */
function broadcastTicketEvent(
  ticketId: string,
  type: string,
  payload: Record<string, unknown>
): void {
  // Include `type` in payload so useChannel callback can discriminate event types
  import('@/server/lib/ws')
    .then(({ broadcastToChannel }) =>
      broadcastToChannel(`support:${ticketId}`, type, { ...payload, type })
    )
    .catch(() => {
      /* WS not available */
    });
}

const supportAdminProcedure = sectionProcedure('settings');

export const supportRouter = createTRPCRouter({
  // ─── Customer-facing (org-scoped) ──────────────────────────────────────────
  //
  // Own-ticket procedures use `appealProcedure` so a BANNED user can still
  // contest the ban through support — the only channel left to them. The
  // abuse caps above (one open ticket, UNANSWERED_REPLY_LIMIT, 10/hour) are
  // what make that safe; every query still scopes by `ctx.session.user.id`.

  /** List user's tickets in active org */
  list: appealProcedure
    .input(
      z.object({
        status: z
          .enum([
            'open',
            'awaiting_user',
            'awaiting_admin',
            'resolved',
            'closed',
          ])
          .optional(),
        page: z.number().int().min(1).max(MAX_PAGE).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(
        ctx.activeOrganizationId,
        ctx.session.user.id
      );
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
        ctx.db.select({ count: count() }).from(saasTickets).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get single ticket + messages (must own or be staff) */
  get: appealProcedure
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
  create: appealProcedure
    .input(
      z.object({
        subject: z.string().min(1).max(255),
        body: z.string().min(1).max(5000),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await enforceCreateRateLimit(userId);
      if (isBanned(ctx.session.user)) {
        await enforceBannedSingleTicket(ctx.db, userId);
      }

      const orgId = await resolveOrgId(ctx.activeOrganizationId, userId);

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

      await notifyStaffInApp(ctx.db, {
        title: 'New support ticket',
        body: `New ticket: ${input.subject}`,
        actionUrl: `/dashboard/settings/support/${ticketId}`,
      });

      const customer = await loadCustomer(ctx.db, userId);
      if (customer) {
        void notifyStaffNewTicket({
          ticketId,
          subject: input.subject,
          priority: input.priority,
          body: input.body,
          customer,
        });
      }

      return { id: ticketId };
    }),

  /** Reply to a ticket (customer) */
  reply: appealProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        body: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(
          and(
            eq(saasTickets.id, input.ticketId),
            eq(saasTickets.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status === 'closed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot reply to a closed ticket',
        });
      }

      await enforceUnansweredReplyLimit(ctx.db, input.ticketId);

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

      // Assigned staff get a targeted ping; an unassigned ticket pings all staff
      // so a reply never lands on nobody.
      const inApp = {
        title: 'Customer reply on ticket',
        body: `Reply on: ${ticket.subject}`,
        actionUrl: `/dashboard/settings/support/${input.ticketId}`,
      };
      if (ticket.assignedTo) {
        sendNotification({
          userId: ticket.assignedTo,
          ...inApp,
          type: NotificationType.INFO,
          category: NotificationCategory.SYSTEM,
        });
      } else {
        await notifyStaffInApp(ctx.db, inApp);
      }

      const customer = await loadCustomer(ctx.db, ctx.session.user.id);
      if (customer) {
        void notifyStaffCustomerReply({
          ticketId: input.ticketId,
          subject: ticket.subject,
          body: input.body,
          customer,
        });
      }

      return { success: true };
    }),

  /** Provide satisfaction feedback on a closed/resolved ticket */
  provideFeedback: protectedProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        satisfaction: z.enum(['negative', 'neutral', 'positive']),
        comment: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(
          and(
            eq(saasTickets.id, input.ticketId),
            eq(saasTickets.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Ticket must be closed to provide feedback',
        });
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
  close: appealProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db
        .select()
        .from(saasTickets)
        .where(
          and(
            eq(saasTickets.id, input.ticketId),
            eq(saasTickets.userId, ctx.session.user.id)
          )
        )
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
    .input(
      z.object({
        status: z
          .enum([
            'open',
            'awaiting_user',
            'awaiting_admin',
            'resolved',
            'closed',
          ])
          .optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        assignedTo: z.string().max(200).optional(),
        page: z.number().int().min(1).max(MAX_PAGE).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) conditions.push(eq(saasTickets.status, input.status));
      if (input.priority)
        conditions.push(eq(saasTickets.priority, input.priority));
      if (input.assignedTo)
        conditions.push(eq(saasTickets.assignedTo, input.assignedTo));

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
    .input(
      z.object({
        ticketId: z.string().uuid(),
        body: z.string().min(1).max(5000),
      })
    )
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

      // Email too: the in-app notification only reaches a customer who is signed in.
      const customer = await loadCustomer(ctx.db, ticket.userId);
      if (customer) {
        void notifyCustomerStaffReply({
          ticketId: input.ticketId,
          subject: ticket.subject,
          body: input.body,
          customer,
        });
      }

      return { success: true };
    }),

  /** Assign ticket to admin user */
  assign: supportAdminProcedure
    .input(
      z.object({
        ticketId: z.string().uuid(),
        assignedTo: z.string().uuid().nullable(),
      })
    )
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
    .input(
      z.object({
        ticketId: z.string().uuid(),
        status: z.enum([
          'open',
          'awaiting_user',
          'awaiting_admin',
          'resolved',
          'closed',
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === 'resolved') updates.resolvedAt = new Date();
      if (input.status === 'closed') updates.closedAt = new Date();
      // Reopening to an active status — clear terminal timestamps so they
      // stay consistent with the current status.
      if (
        input.status === 'open' ||
        input.status === 'awaiting_user' ||
        input.status === 'awaiting_admin'
      ) {
        updates.resolvedAt = null;
        updates.closedAt = null;
      }

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
          type:
            input.status === 'resolved'
              ? NotificationType.SUCCESS
              : NotificationType.INFO,
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
