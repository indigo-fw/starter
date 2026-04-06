import { z } from 'zod';
import { eq, and, isNull, asc, desc, count as drizzleCount } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatCharacters } from '@/core-chat/schema/characters';
import { ensureSlugUnique, fetchOrNotFound, softDelete, parsePagination, paginatedResult } from '@/core/crud';
import type { ChatCharacter } from '@/core-chat/schema/characters';

const adminProcedure = sectionProcedure('settings');

const characterCrud = {
  table: chatCharacters,
  id: chatCharacters.id,
  deleted_at: chatCharacters.deletedAt,
};

export const characterRouter = createTRPCRouter({
  list: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      includeInactive: z.boolean().default(false),
      trashed: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = input.trashed
        ? [eq(chatCharacters.deletedAt, chatCharacters.deletedAt)] // isNotNull workaround — use raw
        : [isNull(chatCharacters.deletedAt)];

      if (!input.includeInactive && !input.trashed) {
        conditions.push(eq(chatCharacters.isActive, true));
      }

      const where = and(...conditions);

      const [items, countResult] = await Promise.all([
        db.select()
          .from(chatCharacters)
          .where(where)
          .orderBy(asc(chatCharacters.sortOrder), desc(chatCharacters.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ count: drizzleCount() })
          .from(chatCharacters)
          .where(where),
      ]);

      return paginatedResult(items, countResult[0]?.count ?? 0, page, pageSize);
    }),

  get: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return fetchOrNotFound<ChatCharacter>(db, chatCharacters, input.id, 'Character');
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(1).max(100),
      tagline: z.string().max(255).optional(),
      systemPrompt: z.string().min(1).max(10000),
      personality: z.string().max(5000).optional(),
      avatarUrl: z.string().max(1024).optional(),
      greeting: z.string().max(2000).optional(),
      modelPreset: z.string().max(50).optional(),
      // Character trait enum IDs
      genderId: z.number().int().optional(),
      sexualityId: z.number().int().optional(),
      ethnicityId: z.number().int().optional(),
      personalityId: z.number().int().optional(),
      kinkId: z.number().int().optional(),
      jobId: z.number().int().optional(),
      hobbies: z.array(z.number().int()).max(10).optional(),
      relationshipId: z.number().int().optional(),
      // Visual trait enum IDs
      hairColorId: z.number().int().optional(),
      hairTextureId: z.number().int().optional(),
      hairStyleId: z.number().int().optional(),
      eyesColorId: z.number().int().optional(),
      skinId: z.number().int().optional(),
      bodyDescriptionId: z.number().int().optional(),
      customNegative: z.string().max(2000).optional(),
      loraConfig: z.string().max(500).optional(),
      // General
      isActive: z.boolean().default(true),
      sortOrder: z.number().int().default(0),
      tokenCostMultiplier: z.number().min(0.1).max(10).default(1.0),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSlugUnique(db, {
        table: chatCharacters,
        slugCol: chatCharacters.slug,
        slug: input.slug,
        deletedAtCol: chatCharacters.deletedAt,
      }, 'Character');

      const [character] = await db.insert(chatCharacters).values({
        name: input.name,
        slug: input.slug,
        tagline: input.tagline,
        systemPrompt: input.systemPrompt,
        personality: input.personality,
        avatarUrl: input.avatarUrl,
        greeting: input.greeting,
        modelPreset: input.modelPreset,
        genderId: input.genderId,
        sexualityId: input.sexualityId,
        ethnicityId: input.ethnicityId,
        personalityId: input.personalityId,
        kinkId: input.kinkId,
        jobId: input.jobId,
        hobbies: input.hobbies ?? null,
        relationshipId: input.relationshipId,
        hairColorId: input.hairColorId,
        hairTextureId: input.hairTextureId,
        hairStyleId: input.hairStyleId,
        eyesColorId: input.eyesColorId,
        skinId: input.skinId,
        bodyDescriptionId: input.bodyDescriptionId,
        customNegative: input.customNegative,
        loraConfig: input.loraConfig,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
        tokenCostMultiplier: input.tokenCostMultiplier,
        metadata: input.metadata ?? null,
      }).returning();

      return character!;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      slug: z.string().min(1).max(100).optional(),
      tagline: z.string().max(255).nullable().optional(),
      systemPrompt: z.string().min(1).max(10000).optional(),
      personality: z.string().max(5000).nullable().optional(),
      avatarUrl: z.string().max(1024).nullable().optional(),
      greeting: z.string().max(2000).nullable().optional(),
      modelPreset: z.string().max(50).nullable().optional(),
      genderId: z.number().int().nullable().optional(),
      sexualityId: z.number().int().nullable().optional(),
      ethnicityId: z.number().int().nullable().optional(),
      personalityId: z.number().int().nullable().optional(),
      kinkId: z.number().int().nullable().optional(),
      jobId: z.number().int().nullable().optional(),
      hobbies: z.array(z.number().int()).max(10).nullable().optional(),
      relationshipId: z.number().int().nullable().optional(),
      hairColorId: z.number().int().nullable().optional(),
      hairTextureId: z.number().int().nullable().optional(),
      hairStyleId: z.number().int().nullable().optional(),
      eyesColorId: z.number().int().nullable().optional(),
      skinId: z.number().int().nullable().optional(),
      bodyDescriptionId: z.number().int().nullable().optional(),
      customNegative: z.string().max(2000).nullable().optional(),
      loraConfig: z.string().max(500).nullable().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      tokenCostMultiplier: z.number().min(0.1).max(10).optional(),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;

      // Verify exists
      await fetchOrNotFound<ChatCharacter>(db, chatCharacters, id, 'Character');

      if (updates.slug) {
        await ensureSlugUnique(db, {
          table: chatCharacters,
          slugCol: chatCharacters.slug,
          slug: updates.slug,
          idCol: chatCharacters.id,
          excludeId: id,
          deletedAtCol: chatCharacters.deletedAt,
        }, 'Character');
      }

      const [updated] = await db
        .update(chatCharacters)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(chatCharacters.id, id))
        .returning();

      return updated!;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await softDelete(db, characterCrud, input.id);
    }),
});
