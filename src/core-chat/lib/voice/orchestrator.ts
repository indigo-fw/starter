/**
 * Voice call orchestrator — STT → LLM → TTS pipeline.
 */
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { ProviderManager } from '@/core-chat/lib/ai/provider-manager';
import { buildContext } from '@/core-chat/lib/ai/context-builder';
import { getGreeting } from '@/core-chat/lib/ai/greetings';
import { splitSentences } from './sentence-splitter';
import { createWavBuffer } from './audio-utils';
import { MessageRole, MessageStatus } from '@/core-chat/lib/types';
import type { ChatCharacter } from '@/core-chat/schema/characters';

const logger = createLogger('voice-orchestrator');

export interface VoicePipelineResult {
  text: string;
  messageId: string;
}

/**
 * Run the greeting pipeline — generate character's first voice message.
 */
export async function runGreetingPipeline(
  character: ChatCharacter,
  conversationId: string,
  broadcastAudio: (audioBase64: string, text?: string) => void,
): Promise<string> {
  const greeting = getGreeting(character.personalityId, null, character.greeting);

  // Synthesize greeting via TTS
  try {
    const ttsResult = await ProviderManager.synthesizeSpeech(greeting);
    broadcastAudio(ttsResult.result.audioBase64, greeting);
  } catch (err) {
    logger.error('Greeting TTS failed', { error: err instanceof Error ? err.message : String(err) });
  }

  return greeting;
}

/**
 * Run the full voice pipeline: STT → save message → LLM → TTS stream.
 */
export async function runVoicePipeline(
  audioChunks: Int16Array,
  conversationId: string,
  character: ChatCharacter,
  broadcastAudio: (audioBase64: string, text?: string) => void,
  broadcastTranscription: (text: string, isFinal: boolean) => void,
  signal?: AbortSignal,
): Promise<VoicePipelineResult | null> {
  // 1. STT: convert audio to text
  const wavBuffer = createWavBuffer(audioChunks, 16000);
  let transcription: string;

  try {
    const sttResult = await ProviderManager.transcribeAudio(wavBuffer);
    transcription = sttResult.result.text;
  } catch (err) {
    logger.error('STT failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  if (!transcription.trim()) {
    logger.info('Empty transcription, skipping');
    return null;
  }

  broadcastTranscription(transcription, true);

  // 2. Save user voice message
  const userMsgId = crypto.randomUUID();
  await db.insert(chatMessages).values({
    id: userMsgId,
    conversationId,
    role: MessageRole.USER_VOICE,
    content: transcription,
    status: MessageStatus.DELIVERED,
  });

  // 3. LLM: generate response
  const context = await buildContext(conversationId, character, 20, {
    conversationOverrides: undefined,
  });

  let fullResponse = '';
  const sentenceBuffer: string[] = [];

  try {
    for await (const chunk of ProviderManager.streamLlm(context, { maxTokens: 200 }, signal)) {
      if (signal?.aborted) break;
      fullResponse += chunk;

      // Split into sentences for TTS streaming
      const { sentences, remainder: _remainder } = splitSentences(fullResponse);

      // Synthesize new complete sentences
      for (let i = sentenceBuffer.length; i < sentences.length; i++) {
        const sentence = sentences[i]!;
        sentenceBuffer.push(sentence);

        try {
          const ttsResult = await ProviderManager.synthesizeSpeech(sentence);
          broadcastAudio(ttsResult.result.audioBase64, sentence);
        } catch (err) {
          logger.error('TTS streaming failed for sentence', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Handle remainder (last partial sentence)
    const remainder = fullResponse.slice(sentenceBuffer.join(' ').length).trim();
    if (remainder) {
      try {
        const ttsResult = await ProviderManager.synthesizeSpeech(remainder);
        broadcastAudio(ttsResult.result.audioBase64, remainder);
      } catch {
        // TTS failed for remainder
      }
    }
  } catch (err) {
    if (!signal?.aborted) {
      logger.error('LLM stream failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!fullResponse.trim()) return null;

  // 4. Save AI voice message
  const aiMsgId = crypto.randomUUID();
  await db.insert(chatMessages).values({
    id: aiMsgId,
    conversationId,
    role: MessageRole.ASSISTANT_VOICE,
    content: fullResponse,
    status: MessageStatus.DELIVERED,
  });

  return { text: fullResponse, messageId: aiMsgId };
}
