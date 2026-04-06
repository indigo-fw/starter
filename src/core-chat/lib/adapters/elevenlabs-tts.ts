import { createLogger } from '@/core/lib/logger';
import type { TtsAdapter, TtsRequest, TtsResponse, AdapterResponse } from './types';

const logger = createLogger('elevenlabs-tts');

const DEFAULT_API_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_flash_v2_5';

/**
 * ElevenLabs TTS adapter.
 * Converts text to speech using ElevenLabs API.
 * Returns base64 PCM audio.
 */
export class ElevenLabsTtsAdapter implements TtsAdapter {
  async synthesize(request: TtsRequest): Promise<AdapterResponse<TtsResponse>> {
    const apiUrl = request.apiUrl ?? DEFAULT_API_URL;
    const model = request.model ?? DEFAULT_MODEL;

    const response = await fetch(
      `${apiUrl}/text-to-speech/${request.voiceId}?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': request.apiKey,
        },
        body: JSON.stringify({
          text: request.text,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            ...(request.config?.voiceSettings as Record<string, unknown> ?? {}),
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ElevenLabs TTS error ${response.status}: ${body.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioBase64 = buffer.toString('base64');

    return {
      result: { audioBase64 },
      metadata: { model, voiceId: request.voiceId, bytes: buffer.length },
    };
  }
}
