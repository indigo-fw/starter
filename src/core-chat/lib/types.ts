// ─── Message roles ──────────────────────────────────────────────────────────

export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

// ─── Message statuses ───────────────────────────────────────────────────────

export const MessageStatus = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  STREAMING: 'streaming',
  MODERATED: 'moderated',
  FAILED: 'failed',
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

// ─── Conversation statuses ──────────────────────────────────────────────────

export const ConversationStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

// ─── WebSocket event types ──────────────────────────────────────────────────

export const ChatWsEvent = {
  MSG_CONFIRMED: 'msg_confirmed',
  MSG_STATUS: 'msg_status',
  MSG_STREAM_START: 'msg_stream_start',
  MSG_STREAM_CHUNK: 'msg_stream_chunk',
  MSG_STREAM_END: 'msg_stream_end',
  CONV_STATUS: 'conv_status',
} as const;

// ─── AI provider types ──────────────────────────────────────────────────────

export interface ChatAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatAiCompletionResult {
  text: string;
  tokenCount: number;
}

export interface ChatAiStreamChunk {
  chunk: string;
  done: boolean;
  tokenCount?: number;
}

export interface ChatAiProvider {
  complete(
    messages: ChatAiMessage[],
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<ChatAiCompletionResult | null>;

  stream(
    messages: ChatAiMessage[],
    opts?: { temperature?: number; maxTokens?: number },
  ): AsyncGenerator<ChatAiStreamChunk>;
}

export interface ChatAiConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}
