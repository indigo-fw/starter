/**
 * Voice call state machine.
 * Manages per-call lifecycle: IDLE → GREETING → ACTIVE → ENDED.
 */
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatCharacters, type ChatCharacter } from '@/core-chat/schema/characters';
import { chatConversations } from '@/core-chat/schema/conversations';
import { getChatDeps } from '@/core-chat/deps';
import { MessageRole, MessageStatus, ChatWsEvent } from '@/core-chat/lib/types';
import type { ElevenLabsStreamingStt } from '@/core-chat/lib/adapters/elevenlabs-streaming-stt';
import { createCallRecord, deductMinute, finalizeCall } from './billing';
import { runGreetingPipeline, runVoicePipeline } from './orchestrator';

const logger = createLogger('voice-call-handler');

const BILLING_INTERVAL_MS = 60_000; // 1 minute
const IDLE_TIMEOUT_MS = 120_000; // 2 minutes

export type CallState = 'idle' | 'greeting' | 'active' | 'ended';

export interface VoiceCallSession {
  callId: string;
  conversationId: string;
  userId: string;
  organizationId: string;
  characterId: string;
  character: ChatCharacter;
  state: CallState;
  costPerMinute: number;
  startedAt: number;
  billingTimer: ReturnType<typeof setInterval> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  abortController: AbortController;
  audioChunks: Int16Array[];
  streamingStt: ElevenLabsStreamingStt | null;
}

// Active calls by conversationId
const activeCalls = new Map<string, VoiceCallSession>();

/**
 * Start a voice call.
 */
export async function startCall(
  conversationId: string,
  userId: string,
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void,
): Promise<VoiceCallSession | null> {
  if (activeCalls.has(conversationId)) {
    logger.warn('Call already active', { conversationId });
    return null;
  }

  // Load conversation + character
  const [conv] = await db.select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);

  if (!conv || conv.userId !== userId) return null;

  const [character] = await db.select()
    .from(chatCharacters)
    .where(eq(chatCharacters.id, conv.characterId))
    .limit(1);

  if (!character) return null;

  const costPerMinute = 50; // Default — configurable via chat.tokens.voice_call_per_minute option

  // Create billing record
  const callId = await createCallRecord({
    userId,
    conversationId,
    characterId: character.id,
    costPerMinute,
  });

  // Pre-pay first minute
  const deps = getChatDeps();
  try {
    await deps.deductTokens(conv.organizationId, costPerMinute, 'voice_call', { callId });
  } catch {
    logger.warn('Insufficient tokens for voice call', { userId });
    await finalizeCall(callId);
    return null;
  }

  // Insert call start event
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    conversationId,
    role: MessageRole.CALL_START,
    content: '',
    status: MessageStatus.DELIVERED,
  });

  const session: VoiceCallSession = {
    callId,
    conversationId,
    userId,
    organizationId: conv.organizationId,
    characterId: character.id,
    character,
    state: 'greeting',
    costPerMinute,
    startedAt: Date.now(),
    billingTimer: null,
    idleTimer: null,
    abortController: new AbortController(),
    audioChunks: [],
    streamingStt: null,
  };

  // Initialize streaming STT (fire-and-forget, optional — falls back to batch STT)
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (apiKey) {
      const { ElevenLabsStreamingStt } = await import('@/core-chat/lib/adapters/elevenlabs-streaming-stt');
      const stt = new ElevenLabsStreamingStt(apiKey, {
        onPartialTranscript: (text) => {
          broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION, {
            type: ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION, conversationId, text, isFinal: false,
          });
        },
        onFinalTranscript: (text) => {
          broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION, {
            type: ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION, conversationId, text, isFinal: true,
          });
        },
        onError: (err) => logger.warn('Streaming STT error', { err }),
      });
      await stt.connect();
      session.streamingStt = stt;
      logger.info('Streaming STT connected', { conversationId });
    }
  } catch {
    logger.info('Streaming STT not available, using batch STT', { conversationId });
  }

  activeCalls.set(conversationId, session);

  // Run greeting pipeline (async)
  runGreetingPipeline(
    character,
    conversationId,
    (audioBase64, text) => {
      broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_AUDIO, {
        type: ChatWsEvent.VOICE_CALL_AUDIO,
        conversationId,
        audio: audioBase64,
        text,
      });
    },
  ).then(() => {
    session.state = 'active';

    // Start billing timer
    session.billingTimer = setInterval(async () => {
      const balance = await deductMinute(callId, session.organizationId, costPerMinute);
      if (balance < 0) {
        endCall(conversationId, 'insufficient_tokens', broadcastEvent);
      } else {
        broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_BILLING, {
          type: ChatWsEvent.VOICE_CALL_BILLING,
          conversationId,
          tokenBalance: balance,
        });
      }
    }, BILLING_INTERVAL_MS);

    // Start idle timer
    resetIdleTimer(session, broadcastEvent);

    // Notify client
    broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_COMPLETED, {
      type: ChatWsEvent.VOICE_CALL_COMPLETED,
      conversationId,
      text: 'Greeting complete',
    });
  }).catch((err) => {
    logger.error('Greeting pipeline failed', { error: err instanceof Error ? err.message : String(err) });
    endCall(conversationId, 'error', broadcastEvent);
  });

  return session;
}

