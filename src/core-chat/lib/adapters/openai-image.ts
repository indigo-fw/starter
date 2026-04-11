import { createLogger } from '@/core/lib/infra/logger';
import type { ImageAdapter, ImageRequest, ImageResponse, AdapterResponse } from './types';
import { ProviderClientError } from './types';

const _logger = createLogger('openai-image');
const DEFAULT_API_URL = 'https://api.openai.com/v1/images/generations';

/**
 * OpenAI DALL-E compatible image generation adapter.
 * Works with OpenAI DALL-E 3, DALL-E 2, and compatible APIs.
 */
export class OpenAiImageAdapter implements ImageAdapter {
  async generate(request: ImageRequest): Promise<AdapterResponse<ImageResponse>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (request.timeoutSeconds ?? 60) * 1000);

    const apiUrl = request.apiUrl.endsWith('/images/generations')
      ? request.apiUrl
      : request.apiUrl.endsWith('/v1')
        ? `${request.apiUrl}/images/generations`
        : request.apiUrl.endsWith('/v1/')
          ? `${request.apiUrl}images/generations`
          : request.apiUrl || DEFAULT_API_URL;

    const model = request.model ?? 'dall-e-3';
    const size = resolveSize(request.width, request.height, model);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${request.apiKey}`,
          ...request.extraHeaders,
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          n: 1,
          size,
          response_format: 'url',
          ...(model === 'dall-e-3' ? { quality: (request.config?.quality as string) ?? 'standard' } : {}),
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
        data?: Array<{ url?: string; revised_prompt?: string }>;
      };

      const imageUrl = data.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

      const [w, h] = size.split('x').map(Number);

      return {
        result: {
          url: imageUrl,
          width: w ?? 1024,
          height: h ?? 1024,
        },
        metadata: {
          model,
          size,
          revisedPrompt: data.data?.[0]?.revised_prompt,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Resolve DALL-E size string from width/height. DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792 */
function resolveSize(width?: number, height?: number, model?: string): string {
  if (model === 'dall-e-3') {
    if (width && height) {
      if (width > height) return '1792x1024';
      if (height > width) return '1024x1792';
    }
    return '1024x1024';
  }
  // DALL-E 2: 256x256, 512x512, 1024x1024
  return '1024x1024';
}
