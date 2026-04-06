import type { ModerationResult } from './lib/moderation';

// ─── Dependency injection interface ─────────────────────────────────────────
// Project wires these at startup via setChatDeps() in config/chat-deps.ts.

export interface ChatDeps {
  /** Resolve active org for a user (for billing) */
  resolveOrgId(activeOrgId: string | null, userId: string): Promise<string>;

  /** Atomic token deduction. Returns new balance. Throws on insufficient. */
  deductTokens(
    orgId: string,
    amount: number,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<number>;

  /** Add tokens (for refunds on AI failure). Returns new balance. */
  addTokens(
    orgId: string,
    amount: number,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<number>;

  /** Read-only balance check (pre-flight) */
  getTokenBalance(orgId: string): Promise<number>;

  /** Throw FORBIDDEN if feature not available on org's plan */
  requireFeature(orgId: string, feature: string): Promise<void>;

  /** Broadcast a WS event to a channel */
  broadcastEvent(channel: string, type: string, payload: Record<string, unknown>): void;

  /** Send a WS event to a specific user */
  sendToUser(userId: string, type: string, payload: Record<string, unknown>): void;

  /** Fire-and-forget notification */
  sendNotification(params: {
    userId: string;
    title: string;
    body: string;
    actionUrl?: string;
  }): void;

  /** Optional external moderation (e.g. OpenAI moderation API) */
  externalModerate?(
    content: string,
    userId: string,
  ): Promise<ModerationResult | null>;
}

let _deps: ChatDeps | null = null;

export function setChatDeps(deps: ChatDeps): void {
  _deps = deps;
}

export function getChatDeps(): ChatDeps {
  if (!_deps) {
    throw new Error(
      'Chat dependencies not configured. Call setChatDeps() at startup — see config/chat-deps.ts',
    );
  }
  return _deps;
}
