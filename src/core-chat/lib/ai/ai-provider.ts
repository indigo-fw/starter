import { ProviderManager } from './provider-manager';
import type { LlmMessage, LlmResponse, AdapterResponse, ImageResponse, VideoResponse } from './adapters/types';

/**
 * Streaming LLM response from DB-configured providers.
 */
export async function* streamAiResponse(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  yield* ProviderManager.streamLlm(messages, opts, signal);
}

/**
 * Non-streaming LLM completion.
 */
export async function completeAi(
  messages: LlmMessage[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<AdapterResponse<LlmResponse>> {
  return ProviderManager.completeLlm(messages, opts);
}

/**
 * Generate an image from a prompt.
 */
export async function generateImage(
  prompt: string,
  opts?: { width?: number; height?: number; negativePrompt?: string },
): Promise<AdapterResponse<ImageResponse>> {
  return ProviderManager.generateImage(prompt, opts);
}

/**
 * Generate a video from a source image.
 */
export async function generateVideo(
  sourceImageUrl: string,
  opts?: { prompt?: string; duration?: number; resolution?: string },
): Promise<AdapterResponse<VideoResponse>> {
  return ProviderManager.generateVideo(sourceImageUrl, opts);
}
