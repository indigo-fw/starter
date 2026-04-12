import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, count, sql, gte } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import type { DbClient } from '@/server/db';
import { saasApiKeys, saasApiRequestLogs } from '@/core-api/schema/api-keys';
import { member } from '@/server/db/schema/organization';
import { getApiDeps } from '@/core-api/deps';
import { generateApiKey } from '@/core-api/lib/api-key-service';
import { getRegisteredScopes, validateScopes } from '@/core-api/lib/api-scopes';
import { logAudit } from '@/core/lib/infra/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';

const apiAdminProcedure = sectionProcedure('settings');

/** Default grace period for key rotation: 24 hours. */
const ROLL_GRACE_HOURS = 24;

/** Verify calling user is owner/admin of the org. */
async function requireOrgAdmin(
  db: DbClient,
  orgId: string,
  userId: string,
) {
  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1);

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only org owners and admins can manage API keys',
    });
  }
}

export const apiKeysRouter = createTRPCRouter({
  // ─── Customer-facing (protectedProcedure) ──────────────────────────────

  /** List API keys for the active org. Never returns the key hash. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

    return ctx.db
      .select({
        id: saasApiKeys.id,
        name: saasApiKeys.name,
        prefix: saasApiKeys.prefix,
        scopes: saasApiKeys.scopes,
        status: saasApiKeys.status,
        lastUsedAt: saasApiKeys.lastUsedAt,
        expiresAt: saasApiKeys.expiresAt,
        createdAt: saasApiKeys.createdAt,
      })
      .from(saasApiKeys)
      .where(eq(saasApiKeys.organizationId, orgId))
      .orderBy(desc(saasApiKeys.createdAt))
      .limit(50);
  }),

  /** Create a new API key. Returns the plaintext key exactly once. */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      scopes: z.array(z.string().max(100)).max(50).nullable(),
      expiresAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireOrgAdmin(ctx.db, orgId, ctx.session.user.id);

      // Validate scopes if provided
      if (input.scopes !== null && input.scopes.length > 0) {
        const invalid = validateScopes(input.scopes);
        if (invalid.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown scopes: ${invalid.join(', ')}`,
          });
        }
      }

      // Enforce max keys per org
      const [{ total }] = await ctx.db
        .select({ total: count() })
        .from(saasApiKeys)
        .where(and(
          eq(saasApiKeys.organizationId, orgId),
          eq(saasApiKeys.status, 'active'),
        ));

      if (total >= 25) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Maximum 25 active API keys per organization',
        });
      }

      const { key, hash, prefix } = generateApiKey();

      const [created] = await ctx.db.insert(saasApiKeys).values({
        organizationId: orgId,
        createdBy: ctx.session.user.id,
        name: input.name,
        keyHash: hash,
        prefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
      }).returning({ id: saasApiKeys.id });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'api_key.create',
        entityType: 'api_key',
        entityId: created!.id,
        metadata: { name: input.name },
      });

      dispatchWebhook(ctx.db, 'api_key.created', {
        id: created!.id,
        organizationId: orgId,
        name: input.name,
        prefix,
        scopes: input.scopes,
      });

      return { id: created!.id, key, prefix };
    }),

  /** Revoke an API key immediately. */
  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireOrgAdmin(ctx.db, orgId, ctx.session.user.id);

      const [existing] = await ctx.db
        .select({ id: saasApiKeys.id, name: saasApiKeys.name, status: saasApiKeys.status, prefix: saasApiKeys.prefix })
        .from(saasApiKeys)
        .where(and(eq(saasApiKeys.id, input.id), eq(saasApiKeys.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }
      if (existing.status === 'revoked') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Key already revoked' });
      }

      await ctx.db
        .update(saasApiKeys)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(eq(saasApiKeys.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'api_key.revoke',
        entityType: 'api_key',
        entityId: input.id,
      });

      dispatchWebhook(ctx.db, 'api_key.revoked', {
        id: input.id,
        organizationId: orgId,
        name: existing.name,
        prefix: existing.prefix,
      });

      return { success: true };
    }),

  /**
   * Roll (rotate) an API key.
   * Creates a new key and sets the old key to expire after a grace period.
   * Both keys work during the grace window.
   */
  roll: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      gracePeriodHours: z.number().int().min(0).max(168).default(ROLL_GRACE_HOURS),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireOrgAdmin(ctx.db, orgId, ctx.session.user.id);

      const [existing] = await ctx.db
        .select({
          id: saasApiKeys.id,
          name: saasApiKeys.name,
          scopes: saasApiKeys.scopes,
          status: saasApiKeys.status,
        })
        .from(saasApiKeys)
        .where(and(eq(saasApiKeys.id, input.id), eq(saasApiKeys.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }
      if (existing.status !== 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only roll active keys' });
      }

      const graceExpiry = input.gracePeriodHours > 0
        ? new Date(Date.now() + input.gracePeriodHours * 60 * 60 * 1000)
        : new Date(); // immediate revoke if 0

      // Mark old key as expiring — still works until expiresAt, but doesn't count against active limit
      await ctx.db
        .update(saasApiKeys)
        .set({ status: 'expiring', expiresAt: graceExpiry, updatedAt: new Date() })
        .where(eq(saasApiKeys.id, input.id));

      // Create the replacement key with the same name + scopes
      const { key, hash, prefix } = generateApiKey();

      const [created] = await ctx.db.insert(saasApiKeys).values({
        organizationId: orgId,
        createdBy: ctx.session.user.id,
        name: existing.name,
        keyHash: hash,
        prefix,
        scopes: existing.scopes,
      }).returning({ id: saasApiKeys.id });

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'api_key.roll',
        entityType: 'api_key',
        entityId: created!.id,
        metadata: { replacedKeyId: input.id, gracePeriodHours: input.gracePeriodHours },
      });

      dispatchWebhook(ctx.db, 'api_key.rolled', {
        newKeyId: created!.id,
        oldKeyId: input.id,
        organizationId: orgId,
        gracePeriodHours: input.gracePeriodHours,
      });

      return { id: created!.id, key, prefix, oldKeyExpiresAt: graceExpiry };
    }),

  /** Rename an API key. */
  rename: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireOrgAdmin(ctx.db, orgId, ctx.session.user.id);

      const [existing] = await ctx.db
        .select({ id: saasApiKeys.id })
        .from(saasApiKeys)
        .where(and(eq(saasApiKeys.id, input.id), eq(saasApiKeys.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }

      await ctx.db
        .update(saasApiKeys)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(saasApiKeys.id, input.id));

      return { success: true };
    }),

  /** Update scopes on an existing key. */
  updateScopes: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      scopes: z.array(z.string().max(100)).max(50).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      await requireOrgAdmin(ctx.db, orgId, ctx.session.user.id);

      if (input.scopes !== null && input.scopes.length > 0) {
        const invalid = validateScopes(input.scopes);
        if (invalid.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Unknown scopes: ${invalid.join(', ')}`,
          });
        }
      }

      const [existing] = await ctx.db
        .select({ id: saasApiKeys.id, status: saasApiKeys.status })
        .from(saasApiKeys)
        .where(and(eq(saasApiKeys.id, input.id), eq(saasApiKeys.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }
      if (existing.status !== 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only update scopes on active keys' });
      }

      await ctx.db
        .update(saasApiKeys)
        .set({ scopes: input.scopes, updatedAt: new Date() })
        .where(eq(saasApiKeys.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'api_key.update_scopes',
        entityType: 'api_key',
        entityId: input.id,
        metadata: { scopes: input.scopes },
      });

      return { success: true };
    }),

  /** Get available scopes for key creation UI. */
  getScopes: protectedProcedure.query(() => {
    return getRegisteredScopes();
  }),

  /** Get usage stats for a key (last 24h, 7d, 30d). */
  getKeyStats: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await getApiDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [existing] = await ctx.db
        .select({ id: saasApiKeys.id })
        .from(saasApiKeys)
        .where(and(eq(saasApiKeys.id, input.id), eq(saasApiKeys.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
      }

      const now = new Date();
      const day = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [stats] = await ctx.db
        .select({
          last24h: count(sql`CASE WHEN ${saasApiRequestLogs.createdAt} >= ${day} THEN 1 END`),
          last7d: count(sql`CASE WHEN ${saasApiRequestLogs.createdAt} >= ${week} THEN 1 END`),
          last30d: count(),
        })
        .from(saasApiRequestLogs)
        .where(and(
          eq(saasApiRequestLogs.apiKeyId, input.id),
          gte(saasApiRequestLogs.createdAt, month),
        ));

      return stats!;
    }),

  // ─── Admin (sectionProcedure) ──────────────────────────────────────────

  /** Admin: browse all API request logs with pagination. */
  adminGetLogs: apiAdminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      apiKeyId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);
      const conditions = [];

      if (input.apiKeyId) {
        conditions.push(eq(saasApiRequestLogs.apiKeyId, input.apiKeyId));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [[countRow], logs] = await Promise.all([
        ctx.db.select({ total: count() }).from(saasApiRequestLogs).where(where),
        ctx.db
          .select()
          .from(saasApiRequestLogs)
          .where(where)
          .orderBy(desc(saasApiRequestLogs.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);

      return paginatedResult(logs, countRow?.total ?? 0, page, pageSize);
    }),

  /** Admin: list all API keys across all orgs. */
  adminListKeys: apiAdminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum(['active', 'expiring', 'revoked', 'expired']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);
      const conditions = [];

      if (input.status) {
        conditions.push(eq(saasApiKeys.status, input.status));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [[countRow], keys] = await Promise.all([
        ctx.db.select({ total: count() }).from(saasApiKeys).where(where),
        ctx.db
          .select({
            id: saasApiKeys.id,
            organizationId: saasApiKeys.organizationId,
            name: saasApiKeys.name,
            prefix: saasApiKeys.prefix,
            scopes: saasApiKeys.scopes,
            status: saasApiKeys.status,
            lastUsedAt: saasApiKeys.lastUsedAt,
            expiresAt: saasApiKeys.expiresAt,
            createdAt: saasApiKeys.createdAt,
          })
          .from(saasApiKeys)
          .where(where)
          .orderBy(desc(saasApiKeys.createdAt))
          .limit(pageSize)
          .offset(offset),
      ]);

      return paginatedResult(keys, countRow?.total ?? 0, page, pageSize);
    }),
});
