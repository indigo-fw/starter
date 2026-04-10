import { eq, like } from 'drizzle-orm';
import { z } from 'zod';

import { env } from '@/lib/env';
import { cmsOptions } from '@/server/db/schema';
import { OPTION_REGISTRY } from '@/config/options-registry';
import { invalidateContentVarsCache } from '@/core/lib/content/vars';
import { createTRPCRouter, sectionProcedure, staffProcedure } from '../trpc';

const settingsProcedure = sectionProcedure('settings');

export const optionsRouter = createTRPCRouter({
  /** Check if DeepL translation is configured */
  translationAvailable: staffProcedure.query(() => ({
    available: !!env.DEEPL_API_KEY,
  })),

  /** Get a single option by key */
  get: staffProcedure
    .input(z.object({ key: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(cmsOptions)
        .where(eq(cmsOptions.key, input.key))
        .limit(1);

      return row?.value ?? null;
    }),

  /** Get multiple options by prefix (e.g. 'site.' returns all site.* keys) */
  getByPrefix: staffProcedure
    .input(z.object({ prefix: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(cmsOptions)
        .where(like(cmsOptions.key, `${input.prefix}%`))
        .limit(500);

      const result: Record<string, unknown> = {};
      for (const row of rows) {
        result[row.key] = row.value;
      }
      return result;
    }),

  /** Get all options (settings page) */
  getAll: settingsProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(cmsOptions).limit(500);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }),

  /** Get all registry options merged with DB values */
  listWithDefaults: settingsProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(cmsOptions).limit(500);
    const dbMap = new Map<string, unknown>();
    for (const row of rows) {
      dbMap.set(row.key, row.value);
    }

    return OPTION_REGISTRY.map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description ?? null,
      group: def.group,
      type: def.type,
      defaultValue: def.defaultValue,
      placeholder: def.placeholder,
      currentValue: dbMap.has(def.key) ? dbMap.get(def.key) : def.defaultValue,
      isCustom: dbMap.has(def.key),
    }));
  }),

  /** Set a single option (upsert) */
  set: settingsProcedure
    .input(
      z.object({
        key: z.string().max(255),
        value: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(cmsOptions)
        .values({
          key: input.key,
          value: input.value,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: cmsOptions.key,
          set: { value: input.value, updatedAt: new Date() },
        });

      invalidateContentVarsCache();
      return { success: true };
    }),

  /** Set multiple options at once */
  setMany: settingsProcedure
    .input(
      z.object({
        options: z.record(z.string(), z.unknown()).refine(
          (obj) => Object.keys(obj).length <= 50,
          'Too many options at once'
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entries = Object.entries(input.options);

      for (const [key, value] of entries) {
        await ctx.db
          .insert(cmsOptions)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: cmsOptions.key,
            set: { value, updatedAt: new Date() },
          });
      }

      invalidateContentVarsCache();
      return { success: true };
    }),

  /** Reset an option to its default (delete from DB) */
  resetToDefault: settingsProcedure
    .input(z.object({ key: z.string().max(255) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(cmsOptions)
        .where(eq(cmsOptions.key, input.key));

      invalidateContentVarsCache();
      return { success: true };
    }),

  /** Delete an option */
  delete: settingsProcedure
    .input(z.object({ key: z.string().max(255) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(cmsOptions)
        .where(eq(cmsOptions.key, input.key));

      invalidateContentVarsCache();
      return { success: true };
    }),
});
