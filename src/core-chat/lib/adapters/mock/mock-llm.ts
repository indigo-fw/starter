import type { LlmAdapter, LlmRequest, LlmResponse, AdapterResponse } from '../types';

const MOCK_RESPONSES = [
  "That's a really interesting thought! Let me think about it...\n\nI think the key insight here is that every challenge is also an opportunity in disguise. What matters most is how you approach it.",
  "Great question! Here's my take:\n\nThere are usually multiple ways to look at something like this. The first perspective might be the most obvious, but the second one is often more revealing.",
  "I appreciate you sharing that with me. It sounds like you've been thinking about this for a while.\n\nFrom what you've described, I'd suggest starting small and building up gradually. That approach tends to work best.",
  "Oh, that reminds me of something fascinating! Did you know that the most creative solutions often come from combining ideas that seem completely unrelated?\n\nTell me more about what sparked this question.",
  "You know what? I think you might already have the answer — you just need to trust your instincts a bit more.\n\nBut let me offer a different angle to consider...",
];

/**
 * Mock LLM adapter for local development.
 * Returns random pre-written responses with a realistic delay.
 */
export class MockLlmAdapter implements LlmAdapter {
  async complete(request: LlmRequest): Promise<AdapterResponse<LlmResponse>> {
    await delay(500 + Math.random() * 500);
    const text = pickRandom(MOCK_RESPONSES);

    return {
      result: { text, tokenCount: Math.floor(text.length / 4) },
      metadata: { model: 'mock-llm' },
    };
  }

  async *stream(request: LlmRequest): AsyncGenerator<string> {
    const text = pickRandom(MOCK_RESPONSES);
    const words = text.split(' ');

    for (const word of words) {
      await delay(30 + Math.random() * 60);
      yield word + ' ';
    }
  }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
