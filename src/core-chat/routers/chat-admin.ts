import { z } from 'zod';
import { eq, and, desc, sql, count as drizzleCount, gte, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatCharacters } from '@/core-chat/schema/characters';
import { chatMessages } from '@/core-chat/schema/messages';
import { user as userTable } from '@/server/db/schema/auth';
import { parsePagination } from '@/core/crud';
import { MessageStatus } from '@/core-chat/lib/types';

const adminProcedure = sectionProcedure('settings');

export const chatAdminRouter = createTRPCRouter({
  /** Aggregate KPIs for the overview dashboard */
  overview: adminProcedure.query(async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [totals] = await db
      .select({
        totalConversations: drizzleCount(chatConversations.id),
      })
      .from(chatConversations);

    const [msgTotals] = await db
      .select({
        totalMessages: drizzleCount(chatMessages.id),
        flaggedMessages: sql<number>`COUNT(CASE WHEN ${chatMessages.status} = 'moderated' THEN 1 END)`,
      })
      .from(chatMessages);

    const [activeUsers] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${chatConversations.userId})`,
      })
      .from(chatConversations)
      .where(gte(chatConversations.lastMessageAt, oneDayAgo));

    const [tokensUsed] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${chatConversations.totalTokensUsed}), 0)`,
      })
      .from(chatConversations);

    return {
      totalConversations: totals?.totalConversations ?? 0,
      totalMessages: msgTotals?.totalMessages ?? 0,
      flaggedMessages: Number(msgTotals?.flaggedMessages ?? 0),
      activeUsers24h: Number(activeUsers?.count ?? 0),
      totalTokensUsed: Number(tokensUsed?.total ?? 0),
    };
  }),

  /** Per-character stats */
  characterStats: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const stats = await db
        .select({
          characterId: chatConversations.characterId,
          characterName: chatCharacters.name,
          characterAvatar: chatCharacters.avatarUrl,
          conversationCount: drizzleCount(chatConversations.id),
          totalMessages: sql<number>`COALESCE(SUM(${chatConversations.messageCount}), 0)`,
          avgMessages: sql<number>`ROUND(AVG(${chatConversations.messageCount}), 1)`,
        })
        .from(chatConversations)
        .innerJoin(chatCharacters, eq(chatConversations.characterId, chatCharacters.id))
        .groupBy(chatConversations.characterId, chatCharacters.name, chatCharacters.avatarUrl)
        .orderBy(sql`COUNT(${chatConversations.id}) DESC`)
        .limit(input.limit);

      return stats.map((s) => ({
        ...s,
        totalMessages: Number(s.totalMessages),
        avgMessages: Number(s.avgMessages),
      }));
    }),

  /** Most active users by chat usage */
  userStats: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const stats = await db
        .select({
          userId: chatConversations.userId,
          userName: userTable.name,
          userEmail: userTable.email,
          conversationCount: drizzleCount(chatConversations.id),
          totalMessages: sql<number>`COALESCE(SUM(${chatConversations.messageCount}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${chatConversations.totalTokensUsed}), 0)`,
        })
        .from(chatConversations)
        .innerJoin(userTable, eq(chatConversations.userId, userTable.id))
        .groupBy(chatConversations.userId, userTable.name, userTable.email)
        .orderBy(sql`SUM(${chatConversations.messageCount}) DESC`)
        .limit(input.limit);

      return stats.map((s) => ({
        ...s,
        totalMessages: Number(s.totalMessages),
        totalTokens: Number(s.totalTokens),
      }));
    }),

  /** Daily message counts for chart */
  messagesOverTime: adminProcedure
    .input(z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          date: sql<string>`DATE(${chatMessages.createdAt})`,
          count: drizzleCount(chatMessages.id),
        })
        .from(chatMessages)
        .where(and(
          gte(chatMessages.createdAt, new Date(input.from)),
          lte(chatMessages.createdAt, new Date(input.to)),
        ))
        .groupBy(sql`DATE(${chatMessages.createdAt})`)
        .orderBy(sql`DATE(${chatMessages.createdAt})`);

      return rows.map((r) => ({ date: String(r.date), count: r.count }));
    }),

  /** All conversations (admin browser) */
  conversationsList: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
      status: z.enum(['active', 'archived', 'deleted']).optional(),
      characterId: z.string().uuid().optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) conditions.push(eq(chatConversations.status, input.status));
      if (input.characterId) conditions.push(eq(chatConversations.characterId, input.characterId));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select({
          id: chatConversations.id,
          title: chatConversations.title,
          status: chatConversations.status,
          messageCount: chatConversations.messageCount,
          totalTokensUsed: chatConversations.totalTokensUsed,
          lastMessageAt: chatConversations.lastMessageAt,
          createdAt: chatConversations.createdAt,
          userId: chatConversations.userId,
          userName: userTable.name,
          userEmail: userTable.email,
          characterName: chatCharacters.name,
          characterAvatar: chatCharacters.avatarUrl,
        })
          .from(chatConversations)
          .innerJoin(chatCharacters, eq(chatConversations.characterId, chatCharacters.id))
          .innerJoin(userTable, eq(chatConversations.userId, userTable.id))
          .where(where)
          .orderBy(desc(chatConversations.lastMessageAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: drizzleCount() }).from(chatConversations).where(where),
      ]);

      const total = countResult[0]?.count ?? 0;
      return { results: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }),

  /** Read messages for any conversation (admin view) */
  conversationMessages: adminProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, input.conversationId))
        .orderBy(chatMessages.createdAt)
        .limit(input.limit);
    }),

  /** List moderated/flagged messages */
  flaggedMessages: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const [items, countResult] = await Promise.all([
        db.select({
          id: chatMessages.id,
          content: chatMessages.content,
          moderationResult: chatMessages.moderationResult,
          createdAt: chatMessages.createdAt,
          conversationId: chatMessages.conversationId,
          userName: userTable.name,
          userEmail: userTable.email,
          characterName: chatCharacters.name,
        })
          .from(chatMessages)
          .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
          .innerJoin(userTable, eq(chatConversations.userId, userTable.id))
          .innerJoin(chatCharacters, eq(chatConversations.characterId, chatCharacters.id))
          .where(eq(chatMessages.status, MessageStatus.MODERATED))
          .orderBy(desc(chatMessages.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: drizzleCount() })
          .from(chatMessages)
          .where(eq(chatMessages.status, MessageStatus.MODERATED)),
      ]);

      const total = countResult[0]?.count ?? 0;
      return { results: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }),

  /** Dismiss a moderation flag */
  dismissFlag: adminProcedure
    .input(z.object({ messageId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const result = await db
        .update(chatMessages)
        .set({ status: 'delivered', moderationResult: null })
        .where(and(
          eq(chatMessages.id, input.messageId),
          eq(chatMessages.status, MessageStatus.MODERATED),
        ))
        .returning({ id: chatMessages.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Flagged message not found' });
      }
    }),
});
