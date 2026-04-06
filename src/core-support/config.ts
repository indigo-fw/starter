/**
 * Support chat widget configuration — system prompt, welcome message, escalation settings.
 *
 * Defaults are provided here. Projects override via `setSupportConfig()` at startup.
 * The AI uses an OpenAI-compatible API (same as the editor AI assist).
 * Set AI_API_KEY + optionally AI_API_URL / AI_MODEL in env to enable AI responses.
 * Without AI_API_KEY the widget still works — it just creates tickets immediately.
 */

export interface SupportChatConfig {
  /** Greeting shown when the chat panel opens */
  welcomeMessage: string;

  /** Input placeholder */
  placeholder: string;

  /** Shown to user when chat escalates to a support ticket */
  escalationMessage: string;

  /** System prompt sent to the AI with every request */
  systemPrompt: string;

  /** Maximum messages in a single session before forced escalation */
  maxMessagesBeforeEscalation: number;

  /** AI model to use (falls back to env AI_MODEL, then gpt-4o-mini) */
  model: string | undefined;
}

const defaults: SupportChatConfig = {
  welcomeMessage: 'Hi! 👋 How can I help you today?',
  placeholder: 'Type your message...',
  escalationMessage:
    "I'll connect you with our support team. They'll follow up on your ticket shortly.",
  systemPrompt: `You are a helpful support assistant. Answer questions concisely and friendly.

If you cannot confidently answer a question, or if the user explicitly asks to speak with a human, respond with exactly "[ESCALATE]" at the very start of your message, followed by a brief summary of what the user needs help with.

Do not make up information you are not sure about. When in doubt, escalate to human support.`,
  maxMessagesBeforeEscalation: 20,
  model: undefined,
};

let _config: SupportChatConfig = { ...defaults };

/**
 * Override chat config. Merges with defaults — only provide the fields you want to change.
 * Call once at startup (typically in your support-deps.ts).
 */
export function setSupportConfig(overrides: Partial<SupportChatConfig>): void {
  _config = { ...defaults, ...overrides };
}

/** Get the current (possibly overridden) chat config. */
export const supportChatConfig: SupportChatConfig = new Proxy({} as SupportChatConfig, {
  get(_target, prop: string) {
    return _config[prop as keyof SupportChatConfig];
  },
});
