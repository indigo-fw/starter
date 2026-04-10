import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('ai-writer');

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AiContentPart[];
}

export interface AiContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'low' | 'high' | 'auto' };
}

export interface AiCallOptions {
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Override model for this specific call (e.g. vision model) */
  model?: string;
}

/**
 * Call the AI provider with arbitrary messages.
 * Uses the same OpenAI-compatible API as the editor AI assist.
 * Returns null if AI is not configured.
 */
export async function callAi(options: AiCallOptions): Promise<string | null> {
  const { env } = await import('@/lib/env');
  if (!env.AI_API_KEY) return null;

  const apiUrl = env.AI_API_URL ?? DEFAULT_API_URL;
  const model = options.model ?? env.AI_MODEL ?? DEFAULT_MODEL;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'Unknown error');
      logger.error('AI API error', { status: String(response.status), body: errBody });
      return null;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error('AI call failed', { error: String(err) });
    return null;
  }
}
