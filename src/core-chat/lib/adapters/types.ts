// ─── Provider types ─────────────────────────────────────────────────────────

export const ProviderType = {
  LLM: 'llm',
  IMAGE: 'image',
  VIDEO: 'video',
  TTS: 'tts',
  STT: 'stt',
} as const;
export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

// ─── Shared response wrapper ────────────────────────────────────────────────

export interface AdapterResponse<T> {
  result: T;
  metadata: Record<string, unknown>;
}

// ─── LLM types ──────────────────────────────────────────────────────────────

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutSeconds?: number;
  extraHeaders?: Record<string, string>;
}

export interface LlmResponse {
  text: string;
  tokenCount: number;
}

export interface LlmAdapter {
  complete(request: LlmRequest): Promise<AdapterResponse<LlmResponse>>;
  stream(request: LlmRequest, signal?: AbortSignal): AsyncGenerator<string>;
}

// ─── Image types ────────────────────────────────────────────────────────────

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  apiUrl: string;
  apiKey: string;
  model?: string;
  config?: Record<string, unknown>;
  timeoutSeconds?: number;
  extraHeaders?: Record<string, string>;
}

export interface ImageResponse {
  /** URL of the generated image (remote or local storage path) */
  url: string;
  /** Raw image buffer (if available) */
  buffer?: Buffer;
  width: number;
  height: number;
  seed?: number;
}

export interface ImageAdapter {
  generate(request: ImageRequest): Promise<AdapterResponse<ImageResponse>>;
}

// ─── Video types ────────────────────────────────────────────────────────────

export interface VideoRequest {
  /** URL of the source image to animate */
  sourceImageUrl: string;
  prompt?: string;
  duration?: number;
  resolution?: string;
  apiUrl: string;
  apiKey: string;
  model?: string;
  config?: Record<string, unknown>;
  timeoutSeconds?: number;
  extraHeaders?: Record<string, string>;
}

export interface VideoResponse {
  /** URL of the generated video */
  url: string;
}

export interface VideoAdapter {
  generate(request: VideoRequest): Promise<AdapterResponse<VideoResponse>>;
}

// ─── TTS types ──────────────────────────────────────────────────────────────

export interface TtsRequest {
  text: string;
  voiceId: string;
  apiUrl?: string;
  apiKey: string;
  model?: string;
  config?: Record<string, unknown>;
}

export interface TtsResponse {
  /** Base64-encoded PCM audio (24kHz, Int16LE) */
  audioBase64: string;
}

export interface TtsAdapter {
  synthesize(request: TtsRequest): Promise<AdapterResponse<TtsResponse>>;
}

// ─── STT types ──────────────────────────────────────────────────────────────

export interface SttRequest {
  /** WAV audio buffer (16kHz, Int16LE) */
  audioBuffer: Buffer;
  apiUrl?: string;
  apiKey: string;
  model?: string;
  lang?: string;
  config?: Record<string, unknown>;
}

export interface SttResponse {
  text: string;
  confidence?: number;
}

export interface SttAdapter {
  transcribe(request: SttRequest): Promise<AdapterResponse<SttResponse>>;
}

// ─── Client error (4xx — no cooldown, no retry) ────────────────────────────

export class ProviderClientError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ProviderClientError';
  }
}
