import { createLogger } from '@/core/lib/infra/logger';
import type { LlmAdapter, LlmRequest, LlmResponse, AdapterResponse } from './types';
import { ProviderClientError } from './types';

const _logger = createLogger('openai-llm');
const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI-compatible LLM adapter.
 * Works with OpenAI, Anthropic (via proxy), Ollama, vLLM, etc.
 */
export class OpenAiLlmAdapter implements LlmAdapter {
  async complete(request: LlmRequest): Promise<AdapterResponse<LlmResponse>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (request.timeoutSeconds ?? 30) * 1000);

    try {
      const response = await fetch(normalizeUrl(request.apiUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.apiKey}`,
          ...request.extraHeaders,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4000,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (response.status >= 400 && response.status < 500) {
          throw new ProviderClientError(`${response.status}: ${body.slice(0, 200)}`, response.status);
        }
        throw new Error(`Provider error ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      return {
        result: {
          text: data.choices?.[0]?.message?.content?.trim() ?? '',
          tokenCount: data.usage?.total_tokens ?? 0,
        },
        metadata: { model: request.model },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async *stream(request: LlmRequest, signal?: AbortSignal): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (request.timeoutSeconds ?? 60) * 1000);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const response = await fetch(normalizeUrl(request.apiUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.apiKey}`,
          ...request.extraHeaders,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 4000,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => '');
        if (response.status >= 400 && response.status < 500) {
          throw new ProviderClientError(`${response.status}: ${body.slice(0, 200)}`, response.status);
        }
        throw new Error(`Provider error ${response.status}: ${body.slice(0, 200)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            if (payload === '[DONE]') return;

            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const chunk = parsed.choices?.[0]?.delta?.content;
              if (chunk) yield chunk;
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeUrl(url: string): string {
  if (!url) return DEFAULT_API_URL;
  if (url.endsWith('/chat/completions')) return url;
  if (url.endsWith('/v1')) return `${url}/chat/completions`;
  if (url.endsWith('/v1/')) return `${url}chat/completions`;
  return url;
}
