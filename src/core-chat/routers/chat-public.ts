import { z } from 'zod';
import { eq, and, isNull, asc, sql, count as drizzleCount } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatCharacters } from '@/core-chat/schema/characters';
import { chatMedia } from '@/core-chat/schema/media';
import { parsePagination } from '@/core/crud';

const activeCharacterCondition = and(
  eq(chatCharacters.isActive, true),
  isNull(chatCharacters.deletedAt),
);

export const chatPublicRouter = createTRPCRouter({
  /** List active characters with filters, pagination, and media URLs */
  characters: publicProcedure
    .input(z.object({
      genderId: z.number().int().optional(),
      ethnicityId: z.number().int().optional(),
      personalityId: z.number().int().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(12),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [activeCharacterCondition!];
      if (input.genderId) conditions.push(eq(chatCharacters.genderId, input.genderId));
      if (input.ethnicityId) conditions.push(eq(chatCharacters.ethnicityId, input.ethnicityId));
      if (input.personalityId) conditions.push(eq(chatCharacters.personalityId, input.personalityId));

      const where = and(...conditions);

      const [items, countResult] = await Promise.all([
        db.select({
          id: chatCharacters.id,
          name: chatCharacters.name,
          slug: chatCharacters.slug,
          tagline: chatCharacters.tagline,
          personality: chatCharacters.personality,
          avatarUrl: chatCharacters.avatarUrl,
          genderId: chatCharacters.genderId,
          ethnicityId: chatCharacters.ethnicityId,
          personalityId: chatCharacters.personalityId,
          featuredImageId: chatCharacters.featuredImageId,
          featuredVideoId: chatCharacters.featuredVideoId,
          // Resolve media URLs via subquery
          featuredImageUrl: sql<string | null>`(
            SELECT ${chatMedia.filepath} FROM ${chatMedia}
            WHERE ${chatMedia.id} = ${chatCharacters.featuredImageId} LIMIT 1
          )`,
          featuredVideoUrl: sql<string | null>`(
            SELECT ${chatMedia.filepath} FROM ${chatMedia}
            WHERE ${chatMedia.id} = ${chatCharacters.featuredVideoId} LIMIT 1
          )`,
        })
          .from(chatCharacters)
          .where(where)
          .orderBy(asc(chatCharacters.sortOrder))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: drizzleCount() }).from(chatCharacters).where(where),
      ]);

      const total = countResult[0]?.count ?? 0;
      return {
        results: items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  /** Faceted filter counts for the filter bar */
  characterFilters: publicProcedure.query(async () => {
    const base = activeCharacterCondition;

    const [genders, ethnicities, personalities] = await Promise.all([
      db.select({
        id: chatCharacters.genderId,
        count: drizzleCount(),
      }).from(chatCharacters).where(base).groupBy(chatCharacters.genderId),

      db.select({
        id: chatCharacters.ethnicityId,
        count: drizzleCount(),
      }).from(chatCharacters).where(base).groupBy(chatCharacters.ethnicityId),

      db.select({
        id: chatCharacters.personalityId,
        count: drizzleCount(),
      }).from(chatCharacters).where(base).groupBy(chatCharacters.personalityId),
    ]);

    return {
      genders: genders.filter((g) => g.id != null),
      ethnicities: ethnicities.filter((e) => e.id != null),
      personalities: personalities.filter((p) => p.id != null),
    };
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
          genderId: chatCharacters.genderId,
          personalityId: chatCharacters.personalityId,
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
