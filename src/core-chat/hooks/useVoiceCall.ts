'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket, useChannel } from '@/core/lib/realtime/ws-client';
import { ChatWsEvent } from '@/core-chat/lib/types';

export type VoiceCallState = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended';

interface UseVoiceCallOptions {
  conversationId: string;
  onAudio?: (audioBase64: string, text?: string) => void;
  onTranscription?: (text: string, isFinal: boolean) => void;
  onCompleted?: (text: string) => void;
  onEnded?: (durationSeconds: number, reason: string) => void;
  onBilling?: (tokenBalance: number) => void;
}

export function useVoiceCall(opts: UseVoiceCallOptions) {
  const { send } = useWebSocket();
  const [state, setState] = useState<VoiceCallState>('idle');
  const [duration, setDuration] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for voice call WS events via existing channel subscription
  useChannel<{ type: string; [key: string]: unknown }>(`chat:${opts.conversationId}`, (event) => {
    switch (event.type) {
      case ChatWsEvent.VOICE_CALL_AUDIO:
        opts.onAudio?.(event.audio as string, event.text as string | undefined);
        break;
      case ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION:
        opts.onTranscription?.(event.text as string, event.isFinal as boolean);
        break;
      case ChatWsEvent.VOICE_CALL_COMPLETED:
        opts.onCompleted?.(event.text as string);
        break;
      case ChatWsEvent.VOICE_CALL_BILLING:
        opts.onBilling?.(event.tokenBalance as number);
        break;
      case ChatWsEvent.VOICE_CALL_ENDED:
        setState('ended');
        opts.onEnded?.(event.durationSeconds as number, event.reason as string);
        cleanup();
        break;
      case ChatWsEvent.VOICE_CALL_FORCE_END:
        setState('ended');
        opts.onEnded?.(0, event.reason as string);
        cleanup();
        break;
    }
  });

  const startCall = useCallback(async () => {
    try {
      setState('connecting');

      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Send start signal via existing WS connection
      send({ type: 'voice_call_start', payload: { conversation_id: opts.conversationId } });
      setState('active');

      setDuration(0);
      durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);

      // Audio capture
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let silenceFrames = 0;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let rms = 0;
        for (let i = 0; i < input.length; i++) rms += input[i]! * input[i]!;
        rms = Math.sqrt(rms / input.length);

        if (rms < 0.01) {
          silenceFrames++;
          if (silenceFrames === 15) {
            send({ type: 'voice_call_audio_chunk', payload: { conversation_id: opts.conversationId, is_final: true } });
            silenceFrames = 0;
          }
        } else {
          silenceFrames = 0;
          const downsampled = downsample(input, audioContext.sampleRate, 16000);
          const int16 = float32ToInt16(downsampled);
          send({
            type: 'voice_call_audio_chunk',
            payload: { conversation_id: opts.conversationId, audio: bufferToBase64(int16), is_final: false },
          });
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      console.error('Failed to start voice call:', err);
      setState('idle');
      cleanup();
    }
  }, [opts.conversationId, send]);

  const endCall = useCallback(() => {
    send({ type: 'voice_call_end', payload: { conversation_id: opts.conversationId } });
    setState('ended');
    cleanup();
  }, [opts.conversationId, send]);

  const interrupt = useCallback(() => {
    send({ type: 'voice_call_interrupt', payload: { conversation_id: opts.conversationId } });
  }, [opts.conversationId, send]);

  function cleanup() {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close().catch(() => {});
    processorRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
  }

  useEffect(() => () => cleanup(), []);

  return { state, duration, startCall, endCall, interrupt };
}

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) result[i] = buffer[Math.round(i * ratio)]!;
  return result;
}

function float32ToInt16(buffer: Float32Array): Int16Array {
  const result = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]!));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return result;
}

function bufferToBase64(buffer: Int16Array): string {
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
