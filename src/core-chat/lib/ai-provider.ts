import { ProviderManager } from './provider-manager';
import type { LlmMessage } from './adapters/openai';

/**
 * Get a streaming AI response from DB-configured providers.
 * No env fallback — chat requires providers to be configured in the dashboard.
 * Use the seed script or admin UI to set up providers.
 */
export async function* streamAiResponse(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; model?: string },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  yield* ProviderManager.stream(messages, opts, signal);
}

/**
 * Non-streaming AI completion from DB-configured providers.
 * Returns null if no providers available.
 */
export async function completeAi(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number; model?: string },
) {
  return ProviderManager.complete(messages, opts);
}
