import { getChatDeps } from '@/core-chat/deps';
import { BlockType } from './types';
import type { ResponseType } from './types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BlockingResult {
  blocked: boolean;
  blockType?: number;
  blockResetAt?: number;
  tokenCost?: number;
}

// ─── Token costs (read from config, can be overridden via options) ───────────

const DEFAULT_COSTS: Record<ResponseType, number> = {
  text: 1,
  image: 10,
  video: 40,
};

function getTokenCost(responseType: ResponseType): number {
  return DEFAULT_COSTS[responseType] ?? 1;
}

// ─── Block checking ─────────────────────────────────────────────────────────

/**
 * Check if a user is blocked from sending messages.
 * Called on conversation load (pre-check) and before message dispatch.
 *
 * Checks:
 * 1. Token balance vs cost
 * 2. (Future: anonymous rate limits, registered time-window limits)
 */
export async function checkBlocking(
  userId: string,
  conversationId: string,
  responseType: ResponseType,
  organizationId: string,
): Promise<BlockingResult> {
  const deps = getChatDeps();
  const cost = getTokenCost(responseType);

  // Check token balance
  try {
    const balance = await deps.getTokenBalance(organizationId);
    if (balance < cost) {
      return {
        blocked: true,
        blockType: BlockType.BLOCK_INSUFFICIENT_TOKENS,
        tokenCost: cost,
      };
    }
  } catch {
    // If balance check fails, allow (fail-open)
  }

  return { blocked: false, tokenCost: cost };
}
