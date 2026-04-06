import type { LlmAdapter, ImageAdapter, VideoAdapter } from './types';

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

// ─── Register built-in adapters ─────────────────────────────────────────────

import { OpenAiLlmAdapter } from './openai-llm';
import { OpenAiImageAdapter } from './openai-image';
import { FalAiVideoAdapter } from './falai-video';
import { MockLlmAdapter } from './mock/mock-llm';
import { MockImageAdapter } from './mock/mock-image';
import { MockVideoAdapter } from './mock/mock-video';

// Real adapters
registerLlmAdapter('openai', () => new OpenAiLlmAdapter());
registerImageAdapter('openai', () => new OpenAiImageAdapter());
registerImageAdapter('dall-e', () => new OpenAiImageAdapter());
registerVideoAdapter('falai', () => new FalAiVideoAdapter());

// Mock adapters
registerLlmAdapter('mock', () => new MockLlmAdapter());
registerImageAdapter('mock', () => new MockImageAdapter());
registerVideoAdapter('mock', () => new MockVideoAdapter());
