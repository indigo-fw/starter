import { createLogger } from '@/core/lib/logger';
import type { VideoAdapter, VideoRequest, VideoResponse, AdapterResponse } from './types';
import { ProviderClientError } from './types';

const logger = createLogger('falai-video');

const DEFAULT_MODEL = 'fal-ai/wan-i2v';
const DEFAULT_NEGATIVE_PROMPT = 'low resolution, error, worst quality, low quality, defects';
const POLL_INTERVAL_MS = 3_000;
const INITIAL_WAIT_MS = 20_000;

/**
 * Fal.ai image-to-video adapter.
 * Submits a job, polls for completion, returns video URL.
 */
export class FalAiVideoAdapter implements VideoAdapter {
  async generate(request: VideoRequest): Promise<AdapterResponse<VideoResponse>> {
    const model = request.model ?? (request.config?.model as string) ?? DEFAULT_MODEL;
    const maxTimeMs = (request.timeoutSeconds ?? 600) * 1000;
    const startTime = Date.now();

    // 1. Submit job
    const submitUrl = `https://queue.fal.run/${model}`;

    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${request.apiKey}`,
        ...request.extraHeaders,
      },
      body: JSON.stringify({
        image_url: request.sourceImageUrl,
        prompt: request.prompt ?? 'Generate a video with natural, fluid motion',
        negative_prompt: (request.config?.negativePrompt as string) ?? DEFAULT_NEGATIVE_PROMPT,
        num_frames: durationToFrames(request.duration ?? 5),
        resolution: request.resolution ?? '720p',
        ...(request.config?.extra as Record<string, unknown> ?? {}),
      }),
    });

    if (!submitResponse.ok) {
      const body = await submitResponse.text().catch(() => '');
      if (submitResponse.status >= 400 && submitResponse.status < 500) {
        throw new ProviderClientError(`${submitResponse.status}: ${body.slice(0, 200)}`, submitResponse.status);
      }
      throw new Error(`Fal.ai submit error ${submitResponse.status}: ${body.slice(0, 200)}`);
    }

    const submitData = await submitResponse.json() as {
      request_id: string;
      status_url?: string;
      response_url?: string;
    };

    const requestId = submitData.request_id;
    if (!requestId) {
      throw new Error('No request_id in Fal.ai submit response');
    }

    const statusUrl = submitData.status_url ?? `https://queue.fal.run/${model}/requests/${requestId}/status`;
    const responseUrl = submitData.response_url ?? `https://queue.fal.run/${model}/requests/${requestId}`;

    logger.info('Fal.ai job submitted', { requestId, model });

    // 2. Wait before polling
    await delay(Math.min(INITIAL_WAIT_MS, maxTimeMs / 2));

    // 3. Poll for completion
    while (Date.now() - startTime < maxTimeMs) {
      const statusResponse = await fetch(statusUrl, {
        headers: { Authorization: `Key ${request.apiKey}` },
      });

      if (!statusResponse.ok) {
        logger.warn('Fal.ai status check failed', { status: statusResponse.status });
        await delay(POLL_INTERVAL_MS);
        continue;
      }

      const status = await statusResponse.json() as { status: string };

      if (status.status === 'COMPLETED') {
        // Fetch result
        const resultResponse = await fetch(responseUrl, {
          headers: { Authorization: `Key ${request.apiKey}` },
        });

        if (!resultResponse.ok) {
          throw new Error(`Fal.ai result fetch failed: ${resultResponse.status}`);
        }

        const result = await resultResponse.json() as {
          video?: { url?: string };
          output?: { video?: string };
        };

        const videoUrl = result.video?.url ?? result.output?.video;
        if (!videoUrl) {
          throw new Error('No video URL in Fal.ai result');
        }

        logger.info('Fal.ai video completed', { requestId, elapsed: Date.now() - startTime });

        return {
          result: { url: videoUrl },
          metadata: { requestId, model },
        };
      }

      if (status.status === 'FAILED') {
        throw new Error(`Fal.ai job failed: ${requestId}`);
      }

      // Still processing
      await delay(POLL_INTERVAL_MS);
    }

    throw new Error(`Fal.ai job timed out after ${maxTimeMs / 1000}s: ${requestId}`);
  }
}

function durationToFrames(seconds: number): number {
  return Math.round(seconds * 24); // 24fps
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
