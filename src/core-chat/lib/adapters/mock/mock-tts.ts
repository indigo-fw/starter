import type { TtsAdapter, TtsRequest, TtsResponse, AdapterResponse } from '../types';

/**
 * Mock TTS adapter for dev. Returns a short silence buffer.
 */
export class MockTtsAdapter implements TtsAdapter {
  async synthesize(request: TtsRequest): Promise<AdapterResponse<TtsResponse>> {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));

    // Generate 1 second of silence at 24kHz Int16LE (48000 bytes)
    const silence = Buffer.alloc(48000);
    const audioBase64 = silence.toString('base64');

    return {
      result: { audioBase64 },
      metadata: { model: 'mock-tts', text: request.text.slice(0, 50) },
    };
  }
}
