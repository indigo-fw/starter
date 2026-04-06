import { z } from 'zod';
import { eq, and, isNull, ilike, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure } from '../trpc';
import type { Context } from '../trpc';
import { saasProjects, member } from '@/server/db/schema';
import { logAudit } from '@/core/lib/audit';
import { resolveOrgId } from '@/server/lib/resolve-org';

async function requireMember(
  db: Context['db'],
  orgId: string,
  userId: string,
) {
  const [m] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1);

  if (!m) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this organization' });
  }
}

export const projectsRouter = createTRPCRouter({
  /** List projects for the active organization */
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireMember(ctx.db, orgId, ctx.session.user.id);

      const { search, page = 1, pageSize = 20 } = input ?? {};

      const conditions = [
        eq(saasProjects.organizationId, orgId),
        isNull(saasProjects.deletedAt),
      ];

      if (search?.trim()) {
        conditions.push(ilike(saasProjects.name, `%${search.trim()}%`));
      }

      const where = and(...conditions);

      const [results, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(saasProjects)
          .where(where)
          .orderBy(desc(saasProjects.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(saasProjects)
          .where(where),
      ]);

      const total = Number(countResult[0]?.count ?? 0);

      return {
        results,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  /** Get a single project by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireMember(ctx.db, orgId, ctx.session.user.id);

      const [project] = await ctx.db
        .select()
        .from(saasProjects)
        .where(
          and(
            eq(saasProjects.id, input.id),
            eq(saasProjects.organizationId, orgId),
            isNull(saasProjects.deletedAt),
          ),
        )
        .limit(1);

      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      return project;
    }),

  /** Create a new project */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireMember(ctx.db, orgId, ctx.session.user.id);

      const [project] = await ctx.db
        .insert(saasProjects)
        .values({
          organizationId: orgId,
          name: input.name,
          description: input.description ?? null,
          createdById: ctx.session.user.id,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'project.create',
        entityType: 'project',
        entityId: project!.id,
        metadata: { name: input.name },
      });

      return project;
    }),

  /** Update a project */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(5000).optional(),
        status: z.enum(['active', 'archived']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireMember(ctx.db, orgId, ctx.session.user.id);

      const { id, ...data } = input;

      const [updated] = await ctx.db
        .update(saasProjects)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(saasProjects.id, id),
            eq(saasProjects.organizationId, orgId),
            isNull(saasProjects.deletedAt),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'project.update',
        entityType: 'project',
        entityId: id,
      });

      return updated;
    }),

  /** Soft-delete a project */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireMember(ctx.db, orgId, ctx.session.user.id);

      const [deleted] = await ctx.db
        .update(saasProjects)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(saasProjects.id, input.id),
            eq(saasProjects.organizationId, orgId),
            isNull(saasProjects.deletedAt),
          ),
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'project.delete',
        entityType: 'project',
        entityId: input.id,
      });

      return { success: true };
    }),
});
