import { z } from 'zod';

/** Shared input schema for admin list procedures. Extend with .extend({}) for custom fields. */
export const adminListInput = z.object({
  search: z.string().max(200).optional(),
  status: z.number().int().min(0).max(3).optional(),
  trashed: z.boolean().optional(),
  lang: z.string().max(10).optional(),
  sortBy: z.string().max(50).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const updateStatusInput = z.object({
  id: z.string().uuid(),
  status: z.number().int().min(0).max(2),
});

export const duplicateAsTranslationInput = z.object({
  id: z.string().uuid(),
  targetLang: z.string().min(2).max(10),
  autoTranslate: z.boolean().default(false),
});

export const exportBulkInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  format: z.enum(['json', 'csv']),
});
