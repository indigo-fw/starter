import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, sectionProcedure } from '../trpc';
import { getGA4Config, runGA4Report } from '@/core/lib/analytics/ga4';

const proc = sectionProcedure('content');

export const analyticsRouter = createTRPCRouter({
  overview: proc
    .input(z.object({ days: z.enum(['7', '30', '90']) }))
    .query(async ({ ctx, input }) => {
      const config = await getGA4Config(ctx.db);
      if (!config) return { configured: false as const };

      try {
        const data = await runGA4Report(config, Number(input.days));
        return { configured: true as const, ...data };
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'GA4 report failed',
        });
      }
    }),

  testConnection: proc.mutation(async ({ ctx }) => {
    const config = await getGA4Config(ctx.db);
    if (!config) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'GA4 is not configured. Set Property ID and Service Account JSON in Settings.',
      });
    }
    try {
      await runGA4Report(config, 1);
      return { success: true };
    } catch (err) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: err instanceof Error ? err.message : 'GA4 connection failed',
      });
    }
  }),
});
