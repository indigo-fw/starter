import { z } from 'zod';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatCharacters } from '@/core-chat/schema/characters';
import { chatMessages } from '@/core-chat/schema/messages';
import { getChatDeps } from '@/core-chat/deps';
import { getChatConfig } from '@/core-chat/config';
import { ConversationStatus, MessageRole, MessageStatus } from '@/core-chat/lib/types';
import { parsePagination, paginatedResult } from '@/core/crud';

export const conversationRouter = createTRPCRouter({
  /** List user's conversations with character info */
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['active', 'archived']).default('active'),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { page, pageSize, offset } = parsePagination(input);

      const items = await db
        .select({
          id: chatConversations.id,
          title: chatConversations.title,
          status: chatConversations.status,
          lastMessageAt: chatConversations.lastMessageAt,
          messageCount: chatConversations.messageCount,
          createdAt: chatConversations.createdAt,
          lastMessagePreview: sql<string | null>`(
            SELECT LEFT(${chatMessages.content}, 100) FROM ${chatMessages}
            WHERE ${chatMessages.conversationId} = ${chatConversations.id}
            ORDER BY ${chatMessages.createdAt} DESC LIMIT 1
          )`,
          character: {
            id: chatCharacters.id,
            name: chatCharacters.name,
            slug: chatCharacters.slug,
            avatarUrl: chatCharacters.avatarUrl,
            tagline: chatCharacters.tagline,
          },
        })
        .from(chatConversations)
        .innerJoin(chatCharacters, eq(chatConversations.characterId, chatCharacters.id))
        .where(and(
          eq(chatConversations.userId, userId),
          eq(chatConversations.status, input.status),
        ))
        .orderBy(desc(chatConversations.lastMessageAt))
        .limit(pageSize)
        .offset(offset);

      return items;
    }),

  /** Get a single conversation with character details */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [conv] = await db
        .select({
          id: chatConversations.id,
          title: chatConversations.title,
          status: chatConversations.status,
          lastMessageAt: chatConversations.lastMessageAt,
          messageCount: chatConversations.messageCount,
          totalTokensUsed: chatConversations.totalTokensUsed,
          createdAt: chatConversations.createdAt,
          character: {
            id: chatCharacters.id,
            name: chatCharacters.name,
            slug: chatCharacters.slug,
            avatarUrl: chatCharacters.avatarUrl,
            tagline: chatCharacters.tagline,
            personality: chatCharacters.personality,
            greeting: chatCharacters.greeting,
          },
        })
        .from(chatConversations)
        .innerJoin(chatCharacters, eq(chatConversations.characterId, chatCharacters.id))
        .where(and(
          eq(chatConversations.id, input.id),
          eq(chatConversations.userId, ctx.session.user.id),
        ))
        .limit(1);

      if (!conv) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }

      return conv;
    }),

  /** Create a new conversation with a character */
  create: protectedProcedure
    .input(z.object({ characterId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deps = getChatDeps();
      const config = getChatConfig();
      const userId = ctx.session.user.id;
      const orgId = await deps.resolveOrgId(ctx.activeOrganizationId, userId);

      // Feature gate
      await deps.requireFeature(orgId, config.featureKey);

      // Verify character exists and is active
      const [character] = await db
        .select({
          id: chatCharacters.id,
          name: chatCharacters.name,
          greeting: chatCharacters.greeting,
        })
        .from(chatCharacters)
        .where(and(
          eq(chatCharacters.id, input.characterId),
          eq(chatCharacters.isActive, true),
          isNull(chatCharacters.deletedAt),
        ))
        .limit(1);

      if (!character) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Character not found' });
      }

      // Create conversation
      const [conv] = await db.insert(chatConversations).values({
        userId,
        organizationId: orgId,
        characterId: input.characterId,
        title: character.name,
        lastMessageAt: new Date(),
      }).returning();

      // Insert greeting as system message if defined
      if (character.greeting) {
        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          conversationId: conv!.id,
          role: MessageRole.ASSISTANT,
          content: character.greeting,
          status: MessageStatus.DELIVERED,
        });
      }

      return { id: conv!.id, greeting: character.greeting };
    }),

  /** Archive a conversation */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(chatConversations)
        .set({ status: ConversationStatus.ARCHIVED, updatedAt: new Date() })
        .where(and(
          eq(chatConversations.id, input.id),
          eq(chatConversations.userId, ctx.session.user.id),
          eq(chatConversations.status, ConversationStatus.ACTIVE),
        ))
        .returning({ id: chatConversations.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
    }),

  /** Soft-delete a conversation */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(chatConversations)
        .set({ status: ConversationStatus.DELETED, updatedAt: new Date() })
        .where(and(
          eq(chatConversations.id, input.id),
          eq(chatConversations.userId, ctx.session.user.id),
        ))
        .returning({ id: chatConversations.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
    }),

  /** Update conversation title */
  setTitle: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(chatConversations)
        .set({ title: input.title, updatedAt: new Date() })
        .where(and(
          eq(chatConversations.id, input.id),
          eq(chatConversations.userId, ctx.session.user.id),
        ))
        .returning({ id: chatConversations.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
    }),

  /** Reset conversation — clear messages, re-insert greeting */
  reset: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db
        .select({
          userId: chatConversations.userId,
          characterId: chatConversations.characterId,
          lang: chatConversations.lang,
        })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, input.id), eq(chatConversations.userId, ctx.session.user.id)))
        .limit(1);

      if (!conv) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });

      // Soft-delete all messages by deleting them
      await db.delete(chatMessages).where(eq(chatMessages.conversationId, input.id));

      // Load character for greeting
      const [character] = await db
        .select({ personalityId: chatCharacters.personalityId, greeting: chatCharacters.greeting })
        .from(chatCharacters)
        .where(eq(chatCharacters.id, conv.characterId))
        .limit(1);

      if (character) {
        const { getGreeting } = await import('@/core-chat/lib/greetings');
        const greeting = getGreeting(character.personalityId, null, character.greeting);
        await db.insert(chatMessages).values({
          id: crypto.randomUUID(),
          conversationId: input.id,
          role: MessageRole.ASSISTANT,
          content: greeting,
          status: MessageStatus.DELIVERED,
        });
      }

      await db.update(chatConversations).set({
        messageCount: character ? 1 : 0,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(chatConversations.id, input.id));
    }),

  /** Mark conversation as read */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [latest] = await db
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, input.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      if (!latest) return;

      await db.update(chatConversations).set({ lastReadMessageId: latest.id })
        .where(and(eq(chatConversations.id, input.id), eq(chatConversations.userId, ctx.session.user.id)));
    }),

  /** Mark conversation as unread */
  markUnread: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(chatConversations).set({ lastReadMessageId: null })
        .where(and(eq(chatConversations.id, input.id), eq(chatConversations.userId, ctx.session.user.id)));
    }),

  /** Set conversation language */
  setLanguage: protectedProcedure
    .input(z.object({ id: z.string().uuid(), lang: z.string().min(2).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.update(chatConversations).set({ lang: input.lang, updatedAt: new Date() })
        .where(and(eq(chatConversations.id, input.id), eq(chatConversations.userId, ctx.session.user.id)))
        .returning({ id: chatConversations.id });

      if (result.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
    }),

  /** Update per-conversation trait overrides */
  updateTraits: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      genderId: z.number().int().nullable().optional(),
      sexualityId: z.number().int().nullable().optional(),
      ethnicityId: z.number().int().nullable().optional(),
      personalityId: z.number().int().nullable().optional(),
      kinkId: z.number().int().nullable().optional(),
      jobId: z.number().int().nullable().optional(),
      hobbies: z.array(z.number().int()).max(10).nullable().optional(),
      relationshipId: z.number().int().nullable().optional(),
      age: z.number().int().min(18).max(99).nullable().optional(),
      userName: z.string().max(100).nullable().optional(),
      bornIn: z.string().max(255).nullable().optional(),
      livingIn: z.string().max(255).nullable().optional(),
      customTrait: z.string().max(255).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...traits } = input;
      const result = await db.update(chatConversations)
        .set({ ...traits, updatedAt: new Date() })
        .where(and(eq(chatConversations.id, id), eq(chatConversations.userId, ctx.session.user.id)))
        .returning({ id: chatConversations.id });

      if (result.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
    }),

  /** Get conversation settings (traits + block status) */
  getSettings: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(and(eq(chatConversations.id, input.id), eq(chatConversations.userId, ctx.session.user.id)))
        .limit(1);

      if (!conv) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });

      // Pre-check blocking
      const { checkBlocking } = await import('@/core-chat/lib/subscription-guard');
      const blockStatus = await checkBlocking(ctx.session.user.id, input.id, 'text', conv.organizationId);

      return {
        traits: {
          genderId: conv.genderId,
          sexualityId: conv.sexualityId,
          ethnicityId: conv.ethnicityId,
          personalityId: conv.personalityId,
          kinkId: conv.kinkId,
          jobId: conv.jobId,
          hobbies: conv.hobbies as number[] | null,
          relationshipId: conv.relationshipId,
          age: conv.age,
          userName: conv.userName,
          bornIn: conv.bornIn,
          livingIn: conv.livingIn,
          customTrait: conv.customTrait,
        },
        lang: conv.lang,
        blockStatus: blockStatus.blocked ? {
          blockType: blockStatus.blockType,
          blockResetAt: blockStatus.blockResetAt,
        } : null,
      };
    }),
});
