import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { resolveCmsLink } from '@/core/lib/content/cms-link';
import type { CmsLinkRef } from '@/core/lib/content/cms-link';

// Ensure config is registered before any resolution
import '@/config/cms-link-init';

const refSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().max(255).optional(),
  lang: z.string().max(5).optional(),
  type: z.string().max(20).optional(),
});

export const cmsLinkRouter = createTRPCRouter({
  /** Resolve a single cms:// link to a real URL. */
  resolve: publicProcedure
    .input(
      z
        .object({
          id: z.string().uuid().optional(),
          slug: z.string().max(255).optional(),
          lang: z.string().max(5).optional(),
          type: z.string().max(20).optional(),
          locale: z.string().max(5),
        })
        .refine((d) => d.id || d.slug, 'Either id or slug is required'),
    )
    .query(async ({ input }) => {
      const ref: CmsLinkRef = {
        id: input.id,
        slug: input.slug,
        lang: input.lang,
        type: input.type,
      };
      return resolveCmsLink(ref, input.locale);
    }),

  /** Resolve multiple cms:// links in one batched call. */
  resolveMany: publicProcedure
    .input(
      z.object({
        refs: z
          .array(
            refSchema.refine(
              (d) => d.id || d.slug,
              'Either id or slug is required',
            ),
          )
          .max(50),
        locale: z.string().max(5),
      }),
    )
    .query(async ({ input }) => {
      return Promise.all(
        input.refs.map((ref) => resolveCmsLink(ref, input.locale)),
      );
    }),
});
