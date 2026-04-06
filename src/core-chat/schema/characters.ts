import { boolean, index, integer, jsonb, pgTable, real, smallint, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_characters ────────────────────────────────────────────────────────
// AI personas that users can chat with. Admin-managed.
// Enum IDs reference character-enums.ts (personality traits) and visual-enums.ts (appearance).

export const chatCharacters = pgTable('chat_characters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  tagline: varchar('tagline', { length: 255 }),
  systemPrompt: text('system_prompt').notNull(),
  personality: text('personality'),
  avatarUrl: varchar('avatar_url', { length: 1024 }),
  greeting: text('greeting'),

  // Character trait enum IDs (from character-enums.ts)
  genderId: smallint('gender_id'),
  sexualityId: smallint('sexuality_id'),
  ethnicityId: smallint('ethnicity_id'),
  personalityId: smallint('personality_id'),
  kinkId: smallint('kink_id'),
  jobId: smallint('job_id'),
  hobbies: jsonb('hobbies').$type<number[] | null>(),
  relationshipId: smallint('relationship_id'),

  // Visual trait enum IDs (from visual-enums.ts — for image generation)
  hairColorId: smallint('hair_color_id'),
  hairTextureId: smallint('hair_texture_id'),
  hairStyleId: smallint('hair_style_id'),
  eyesColorId: smallint('eyes_color_id'),
  skinId: smallint('skin_id'),
  bodyDescriptionId: smallint('body_description_id'),
  customNegative: text('custom_negative'),
  modelPreset: varchar('model_preset', { length: 50 }),
  loraConfig: text('lora_config'),

  // Featured media (for browse page)
  featuredImageId: text('featured_image_id'),
  featuredVideoId: text('featured_video_id'),

  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  tokenCostMultiplier: real('token_cost_multiplier').notNull().default(1.0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_chat_characters_active').on(t.isActive, t.sortOrder),
  index('idx_chat_characters_deleted').on(t.deletedAt),
]);

export type ChatCharacter = typeof chatCharacters.$inferSelect;
export type NewChatCharacter = typeof chatCharacters.$inferInsert;