/**
 * Handle incoming audio chunk from client.
 */
export function handleAudioChunk(
  conversationId: string,
  audio: Int16Array,
  isFinal: boolean,
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void,
): void {
  const session = activeCalls.get(conversationId);
  if (!session || session.state !== 'active') return;

  // Reset idle timer
  resetIdleTimer(session, broadcastEvent);

  // Accumulate audio
  session.audioChunks.push(audio);

  // Feed to streaming STT for real-time captions (if available)
  if (session.streamingStt?.isConnected && audio.length > 0) {
    const bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    session.streamingStt.sendAudioChunk(btoa(binary));
  }
  if (isFinal && session.streamingStt?.isConnected) {
    session.streamingStt.commit();
  }

  if (isFinal && session.audioChunks.length > 0) {
    // Combine all chunks
    const totalLength = session.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of session.audioChunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    session.audioChunks = [];

    // Run voice pipeline (async)
    runVoicePipeline(
      combined,
      conversationId,
      session.character,
      (audioBase64, text) => {
        broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_AUDIO, {
          type: ChatWsEvent.VOICE_CALL_AUDIO,
          conversationId,
          audio: audioBase64,
          text,
        });
      },
      (text, isFinal) => {
        broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION, {
          type: ChatWsEvent.VOICE_CALL_PARTIAL_TRANSCRIPTION,
          conversationId,
          text,
          isFinal,
        });
      },
      session.abortController.signal,
    ).then((result) => {
      if (result) {
        broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_COMPLETED, {
          type: ChatWsEvent.VOICE_CALL_COMPLETED,
          conversationId,
          text: result.text,
        });
      }
    }).catch((err) => {
      if (!session.abortController.signal.aborted) {
        logger.error('Voice pipeline failed', { error: err instanceof Error ? err.message : String(err) });
      }
    });
  }
}

/**
 * Handle barge-in (user started speaking while AI is responding).
 */
export function handleInterrupt(conversationId: string): void {
  const session = activeCalls.get(conversationId);
  if (!session) return;

  // Abort current LLM/TTS
  session.abortController.abort();
  session.abortController = new AbortController();
  session.audioChunks = [];
}

/**
 * End a voice call.
 */
export async function endCall(
  conversationId: string,
  reason: string,
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void,
): Promise<void> {
  const session = activeCalls.get(conversationId);
  if (!session) return;

  session.state = 'ended';

  // Clear timers + streaming STT
  if (session.billingTimer) clearInterval(session.billingTimer);
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.streamingStt?.close();
  session.abortController.abort();

  // Finalize billing
  await finalizeCall(session.callId);

  const durationSeconds = Math.floor((Date.now() - session.startedAt) / 1000);

  // Insert call end event
  await db.insert(chatMessages).values({
    id: crypto.randomUUID(),
    conversationId,
    role: MessageRole.CALL_END,
    content: String(durationSeconds),
    status: MessageStatus.DELIVERED,
  });

  // Notify client
  broadcastEvent(`chat:${conversationId}`, ChatWsEvent.VOICE_CALL_ENDED, {
    type: ChatWsEvent.VOICE_CALL_ENDED,
    conversationId,
    durationSeconds,
    reason,
  });

  activeCalls.delete(conversationId);
  logger.info('Voice call ended', { conversationId, durationSeconds, reason });
}

/**
 * Get active call session for a conversation.
 */
export function getActiveCall(conversationId: string): VoiceCallSession | null {
  return activeCalls.get(conversationId) ?? null;
}

/**
 * Graceful shutdown — finalize all active voice calls.
 * Called during server shutdown to prevent orphaned billing records.
 */
export async function shutdownAllCalls(): Promise<void> {
  const entries = [...activeCalls.entries()];
  if (entries.length === 0) return;

  logger.info('Shutting down active voice calls', { count: entries.length });

  const noopBroadcast = () => {}; // Can't broadcast during shutdown

  await Promise.allSettled(
    entries.map(([convId]) => endCall(convId, 'server_shutdown', noopBroadcast)),
  );

  logger.info('All voice calls finalized');
}

// ─── Internal ───────────────────────────────────────────────────────────────

function resetIdleTimer(
  session: VoiceCallSession,
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void,
): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    logger.info('Voice call idle timeout', { conversationId: session.conversationId });
    endCall(session.conversationId, 'idle_timeout', broadcastEvent);
  }, IDLE_TIMEOUT_MS);
}
