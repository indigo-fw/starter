import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('elevenlabs-streaming-stt');

/**
 * ElevenLabs Scribe Realtime — WebSocket-based streaming STT.
 * Sends audio chunks in real-time, receives partial + final transcriptions.
 */
export interface StreamingSttCallbacks {
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onError: (error: string) => void;
}

export class ElevenLabsStreamingStt {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private model: string;
  private callbacks: StreamingSttCallbacks;
  private closed = false;

  constructor(
    apiKey: string,
    callbacks: StreamingSttCallbacks,
    model: string = 'scribe_v2',
  ) {
    this.apiKey = apiKey;
    this.callbacks = callbacks;
    this.model = model;
  }

  /** Connect to the streaming STT WebSocket */
  async connect(): Promise<void> {
    const url = `wss://api.elevenlabs.io/v1/speech-to-text/stream?model=${this.model}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // Send auth + config
        this.ws!.send(JSON.stringify({
          type: 'config',
          api_key: this.apiKey,
          language_code: 'en',
          encoding: 'pcm_16000',
        }));
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            message_type?: string;
            text?: string;
            error?: string;
          };

          if (msg.message_type === 'partial_transcript' && msg.text) {
            this.callbacks.onPartialTranscript(msg.text);
          } else if (msg.message_type === 'committed_transcript' && msg.text) {
            this.callbacks.onFinalTranscript(msg.text);
          } else if (msg.error) {
            this.callbacks.onError(msg.error);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onerror = () => {
        if (!this.closed) {
          this.callbacks.onError('WebSocket connection error');
          reject(new Error('STT WebSocket connection failed'));
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  /** Send an audio chunk (base64-encoded PCM 16kHz Int16LE) */
  sendAudioChunk(audioBase64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: audioBase64,
    }));
  }

  /** Commit the current audio — triggers final transcription */
  commit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: '',
      commit: true,
    }));
  }

  /** Close the connection */
  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
