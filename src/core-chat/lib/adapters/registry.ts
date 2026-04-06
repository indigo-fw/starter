import type { LlmAdapter, ImageAdapter, VideoAdapter, TtsAdapter, SttAdapter } from './types';

// ─── Adapter factories ──────────────────────────────────────────────────────

type LlmAdapterFactory = () => LlmAdapter;
type ImageAdapterFactory = () => ImageAdapter;
type VideoAdapterFactory = () => VideoAdapter;

const llmAdapters = new Map<string, LlmAdapterFactory>();
const imageAdapters = new Map<string, ImageAdapterFactory>();
const videoAdapters = new Map<string, VideoAdapterFactory>();

// ─── Registration ───────────────────────────────────────────────────────────

export function registerLlmAdapter(name: string, factory: LlmAdapterFactory): void {
  llmAdapters.set(name, factory);
}

export function registerImageAdapter(name: string, factory: ImageAdapterFactory): void {
  imageAdapters.set(name, factory);
}

export function registerVideoAdapter(name: string, factory: VideoAdapterFactory): void {
  videoAdapters.set(name, factory);
}

// ─── Lookup ─────────────────────────────────────────────────────────────────

export function getLlmAdapter(name: string): LlmAdapter {
  const factory = llmAdapters.get(name);
  if (!factory) throw new Error(`Unknown LLM adapter: ${name}. Available: ${[...llmAdapters.keys()].join(', ')}`);
  return factory();
}

export function getImageAdapter(name: string): ImageAdapter {
  const factory = imageAdapters.get(name);
  if (!factory) throw new Error(`Unknown image adapter: ${name}. Available: ${[...imageAdapters.keys()].join(', ')}`);
  return factory();
}

export function getVideoAdapter(name: string): VideoAdapter {
  const factory = videoAdapters.get(name);
  if (!factory) throw new Error(`Unknown video adapter: ${name}. Available: ${[...videoAdapters.keys()].join(', ')}`);
  return factory();
}

// ─── TTS / STT registries ───────────────────────────────────────────────────

type TtsAdapterFactory = () => TtsAdapter;
type SttAdapterFactory = () => SttAdapter;

const ttsAdapters = new Map<string, TtsAdapterFactory>();
const sttAdapters = new Map<string, SttAdapterFactory>();

export function registerTtsAdapter(name: string, factory: TtsAdapterFactory): void { ttsAdapters.set(name, factory); }
export function registerSttAdapter(name: string, factory: SttAdapterFactory): void { sttAdapters.set(name, factory); }

export function getTtsAdapter(name: string): TtsAdapter {
  const factory = ttsAdapters.get(name);
  if (!factory) throw new Error(`Unknown TTS adapter: ${name}. Available: ${[...ttsAdapters.keys()].join(', ')}`);
  return factory();
}

export function getSttAdapter(name: string): SttAdapter {
  const factory = sttAdapters.get(name);
  if (!factory) throw new Error(`Unknown STT adapter: ${name}. Available: ${[...sttAdapters.keys()].join(', ')}`);
  return factory();
}

// ─── Register built-in adapters ─────────────────────────────────────────────

import { OpenAiLlmAdapter } from './openai-llm';
import { OpenAiImageAdapter } from './openai-image';
import { FalAiVideoAdapter } from './falai-video';
import { ElevenLabsTtsAdapter } from './elevenlabs-tts';
import { ElevenLabsSttAdapter } from './elevenlabs-stt';
import { MockLlmAdapter } from './mock/mock-llm';
import { MockImageAdapter } from './mock/mock-image';
import { MockVideoAdapter } from './mock/mock-video';
import { MockTtsAdapter } from './mock/mock-tts';
import { MockSttAdapter } from './mock/mock-stt';

// Real adapters
registerLlmAdapter('openai', () => new OpenAiLlmAdapter());
registerImageAdapter('openai', () => new OpenAiImageAdapter());
registerImageAdapter('dall-e', () => new OpenAiImageAdapter());
registerVideoAdapter('falai', () => new FalAiVideoAdapter());
registerTtsAdapter('elevenlabs', () => new ElevenLabsTtsAdapter());
registerSttAdapter('elevenlabs', () => new ElevenLabsSttAdapter());

// Mock adapters
registerLlmAdapter('mock', () => new MockLlmAdapter());
registerImageAdapter('mock', () => new MockImageAdapter());
registerVideoAdapter('mock', () => new MockVideoAdapter());
registerTtsAdapter('mock', () => new MockTtsAdapter());
registerSttAdapter('mock', () => new MockSttAdapter());
