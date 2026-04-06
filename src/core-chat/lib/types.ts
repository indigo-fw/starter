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

// ─── Re-export adapter types for convenience ────────────────────────────────

export type { LlmMessage, LlmResponse, ImageResponse, VideoResponse } from './adapters/types';
export type { LlmMessage as ChatAiMessage } from './adapters/types';
