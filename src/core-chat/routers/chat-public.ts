import { z } from 'zod';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatCharacters } from '@/core-chat/schema/characters';

export const chatPublicRouter = createTRPCRouter({
  /** List active characters for public browsing */
  characters: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      return db
        .select({
          id: chatCharacters.id,
          name: chatCharacters.name,
          slug: chatCharacters.slug,
          tagline: chatCharacters.tagline,
          personality: chatCharacters.personality,
          avatarUrl: chatCharacters.avatarUrl,
          metadata: chatCharacters.metadata,
        })
        .from(chatCharacters)
        .where(and(
          eq(chatCharacters.isActive, true),
          isNull(chatCharacters.deletedAt),
        ))
        .orderBy(asc(chatCharacters.sortOrder))
        .limit(input.limit);
    }),

  /** Get a single character by slug */
  character: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      const [character] = await db
        .select({
          id: chatCharacters.id,
          name: chatCharacters.name,
          slug: chatCharacters.slug,
          tagline: chatCharacters.tagline,
          personality: chatCharacters.personality,
          avatarUrl: chatCharacters.avatarUrl,
          greeting: chatCharacters.greeting,
          metadata: chatCharacters.metadata,
        })
        .from(chatCharacters)
        .where(and(
          eq(chatCharacters.slug, input.slug),
          eq(chatCharacters.isActive, true),
          isNull(chatCharacters.deletedAt),
        ))
        .limit(1);

      if (!character) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Character not found' });
      }

      return character;
    }),
});
