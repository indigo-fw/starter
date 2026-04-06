import { createLogger } from '@/core/lib/logger';

const logger = createLogger('chat-openai-adapter');

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  extraHeaders?: Record<string, string>;
}

export interface LlmResponse {
  text: string;
  tokenCount: number;
}

/**
 * Error thrown for 4xx responses (bad input). Provider should NOT be
 * put on cooldown — the error is the caller's fault, not the provider's.
 */
export class ProviderClientError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ProviderClientError';
  }
}

// ─── OpenAI-Compatible Adapter ──────────────────────────────────────────────

/**
 * Adapter for OpenAI-compatible chat completion APIs.
 * Works with OpenAI, Anthropic (via proxy), Ollama, vLLM, etc.
 */
export class OpenAiAdapter {
  /** Non-streaming completion */
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      (request.timeoutSeconds ?? 30) * 1000,
    );

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
        text: data.choices?.[0]?.message?.content?.trim() ?? '',
        tokenCount: data.usage?.total_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Streaming completion via SSE */
  async *stream(request: LlmRequest, signal?: AbortSignal): AsyncGenerator<string> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      (request.timeoutSeconds ?? 60) * 1000,
    );

    // Combine user signal with timeout
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

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

/** Normalize API URL to end with /chat/completions */
function normalizeUrl(url: string): string {
  if (!url) return DEFAULT_API_URL;
  if (url.endsWith('/chat/completions')) return url;
  if (url.endsWith('/v1')) return `${url}/chat/completions`;
  if (url.endsWith('/v1/')) return `${url}chat/completions`;
  return url;
}
