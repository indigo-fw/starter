import crypto from 'crypto';
import { z } from 'zod';

import { DEFAULT_LOCALE } from '@/lib/constants';
import { slugify } from '@/core/lib/content/slug';
import { cmsPosts } from '@/server/db/schema';
import { logAudit } from '@/core/lib/infra/audit';
import { parseCSV } from '@/core-import/lib/importers/csv';
import { parseGhostJSON } from '@/core-import/lib/importers/ghost';
import { parseWordPressWXR } from '@/core-import/lib/importers/wordpress';
import { parseIndigoJSON } from '@/core-import/lib/importers/indigo';
import { exportContent } from '@/core-import/lib/export';
import { ContentStatus, PostType } from '@/core/types/cms';

import { createTRPCRouter, sectionProcedure } from '@/server/trpc';

const proc = sectionProcedure('content');
const settingsProc = sectionProcedure('settings');

export const importRouter = createTRPCRouter({
  /** Parse an import file and return a preview of items to import */
  preview: proc
    .input(
      z.object({
        content: z.string().max(50_000_000), // 50MB
        format: z.enum(['wordpress', 'ghost', 'csv', 'indigo']),
        columnMap: z.record(z.string(), z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      switch (input.format) {
        case 'wordpress':
          return parseWordPressWXR(input.content);
        case 'ghost':
          return parseGhostJSON(input.content);
        case 'csv':
          return parseCSV(input.content, input.columnMap ?? {});
        case 'indigo':
          return parseIndigoJSON(input.content);
      }
    }),

  /** Execute the import — insert selected items into cms_posts */
  execute: proc
    .input(
      z.object({
        items: z
          .array(
            z.object({
              title: z.string().max(255),
              slug: z.string().max(255),
              content: z.string(),
              status: z.enum(['draft', 'published']),
              publishedAt: z.string().optional(),
              metaDescription: z.string().max(500).optional(),
              seoTitle: z.string().max(100).optional(),
            })
          )
          .max(500),
        defaultStatus: z.enum(['draft', 'published']).optional(),
        postType: z.number().int().min(1).max(2).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];
      const type = input.postType ?? PostType.BLOG;

      // Process in chunks of 50
      for (let i = 0; i < input.items.length; i += 50) {
        const chunk = input.items.slice(i, i + 50);

        for (const item of chunk) {
          try {
            // Deduplicate slug
            let slug = slugify(item.slug || item.title);
            let suffix = 0;
            let unique = false;
            while (!unique) {
              const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
              const existing = await ctx.db.query.cmsPosts.findFirst({
                where: (posts, { eq: e, and: a, isNull: n }) =>
                  a(
                    e(posts.slug, candidate),
                    e(posts.type, type),
                    e(posts.lang, 'en'),
                    n(posts.deletedAt)
                  ),
                columns: { id: true },
              });
              if (!existing) {
                slug = candidate;
                unique = true;
              } else {
                suffix++;
                if (suffix > 50) {
                  // Safety limit to prevent infinite loop
                  slug = `${slug}-${Date.now()}`;
                  unique = true;
                }
              }
            }

            const status =
              (input.defaultStatus ?? item.status) === 'published'
                ? ContentStatus.PUBLISHED
                : ContentStatus.DRAFT;

            const previewToken = crypto.randomBytes(32).toString('hex');

            await ctx.db.insert(cmsPosts).values({
              title: item.title,
              slug,
              content: item.content,
              type,
              status,
              lang: DEFAULT_LOCALE,
              publishedAt: item.publishedAt
                ? new Date(item.publishedAt)
                : status === ContentStatus.PUBLISHED
                  ? new Date()
                  : null,
              metaDescription: item.metaDescription ?? null,
              seoTitle: item.seoTitle ?? null,
              previewToken,
              authorId: ctx.session.user.id,
            });

            created++;
          } catch (err) {
            errors.push(
              `Failed to import "${item.title}": ${err instanceof Error ? err.message : 'Unknown error'}`
            );
            skipped++;
          }
        }
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'import',
        entityType: 'post',
        entityId: crypto.randomUUID(),
        entityTitle: `Imported ${created} items`,
        metadata: { created, skipped, errors: errors.length },
      });

      return { created, skipped, errors };
    }),

  /** Export all CMS content as JSON (for backup or migration between instances) */
  export: settingsProc.mutation(async ({ ctx }) => {
    const data = await exportContent(ctx.db);

    logAudit({
      db: ctx.db,
      userId: ctx.session.user.id,
      action: 'export',
      entityType: 'system',
      entityId: crypto.randomUUID(),
      entityTitle: `Exported ${data.posts.length} posts, ${data.categories.length} categories`,
    });

    return data;
  }),
});
