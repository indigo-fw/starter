import { eq, sql } from 'drizzle-orm';
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';
import { chatVoiceCalls } from '@/core-chat/schema/voice-calls';
import { getChatDeps } from '@/core-chat/deps';

const logger = createLogger('voice-billing');

/**
 * Deduct one minute of voice call tokens.
 * Returns the new balance, or -1 if insufficient.
 */
export async function deductMinute(
  callId: string,
  organizationId: string,
  costPerMinute: number,
): Promise<number> {
  const deps = getChatDeps();

  try {
    const newBalance = await deps.deductTokens(organizationId, costPerMinute, 'voice_call', {
      callId,
    });

    // Update call record
    await db.update(chatVoiceCalls).set({
      minutesBilled: sql`${chatVoiceCalls.minutesBilled} + 1`,
      tokensCharged: sql`${chatVoiceCalls.tokensCharged} + ${costPerMinute}`,
    }).where(eq(chatVoiceCalls.id, callId));

    return newBalance;
  } catch {
    logger.warn('Voice call billing failed (insufficient tokens)', { callId });
    return -1;
  }
}

/**
 * Finalize a voice call — mark as charged, set end time.
 */
export async function finalizeCall(callId: string): Promise<void> {
  await db.update(chatVoiceCalls).set({
    endedAt: new Date(),
    charged: true,
  }).where(eq(chatVoiceCalls.id, callId));
}

/**
 * Create a voice call record.
 */
export async function createCallRecord(params: {
  userId: string;
  conversationId: string;
  characterId: string;
  costPerMinute: number;
}): Promise<string> {
  const [record] = await db.insert(chatVoiceCalls).values({
    userId: params.userId,
    conversationId: params.conversationId,
    characterId: params.characterId,
    costPerMinute: params.costPerMinute,
  }).returning({ id: chatVoiceCalls.id });

  return record!.id;
}
