import type { SttAdapter, SttRequest, SttResponse, AdapterResponse } from '../types';

const MOCK_TRANSCRIPTIONS = [
  "Hey, what's up?",
  "Tell me more about yourself.",
  "That sounds interesting!",
  "What do you like to do for fun?",
  "Can you send me a photo?",
];

/**
 * Mock STT adapter for dev. Returns random transcription text.
 */
export class MockSttAdapter implements SttAdapter {
  async transcribe(_request: SttRequest): Promise<AdapterResponse<SttResponse>> {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    const text = MOCK_TRANSCRIPTIONS[Math.floor(Math.random() * MOCK_TRANSCRIPTIONS.length)]!;

    return {
      result: { text, confidence: 0.95 },
      metadata: { model: 'mock-stt' },
    };
  }
}
