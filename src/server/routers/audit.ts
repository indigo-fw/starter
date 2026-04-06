import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';

import { cmsAuditLog, user } from '@/server/db/schema';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { createTRPCRouter, sectionProcedure } from '../trpc';

const settingsProcedure = sectionProcedure('settings');
const dashboardProcedure = sectionProcedure('dashboard');
const contentProcedure = sectionProcedure('content');

/** Actions relevant to content editors */
const CONTENT_ACTIONS = [
  'create', 'update', 'publish', 'unpublish', 'delete',
  'restore', 'import', 'media.upload', 'media.delete',
];

export const auditRouter = createTRPCRouter({
  /** Last N audit entries for dashboard widget */
  recent: dashboardProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: cmsAuditLog.id,
          action: cmsAuditLog.action,
          entityType: cmsAuditLog.entityType,
          entityId: cmsAuditLog.entityId,
          entityTitle: cmsAuditLog.entityTitle,
          createdAt: cmsAuditLog.createdAt,
          userName: user.name,
        })
        .from(cmsAuditLog)
        .leftJoin(user, eq(cmsAuditLog.userId, user.id))
        .orderBy(desc(cmsAuditLog.createdAt))
        .limit(input.limit);
    }),

  /** Paginated audit log with filters */
  list: settingsProcedure
    .input(
      z.object({
        entityType: z.string().max(30).optional(),
        action: z.string().max(30).optional(),
        userId: z.string().max(64).optional(),
        userSearch: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.entityType) {
        conditions.push(eq(cmsAuditLog.entityType, input.entityType));
      }
      if (input.action) {
        conditions.push(eq(cmsAuditLog.action, input.action));
      }
      if (input.userId) {
        conditions.push(eq(cmsAuditLog.userId, input.userId));
      }
      if (input.userSearch) {
        conditions.push(
          or(
            ilike(user.name, `%${input.userSearch}%`),
            ilike(user.email, `%${input.userSearch}%`)
          )
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const base = ctx.db
        .select({
          id: cmsAuditLog.id,
          userId: cmsAuditLog.userId,
          action: cmsAuditLog.action,
          entityType: cmsAuditLog.entityType,
          entityId: cmsAuditLog.entityId,
          entityTitle: cmsAuditLog.entityTitle,
          metadata: cmsAuditLog.metadata,
          createdAt: cmsAuditLog.createdAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(cmsAuditLog)
        .leftJoin(user, eq(cmsAuditLog.userId, user.id));

      const [items, [countRow]] = await Promise.all([
        base
          .where(where)
          .orderBy(desc(cmsAuditLog.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(cmsAuditLog)
          .leftJoin(user, eq(cmsAuditLog.userId, user.id))
          .where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Activity feed for content editors — shows content-relevant actions */
  feed: contentProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
        entityTypes: z
          .array(z.string().max(30))
          .max(10)
          .optional(),
        actions: z
          .array(z.string().max(30))
          .max(10)
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        inArray(cmsAuditLog.action, input.actions ?? CONTENT_ACTIONS),
      ];
      if (input.entityTypes && input.entityTypes.length > 0) {
        conditions.push(inArray(cmsAuditLog.entityType, input.entityTypes));
      }

      const where = and(...conditions);

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: cmsAuditLog.id,
            action: cmsAuditLog.action,
            entityType: cmsAuditLog.entityType,
            entityId: cmsAuditLog.entityId,
            entityTitle: cmsAuditLog.entityTitle,
            metadata: cmsAuditLog.metadata,
            createdAt: cmsAuditLog.createdAt,
            userName: user.name,
            userImage: user.image,
          })
          .from(cmsAuditLog)
          .leftJoin(user, eq(cmsAuditLog.userId, user.id))
          .where(where)
          .orderBy(desc(cmsAuditLog.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(cmsAuditLog)
          .where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get audit entries for a specific entity */
  getForEntity: settingsProcedure
    .input(
      z.object({
        entityType: z.string().max(30),
        entityId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(cmsAuditLog)
        .where(
          and(
            eq(cmsAuditLog.entityType, input.entityType),
            eq(cmsAuditLog.entityId, input.entityId)
          )
        )
        .orderBy(desc(cmsAuditLog.createdAt))
        .limit(50);
    }),
});
