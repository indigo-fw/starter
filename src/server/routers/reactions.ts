import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { cmsReactions } from '@/server/db/schema';
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from '../trpc';

const REACTION_TYPES = ['like', 'dislike'] as const;

export const reactionsRouter = createTRPCRouter({
  /** Toggle a reaction (like/dislike). Same type = remove, different = switch. */
  toggle: protectedProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentId: z.string().uuid(),
        reactionType: z.enum(REACTION_TYPES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [existing] = await ctx.db
        .select()
        .from(cmsReactions)
        .where(
          and(
            eq(cmsReactions.userId, userId),
            eq(cmsReactions.contentType, input.contentType),
            eq(cmsReactions.contentId, input.contentId)
          )
        )
        .limit(1);

      if (existing) {
        if (existing.reactionType === input.reactionType) {
          // Same type — remove (toggle off)
          await ctx.db
            .delete(cmsReactions)
            .where(eq(cmsReactions.id, existing.id));
          return { reaction: null };
        }
        // Different type — switch
        await ctx.db
          .update(cmsReactions)
          .set({ reactionType: input.reactionType, createdAt: new Date() })
          .where(eq(cmsReactions.id, existing.id));
        return { reaction: input.reactionType };
      }

      // No existing — create
      await ctx.db.insert(cmsReactions).values({
        userId,
        contentType: input.contentType,
        contentId: input.contentId,
        reactionType: input.reactionType,
      });
      return { reaction: input.reactionType };
    }),

  /** Get like/dislike counts for a single content item. */
  getCounts: publicProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          reactionType: cmsReactions.reactionType,
          count: sql<number>`count(*)`,
        })
        .from(cmsReactions)
        .where(
          and(
            eq(cmsReactions.contentType, input.contentType),
            eq(cmsReactions.contentId, input.contentId)
          )
        )
        .groupBy(cmsReactions.reactionType);

      let likes = 0;
      let dislikes = 0;
      for (const row of rows) {
        if (row.reactionType === 'like') likes = Number(row.count);
        else if (row.reactionType === 'dislike') dislikes = Number(row.count);
      }
      return { likes, dislikes };
    }),

  /** Get current user's reaction for a content item. */
  getUserReaction: protectedProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ reactionType: cmsReactions.reactionType })
        .from(cmsReactions)
        .where(
          and(
            eq(cmsReactions.userId, ctx.session.user.id),
            eq(cmsReactions.contentType, input.contentType),
            eq(cmsReactions.contentId, input.contentId)
          )
        )
        .limit(1);
      return { reaction: (row?.reactionType as 'like' | 'dislike') ?? null };
    }),

  /** Batch get counts for multiple content items. */
  getBatchCounts: publicProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentIds: z.array(z.string().uuid()).min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          contentId: cmsReactions.contentId,
          reactionType: cmsReactions.reactionType,
          count: sql<number>`count(*)`,
        })
        .from(cmsReactions)
        .where(
          and(
            eq(cmsReactions.contentType, input.contentType),
            inArray(cmsReactions.contentId, input.contentIds)
          )
        )
        .groupBy(cmsReactions.contentId, cmsReactions.reactionType);

      const result: Record<string, { likes: number; dislikes: number }> = {};
      for (const id of input.contentIds) {
        result[id] = { likes: 0, dislikes: 0 };
      }
      for (const row of rows) {
        const entry = result[row.contentId];
        if (!entry) continue;
        if (row.reactionType === 'like') entry.likes = Number(row.count);
        else if (row.reactionType === 'dislike') entry.dislikes = Number(row.count);
      }
      return result;
    }),

  /** Batch get user's reactions for multiple content items. */
  getUserBatchReactions: protectedProcedure
    .input(
      z.object({
        contentType: z.string().min(1).max(50),
        contentIds: z.array(z.string().uuid()).min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          contentId: cmsReactions.contentId,
          reactionType: cmsReactions.reactionType,
        })
        .from(cmsReactions)
        .where(
          and(
            eq(cmsReactions.userId, ctx.session.user.id),
            eq(cmsReactions.contentType, input.contentType),
            inArray(cmsReactions.contentId, input.contentIds)
          )
        );

      const result: Record<string, 'like' | 'dislike'> = {};
      for (const row of rows) {
        result[row.contentId] = row.reactionType as 'like' | 'dislike';
      }
      return result;
    }),
});
