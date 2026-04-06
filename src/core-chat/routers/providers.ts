import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, superadminProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatProviders } from '@/core-chat/schema/providers';
import { encrypt, decrypt, maskApiKey, isEncryptionConfigured } from '@/core-chat/lib/encryption';
import { ProviderManager } from '@/core-chat/lib/provider-manager';
import { getLlmAdapter, getImageAdapter, getVideoAdapter } from '@/core-chat/lib/adapters/registry';
import { ProviderType } from '@/core-chat/lib/adapters/types';
import { parsePagination, paginatedResult } from '@/core/crud';

export const providerRouter = createTRPCRouter({
  /** List providers (masked keys) */
  list: superadminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const items = await db
        .select()
        .from(chatProviders)
        .orderBy(desc(chatProviders.priority))
        .limit(pageSize)
        .offset(offset);

      // Mask API keys for list view
      const masked = items.map((p) => {
        let maskedKey = '****';
        try {
          maskedKey = maskApiKey(decrypt(p.encryptedApiKey));
        } catch {
          maskedKey = '[decryption failed]';
        }
        return { ...p, encryptedApiKey: maskedKey };
      });

      return masked;
    }),

  /** Get single provider with decrypted key (admin editing) */
  get: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(chatProviders)
        .where(eq(chatProviders.id, input.id))
        .limit(1);

      if (!provider) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
      }

      let apiKey = '';
      try {
        apiKey = decrypt(provider.encryptedApiKey);
      } catch {
        apiKey = '[decryption failed - re-enter key]';
      }

      return { ...provider, apiKey, encryptedApiKey: undefined };
    }),

  /** Create a new provider */
  create: superadminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      providerType: z.enum(['llm', 'image', 'video']).default('llm'),
      adapterType: z.string().max(20).default('openai'),
      baseUrl: z.string().max(500).optional(),
      apiKey: z.string().min(1).max(500),
      model: z.string().min(1).max(100),
      priority: z.number().int().default(0),
      status: z.enum(['active', 'inactive']).default('active'),
      maxConcurrent: z.number().int().min(1).max(100).default(10),
      timeoutSeconds: z.number().int().min(5).max(300).default(60),
      config: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      if (!isEncryptionConfigured()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'ENCRYPTION_KEY not configured in .env. Cannot store provider credentials.',
        });
      }

      const encryptedApiKey = encrypt(input.apiKey);

      const [provider] = await db.insert(chatProviders).values({
        name: input.name,
        providerType: input.providerType,
        adapterType: input.adapterType,
        baseUrl: input.baseUrl,
        encryptedApiKey,
        model: input.model,
        priority: input.priority,
        status: input.status,
        maxConcurrent: input.maxConcurrent,
        timeoutSeconds: input.timeoutSeconds,
        config: input.config ?? null,
      }).returning();

      ProviderManager.clearCache();
      return { id: provider!.id };
    }),

  /** Update provider (re-encrypts key if changed) */
  update: superadminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      providerType: z.enum(['llm', 'image', 'video']).optional(),
      adapterType: z.string().max(20).optional(),
      baseUrl: z.string().max(500).nullable().optional(),
      apiKey: z.string().min(1).max(500).optional(),
      model: z.string().min(1).max(100).optional(),
      priority: z.number().int().optional(),
      status: z.enum(['active', 'inactive', 'error']).optional(),
      maxConcurrent: z.number().int().min(1).max(100).optional(),
      timeoutSeconds: z.number().int().min(5).max(300).optional(),
      config: z.record(z.string(), z.unknown()).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, apiKey, ...updates } = input;

      const updateData: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date(),
      };

      if (apiKey) {
        if (!isEncryptionConfigured()) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'ENCRYPTION_KEY not configured in .env.',
          });
        }
        updateData.encryptedApiKey = encrypt(apiKey);
      }

      const result = await db
        .update(chatProviders)
        .set(updateData)
        .where(eq(chatProviders.id, id))
        .returning({ id: chatProviders.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
      }

      ProviderManager.clearCache();
      return { id };
    }),

  /** Delete provider (hard delete) */
  delete: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const result = await db
        .delete(chatProviders)
        .where(eq(chatProviders.id, input.id))
        .returning({ id: chatProviders.id });

      if (result.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
      }

      ProviderManager.clearCache();
    }),

  /** Test a provider with a simple prompt */
  test: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(chatProviders)
        .where(eq(chatProviders.id, input.id))
        .limit(1);

      if (!provider) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Provider not found' });
      }

      const apiKey = decrypt(provider.encryptedApiKey);

      try {
        if (provider.providerType === ProviderType.LLM) {
          const adapter = getLlmAdapter(provider.adapterType);
          const result = await adapter.complete({
            messages: [
              { role: 'system', content: 'Respond with exactly: "Provider test successful."' },
              { role: 'user', content: 'Test' },
            ],
            apiUrl: provider.baseUrl ?? 'https://api.openai.com/v1/chat/completions',
            apiKey,
            model: provider.model,
            timeoutSeconds: 15,
          });
          return { success: true, response: result.result.text.slice(0, 100) };

        } else if (provider.providerType === ProviderType.IMAGE) {
          const adapter = getImageAdapter(provider.adapterType);
          const result = await adapter.generate({
            prompt: 'A simple test image of a red circle on white background',
            apiUrl: provider.baseUrl ?? 'https://api.openai.com/v1/images/generations',
            apiKey,
            model: provider.model,
            timeoutSeconds: 30,
          });
          return { success: true, response: `Image generated: ${result.result.width}x${result.result.height}` };

        } else if (provider.providerType === ProviderType.VIDEO) {
          // Video test is expensive — just verify the adapter loads
          getVideoAdapter(provider.adapterType);
          return { success: true, response: `Video adapter "${provider.adapterType}" loaded successfully` };
        }

        return { success: false, response: `Unknown provider type: ${provider.providerType}` };
      } catch (err) {
        return {
          success: false,
          response: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }),
});
