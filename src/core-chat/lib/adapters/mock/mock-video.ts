import type { VideoAdapter, VideoRequest, VideoResponse, AdapterResponse } from '../types';

/**
 * Mock video adapter for local development.
 * Returns a placeholder URL after a realistic delay.
 * In a real dev environment, you'd serve a static test video at this path.
 */
export class MockVideoAdapter implements VideoAdapter {
  async generate(request: VideoRequest): Promise<AdapterResponse<VideoResponse>> {
    // Simulate processing time (video gen is slow)
    await delay(3000 + Math.random() * 5000);

    return {
      result: {
        // Placeholder — in dev, place a test.mp4 in public/ or use a remote sample
        url: '/mock-video-placeholder.mp4',
      },
      metadata: {
        model: 'mock-video',
        duration: request.duration ?? 5,
        sourceImage: request.sourceImageUrl.slice(0, 50),
      },
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
