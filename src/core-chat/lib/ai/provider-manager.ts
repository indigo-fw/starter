import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';
import { chatProviders, type ChatProvider } from '@/core-chat/schema/providers';
import { chatProviderLogs } from '@/core-chat/schema/provider-logs';
import { decrypt } from '../encryption';
import { getLlmAdapter, getImageAdapter, getVideoAdapter, getTtsAdapter, getSttAdapter } from '../adapters/registry';
import { ProviderClientError } from '../adapters/types';
import type {
  LlmMessage, LlmResponse, AdapterResponse,
  ImageRequest, ImageResponse,
  VideoRequest, VideoResponse,
  TtsResponse, SttResponse,
} from '../adapters/types';

const logger = createLogger('chat-provider-mgr');

// ─── Constants ──────────────────────────────────────────────────────────────
// Cooldown-based resilience (simpler than a full circuit breaker):
// - On 5xx/network error: provider goes on cooldown for DEFAULT_COOLDOWN_MS
// - During cooldown: provider is skipped, next in round-robin is tried
// - After cooldown expires: provider is eligible again (no half-open state)
// - A full circuit breaker (with half-open/threshold) would add complexity
//   for minimal benefit since providers self-recover and cooldown achieves
//   the same effect for the typical 1-3 provider setup.

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
      const startTime = Date.now();
      incrementActive(provider.id);
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
        logProviderRequest(provider.id, 'llm', 'success', Date.now() - startTime);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logProviderRequest(provider.id, 'llm', 'failure', Date.now() - startTime, lastError.message);
        if (anyChunksYielded) { addCooldown(provider.id); throw err; }
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`LLM provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      } finally {
        decrementActive(provider.id);
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

      const startTime = Date.now();
      incrementActive(provider.id);
      try {
        const adapter = getLlmAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        const result = await adapter.complete({
          messages,
          apiUrl: provider.baseUrl ?? 'https://api.openai.com/v1/chat/completions',
          apiKey,
          model: provider.model,
          temperature: opts?.temperature ?? (config.temperature as number | undefined) ?? 0.7,
          maxTokens: opts?.maxTokens ?? (config.maxTokens as number | undefined) ?? 4000,
          timeoutSeconds: provider.timeoutSeconds,
          extraHeaders: config.headers as Record<string, string> | undefined,
        });
        logProviderRequest(provider.id, 'llm', 'success', Date.now() - startTime);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logProviderRequest(provider.id, 'llm', 'failure', Date.now() - startTime, lastError.message);
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`LLM provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      } finally {
        decrementActive(provider.id);
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

      const startTime = Date.now();
      incrementActive(provider.id);
      try {
        const adapter = getImageAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        const result = await adapter.generate({
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
        logProviderRequest(provider.id, 'image', 'success', Date.now() - startTime);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logProviderRequest(provider.id, 'image', 'failure', Date.now() - startTime, lastError.message);
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`Image provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
      } finally {
        decrementActive(provider.id);
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

      const startTime = Date.now();
      incrementActive(provider.id);
      try {
        const adapter = getVideoAdapter(provider.adapterType);
        const apiKey = decryptApiKey(provider);
        const config = (provider.config ?? {}) as Record<string, unknown>;

        const result = await adapter.generate({
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
        logProviderRequest(provider.id, 'video', 'success', Date.now() - startTime);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logProviderRequest(provider.id, 'video', 'failure', Date.now() - startTime, lastError.message);
        if (err instanceof ProviderClientError) throw err;
        logger.warn(`Video provider "${provider.name}" failed`, { attempt: attempt + 1, error: lastError.message });
        addCooldown(provider.id);
        if (attempt < 1) await delay(RETRY_DELAY_MS);
      } finally {
        decrementActive(provider.id);
      }
    }
    throw lastError ?? new Error('All video providers failed');
  },

  // ── TTS (Text-to-Speech) ───────────────────────────────────────────────────

  async synthesizeSpeech(
    text: string,
    voiceIdOverride?: string,
  ): Promise<AdapterResponse<TtsResponse>> {
    const providers = await getAvailableProviders('tts');
    if (providers.length === 0) throw new Error('No TTS providers available');

    const provider = selectProvider(providers, 'tts');
    if (!provider) throw new Error('All TTS providers in cooldown');

    const startTime = Date.now();
    incrementActive(provider.id);
    try {
      const adapter = getTtsAdapter(provider.adapterType);
      const apiKey = decryptApiKey(provider);
      const config = (provider.config ?? {}) as Record<string, unknown>;
      const result = await adapter.synthesize({
        text,
        voiceId: voiceIdOverride ?? (config.voiceId as string) ?? '',
        apiUrl: provider.baseUrl ?? undefined,
        apiKey,
        model: provider.model,
        config,
      });
      logProviderRequest(provider.id, 'tts', 'success', Date.now() - startTime);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logProviderRequest(provider.id, 'tts', 'failure', Date.now() - startTime, errMsg);
      addCooldown(provider.id);
      throw err;
    } finally {
      decrementActive(provider.id);
    }
  },

  // ── STT (Speech-to-Text) ──────────────────────────────────────────────────

  async transcribeAudio(
    audioBuffer: Buffer,
    lang?: string,
  ): Promise<AdapterResponse<SttResponse>> {
    const providers = await getAvailableProviders('stt');
    if (providers.length === 0) throw new Error('No STT providers available');

    const provider = selectProvider(providers, 'stt');
    if (!provider) throw new Error('All STT providers in cooldown');

    const startTime = Date.now();
    incrementActive(provider.id);
    try {
      const adapter = getSttAdapter(provider.adapterType);
      const apiKey = decryptApiKey(provider);
      const result = await adapter.transcribe({
        audioBuffer,
        apiUrl: provider.baseUrl ?? undefined,
        apiKey,
        model: provider.model,
        lang,
      });
      logProviderRequest(provider.id, 'stt', 'success', Date.now() - startTime);
      return result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logProviderRequest(provider.id, 'stt', 'failure', Date.now() - startTime, errMsg);
      addCooldown(provider.id);
      throw err;
    } finally {
      decrementActive(provider.id);
    }
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
  const available = providers.filter((p) => !isInCooldown(p.id) && !isAtCapacity(p));
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

// ─── Provider health logging (fire-and-forget) ─────────────────────────────

const activeRequests = new Map<string, number>();

function incrementActive(providerId: string): void {
  activeRequests.set(providerId, (activeRequests.get(providerId) ?? 0) + 1);
}

function decrementActive(providerId: string): void {
  const current = activeRequests.get(providerId) ?? 1;
  if (current <= 1) activeRequests.delete(providerId);
  else activeRequests.set(providerId, current - 1);
}

function getActiveCount(providerId: string): number {
  return activeRequests.get(providerId) ?? 0;
}

function isAtCapacity(provider: ChatProvider): boolean {
  return getActiveCount(provider.id) >= provider.maxConcurrent;
}

function logProviderRequest(
  providerId: string,
  providerType: string,
  status: 'success' | 'failure',
  responseTimeMs: number,
  errorMessage?: string,
): void {
  // Fire-and-forget — don't await, don't block
  db.insert(chatProviderLogs).values({
    providerId,
    providerType,
    status,
    responseTimeMs,
    errorMessage: errorMessage?.slice(0, 500),
  }).catch((err) => {
    logger.error('Failed to log provider request', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
