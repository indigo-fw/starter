import { createLogger } from '@/core/lib/logger';
import type {
  ChatAiConfig,
  ChatAiCompletionResult,
  ChatAiMessage,
  ChatAiProvider,
  ChatAiStreamChunk,
} from './types';

const logger = createLogger('chat-ai');

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4000;

/**
 * Create an OpenAI-compatible chat provider.
 * Works with OpenAI, Anthropic (via proxy), local models (Ollama, vLLM), etc.
 */
export function createOpenAiCompatibleProvider(config: ChatAiConfig): ChatAiProvider {
  return {
    async complete(messages, opts) {
      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: opts?.temperature ?? config.temperature,
            max_tokens: opts?.maxTokens ?? config.maxTokens,
            stream: false,
          }),
        });

        if (!response.ok) {
          logger.error('AI completion failed', { status: response.status, statusText: response.statusText });
          return null;
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };

        const text = data.choices?.[0]?.message?.content?.trim() ?? '';
        const tokenCount = data.usage?.total_tokens ?? 0;
        return { text, tokenCount };
      } catch (err) {
        logger.error('AI completion error', { error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    },

    async *stream(messages, opts) {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: opts?.temperature ?? config.temperature,
          max_tokens: opts?.maxTokens ?? config.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      if (!response.ok || !response.body) {
        logger.error('AI stream failed', { status: response.status });
        yield { chunk: '', done: true, tokenCount: 0 };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);

            if (payload === '[DONE]') {
              yield { chunk: '', done: true, tokenCount: totalTokens };
              return;
            }

            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
                usage?: { total_tokens?: number };
              };
              const chunk = parsed.choices?.[0]?.delta?.content ?? '';
              if (parsed.usage?.total_tokens) {
                totalTokens = parsed.usage.total_tokens;
              }
              if (chunk) {
                yield { chunk, done: false };
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // If we exit without [DONE], emit final
      yield { chunk: '', done: true, tokenCount: totalTokens };
    },
  };
}

/**
 * Get an AI provider from env vars. Returns null if not configured.
 */
export async function getProviderFromEnv(modelOverride?: string): Promise<ChatAiProvider | null> {
  const { env } = await import('@/lib/env');
  if (!env.AI_API_KEY) return null;

  return createOpenAiCompatibleProvider({
    apiUrl: env.AI_API_URL ?? DEFAULT_API_URL,
    apiKey: env.AI_API_KEY,
    model: modelOverride ?? env.AI_MODEL ?? DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
  });
}
