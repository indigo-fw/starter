// ─── Chat module configuration ──────────────────────────────────────────────
// Defaults can be overridden by the project via setChatConfig().

export interface ChatConfig {
  /** Token cost per user message (before character multiplier) */
  tokenCostPerMessage: number;
  /** Max active conversations per user (0 = unlimited) */
  maxConversationsPerUser: number;
  /** Messages per conversation before auto-summarization is triggered */
  summaryThreshold: number;
  /** Max messages to include in LLM context (most recent) */
  contextMessageLimit: number;
  /** Rate limit: max messages per window */
  rateLimitMessages: number;
  /** Rate limit window in seconds */
  rateLimitWindowSeconds: number;
  /** Keyword list for content moderation */
  moderationKeywords: string[];
  /** What to do when moderation triggers: block (reject) or flag (allow but mark) */
  moderationAction: 'block' | 'flag';
  /** Feature key checked against subscription plan */
  featureKey: string;
}

const defaults: ChatConfig = {
  tokenCostPerMessage: 1,
  maxConversationsPerUser: 50,
  summaryThreshold: 100,
  contextMessageLimit: 40,
  rateLimitMessages: 20,
  rateLimitWindowSeconds: 60,
  moderationKeywords: [],
  moderationAction: 'block',
  featureKey: 'aiChat',
};

let _config: ChatConfig = { ...defaults };

export function setChatConfig(overrides: Partial<ChatConfig>): void {
  _config = { ...defaults, ...overrides };
}

export function getChatConfig(): ChatConfig {
  return _config;
}
