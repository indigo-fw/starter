import type { SttAdapter, SttRequest, SttResponse, AdapterResponse } from './types';

const DEFAULT_API_URL = 'https://api.elevenlabs.io/v1';

/**
 * ElevenLabs STT adapter (Scribe v2).
 * Transcribes audio using ElevenLabs Speech-to-Text API.
 */
export class ElevenLabsSttAdapter implements SttAdapter {
  async transcribe(request: SttRequest): Promise<AdapterResponse<SttResponse>> {
    const apiUrl = request.apiUrl ?? DEFAULT_API_URL;

    // Build multipart form data
    const formData = new FormData();
    formData.append('audio', new Blob([new Uint8Array(request.audioBuffer)], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', request.model ?? 'scribe_v2');
    if (request.lang) formData.append('language_code', request.lang);

    const response = await fetch(`${apiUrl}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': request.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ElevenLabs STT error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as {
      text?: string;
      language_code?: string;
      confidence?: number;
    };

    return {
      result: {
        text: data.text?.trim() ?? '',
        confidence: data.confidence,
      },
      metadata: { language: data.language_code },
    };
  }
}
