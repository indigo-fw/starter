import { eq, desc } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { chatProviders, type ChatProvider } from '@/core-chat/schema/providers';
import { decrypt } from './encryption';
import { OpenAiAdapter, ProviderClientError, type LlmMessage, type LlmResponse } from './adapters/openai';

const logger = createLogger('chat-provider-mgr');

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;         // 60s provider list cache
const DEFAULT_COOLDOWN_MS = 300_000; // 5 min cooldown on failure
const MAX_RETRIES = 2;               // 2 retries = 3 total attempts
const RETRY_DELAY_MS = 1_000;        // 1s between retries

// ─── In-memory state ────────────────────────────────────────────────────────

const cooldownMap = new Map<string, number>();  // providerId → expiry timestamp
const roundRobinCounters = new Map<string, number>();

let providerCache: { providers: ChatProvider[]; fetchedAt: number } | null = null;

// ─── Provider Manager ───────────────────────────────────────────────────────

export const ProviderManager = {
  /**
   * Get a streaming completion from the best available provider.
   * Handles round-robin selection, fallback on failure, cooldown.
   */
  async *stream(
    messages: LlmMessage[],
    opts?: { temperature?: number; maxTokens?: number },
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const providers = await getAvailableProviders();
    if (providers.length === 0) {
      throw new Error('No AI providers available');
    }

    let lastError: Error | null = null;
    const adapter = new OpenAiAdapter();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const provider = selectProvider(providers);
      if (!provider) {
        throw new Error('All providers in cooldown');
      }

      let anyChunksYielded = false;
      try {
        const apiKey = decrypt(provider.encryptedApiKey);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        // Manual iteration instead of yield* — tracks whether chunks were sent.
        // Once chunks are yielded to the caller, we can't retry with a different
        // provider (the caller already accumulated partial text). Only retry if
        // the failure happened before any chunks were sent (connection refused, auth error).
        for await (const chunk of adapter.stream({
          messages,
          apiUrl: provider.baseUrl ?? 'https://api.openai.com/v1/chat/completions',
          apiKey,
          model: provider.model,
          temperature: opts?.temperature ?? (config.temperature as number | undefined) ?? 0.7,
          maxTokens: opts?.maxTokens ?? (config.maxTokens as number | undefined) ?? 4000,
          timeoutSeconds: provider.timeoutSeconds,
          extraHeaders: config.headers as Record<string, string> | undefined,
        }, signal)) {
          anyChunksYielded = true;
          yield chunk;
        }

        return; // Success — exit
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // If chunks were already yielded, can't retry — caller has partial text.
        // Propagate error so engine.ts can refund tokens + broadcast failure.
        if (anyChunksYielded) {
          logger.warn(`Provider "${provider.name}" failed mid-stream (no retry possible)`, {
            providerId: provider.id,
            error: lastError.message,
          });
          addCooldown(provider.id);
          throw err;
        }

        // Client errors (4xx): rethrow immediately, no cooldown
        if (err instanceof ProviderClientError) {
          logger.warn(`Provider "${provider.name}" rejected input (${err.statusCode})`);
          throw err;
        }

        // Pre-stream failure: cooldown + retry with next provider
        logger.warn(`Provider "${provider.name}" failed (pre-stream)`, {
          providerId: provider.id,
          error: lastError.message,
          attempt: attempt + 1,
        });
        addCooldown(provider.id);

        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError ?? new Error('All providers failed');
  },

  /** Non-streaming completion with fallback */
  async complete(
    messages: LlmMessage[],
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<LlmResponse> {
    const providers = await getAvailableProviders();
    if (providers.length === 0) {
      throw new Error('No AI providers available');
    }

    let lastError: Error | null = null;
    const adapter = new OpenAiAdapter();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const provider = selectProvider(providers);
      if (!provider) {
        throw new Error('All providers in cooldown');
      }

      try {
        const apiKey = decrypt(provider.encryptedApiKey);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        return await adapter.complete({
          messages,
          apiUrl: provider.baseUrl ?? 'https://api.openai.com/v1/chat/completions',
          apiKey,
          model: provider.model,
          temperature: opts?.temperature ?? (config.temperature as number | undefined) ?? 0.7,
          maxTokens: opts?.maxTokens ?? (config.maxTokens as number | undefined) ?? 4000,
          timeoutSeconds: provider.timeoutSeconds,
          extraHeaders: config.headers as Record<string, string> | undefined,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof ProviderClientError) throw err;

        logger.warn(`Provider "${provider.name}" failed`, {
          providerId: provider.id,
          error: lastError.message,
          attempt: attempt + 1,
        });
        addCooldown(provider.id);

        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError ?? new Error('All providers failed');
  },

  /** Clear the provider cache (call after admin CRUD) */
  clearCache(): void {
    providerCache = null;
  },
};

// ─── Internal helpers ───────────────────────────────────────────────────────

async function getAvailableProviders(): Promise<ChatProvider[]> {
  // Check cache
  if (providerCache && Date.now() - providerCache.fetchedAt < CACHE_TTL_MS) {
    return providerCache.providers;
  }

  const providers = await db
    .select()
    .from(chatProviders)
    .where(eq(chatProviders.status, 'active'))
    .orderBy(desc(chatProviders.priority))
    .limit(50);

  providerCache = { providers, fetchedAt: Date.now() };
  return providers;
}

/**
 * Select next provider: filter cooled-down, then round-robin among remaining.
 */
function selectProvider(providers: ChatProvider[]): ChatProvider | null {
  const available = providers.filter((p) => !isInCooldown(p.id));
  if (available.length === 0) return null;

  // If only one, skip round-robin
  if (available.length === 1) return available[0]!;

  // Round-robin among available providers
  const key = 'chat-llm';
  const counter = (roundRobinCounters.get(key) ?? 0) + 1;
  roundRobinCounters.set(key, counter);

  return available[(counter - 1) % available.length]!;
}

function addCooldown(providerId: string): void {
  cooldownMap.set(providerId, Date.now() + DEFAULT_COOLDOWN_MS);
}

function isInCooldown(providerId: string): boolean {
  const expiry = cooldownMap.get(providerId);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    cooldownMap.delete(providerId);
    return false;
  }
  return true;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
