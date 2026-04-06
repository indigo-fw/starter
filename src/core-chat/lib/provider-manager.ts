import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { chatProviders, type ChatProvider } from '@/core-chat/schema/providers';
import { decrypt } from './encryption';
import { getLlmAdapter, getImageAdapter, getVideoAdapter } from './adapters/registry';
import { ProviderClientError } from './adapters/types';
import type {
  LlmMessage, LlmResponse, AdapterResponse,
  ImageRequest, ImageResponse,
  VideoRequest, VideoResponse,
} from './adapters/types';

const logger = createLogger('chat-provider-mgr');

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 300_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

// ─── In-memory state ────────────────────────────────────────────────────────

const cooldownMap = new Map<string, number>();
const roundRobinCounters = new Map<string, number>();
const providerCache = new Map<string, { providers: ChatProvider[]; fetchedAt: number }>();

// ─── Provider Manager ───────────────────────────────────────────────────────

export const ProviderManager = {
  // ── LLM (streaming) ───────────────────────────────────────────────────────

  async *streamLlm(
    messages: LlmMessage[],
    opts?: { temperature?: number; maxTokens?: number },
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const providers = await getAvailableProviders('llm');
    if (providers.length === 0) throw new Error('No AI providers available');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const provider = selectProvider(providers, 'llm');
      if (!provider) throw new Error('All LLM providers in cooldown');

      let anyChunksYielded = false;
      try {
        const adapter = getLlmAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
        const config = (provider.config ?? {}) as Record<string, unknown>;

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
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (anyChunksYielded) { addCooldown(provider.id); throw err; }
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`LLM provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      }
    }
    throw lastError ?? new Error('All LLM providers failed');
  },

  // ── LLM (non-streaming) ──────────────────────────────────────────────────

  async completeLlm(
    messages: LlmMessage[],
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<AdapterResponse<LlmResponse>> {
    const providers = await getAvailableProviders('llm');
    if (providers.length === 0) throw new Error('No AI providers available');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const provider = selectProvider(providers, 'llm');
      if (!provider) throw new Error('All LLM providers in cooldown');

      try {
        const adapter = getLlmAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
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
        logger.warn(`LLM provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      }
    }
    throw lastError ?? new Error('All LLM providers failed');
  },

  // ── Image generation ──────────────────────────────────────────────────────

  async generateImage(
    prompt: string,
    opts?: { width?: number; height?: number; negativePrompt?: string },
  ): Promise<AdapterResponse<ImageResponse>> {
    const providers = await getAvailableProviders('image');
    if (providers.length === 0) throw new Error('No image providers available');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const provider = selectProvider(providers, 'image');
      if (!provider) throw new Error('All image providers in cooldown');

      try {
        const adapter = getImageAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        return await adapter.generate({
          prompt,
          negativePrompt: opts?.negativePrompt,
          width: opts?.width ?? (config.width as number | undefined),
          height: opts?.height ?? (config.height as number | undefined),
          apiUrl: provider.baseUrl ?? 'https://api.openai.com/v1/images/generations',
          apiKey,
          model: provider.model,
          config,
          timeoutSeconds: provider.timeoutSeconds,
          extraHeaders: config.headers as Record<string, string> | undefined,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`Image provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      }
    }
    throw lastError ?? new Error('All image providers failed');
  },

  // ── Video generation ──────────────────────────────────────────────────────

  async generateVideo(
    sourceImageUrl: string,
    opts?: { prompt?: string; duration?: number; resolution?: string },
  ): Promise<AdapterResponse<VideoResponse>> {
    const providers = await getAvailableProviders('video');
    if (providers.length === 0) throw new Error('No video providers available');

    let lastError: Error | null = null;

    // Video gen is slow — only 1 retry
    for (let attempt = 0; attempt <= 1; attempt++) {
      const provider = selectProvider(providers, 'video');
      if (!provider) throw new Error('All video providers in cooldown');

      try {
        const adapter = getVideoAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        return await adapter.generate({
          sourceImageUrl,
          prompt: opts?.prompt,
          duration: opts?.duration ?? (config.duration as number | undefined),
          resolution: opts?.resolution ?? (config.resolution as string | undefined),
          apiUrl: provider.baseUrl ?? '',
          apiKey,
          model: provider.model,
          config,
          timeoutSeconds: provider.timeoutSeconds ?? 600,
          extraHeaders: config.headers as Record<string, string> | undefined,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`Video provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < 1) await delay(RETRY_DELAY_MS);
      }
    }
    throw lastError ?? new Error('All video providers failed');
  },

  /** Clear the provider cache (call after admin CRUD) */
  clearCache(): void {
    providerCache.clear();
  },
};

// ── Aliases for backward compat with ai-provider.ts ─────────────────────────

export const streamLlm = ProviderManager.streamLlm.bind(ProviderManager);
export const completeLlm = ProviderManager.completeLlm.bind(ProviderManager);

// ─── Internal helpers ───────────────────────────────────────────────────────

async function getAvailableProviders(type: string): Promise<ChatProvider[]> {
  const cached = providerCache.get(type);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.providers;
  }

  const providers = await db
    .select()
    .from(chatProviders)
    .where(and(
      eq(chatProviders.providerType, type),
      eq(chatProviders.status, 'active'),
    ))
    .orderBy(desc(chatProviders.priority))
    .limit(50);

  providerCache.set(type, { providers, fetchedAt: Date.now() });
  return providers;
}

function selectProvider(providers: ChatProvider[], type: string): ChatProvider | null {
  const available = providers.filter((p) => !isInCooldown(p.id));
  if (available.length === 0) return null;
  if (available.length === 1) return available[0]!;

  const key = `rr:${type}`;
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
  if (Date.now() > expiry) { cooldownMap.delete(providerId); return false; }
  return true;
}

/**
 * Decrypt API key from provider record. Mock adapters get an empty string
 * (they ignore the key). This avoids requiring ENCRYPTION_KEY for dev/mock mode.
 */
function decryptApiKey(provider: ChatProvider): string {
  if (provider.adapterType === 'mock') return '';
  return decrypt(provider.encryptedApiKey);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
