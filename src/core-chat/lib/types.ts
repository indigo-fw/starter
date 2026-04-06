// ─── Message roles ──────────────────────────────────────────────────────────

export const MessageRole = {
  USER: 'user',
  USER_IMG: 'user_img',
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

// ─── Block types (numeric IDs matching flirtcam convention) ─────────────────

export const BlockType = {
  BLOCK_ANONYMOUS: 40,
  BLOCK_UNSUBSCRIBED: 41,
  BLOCK_INSUFFICIENT_TOKENS: 42,
  BLOCK_IMAGE_LIMIT: 43,
  BLOCK_IMAGE_DISABLED: 44,
  BLOCK_ANONYMOUS_SOFT: 45,
  BLOCK_UNSUBSCRIBED_SOFT: 46,
} as const;

// ─── Censored message types ────────────────────────────────────────────────

export const CensorType = {
  CENSORED_TEXT: 30,
  CENSORED_IMAGE: 31,
} as const;

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
  MSG_IMAGE_PROCESSING: 'msg_image_processing',
  MSG_IMAGE_COMPLETE: 'msg_image_complete',
  MSG_VIDEO_PROCESSING: 'msg_video_processing',
  MSG_VIDEO_COMPLETE: 'msg_video_complete',
  BALANCE_UPDATE: 'balance_update',
  CONV_STATUS: 'conv_status',
} as const;

// ─── Response types (from message detection) ────────────────────────────────

export type ResponseType = 'text' | 'image' | 'video';

// ─── Re-export adapter types for convenience ────────────────────────────────

export type { LlmMessage, LlmResponse, ImageResponse, VideoResponse } from './adapters/types';
export type { LlmMessage as ChatAiMessage } from './adapters/types';
