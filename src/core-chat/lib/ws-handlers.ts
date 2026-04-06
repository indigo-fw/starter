/**
 * Chat-specific WebSocket message handlers.
 * Handles typing indicators, presence, and join/leave for conversations.
 */
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('chat-ws');

// ─── Presence tracking ──────────────────────────────────────────────────────

const onlineUsers = new Map<string, { lastSeen: number; status: 'online' | 'away' }>();

export function updatePresence(userId: string, status: 'online' | 'away' | 'offline'): void {
  if (status === 'offline') {
    onlineUsers.delete(userId);
  } else {
    onlineUsers.set(userId, { lastSeen: Date.now(), status });
  }
}

export function isUserOnline(userId: string): boolean {
  const entry = onlineUsers.get(userId);
  if (!entry) return false;
  // Consider stale after 2 minutes
  if (Date.now() - entry.lastSeen > 120_000) {
    onlineUsers.delete(userId);
    return false;
  }
  return true;
}

// ─── Typing indicator relay ─────────────────────────────────────────────────

// Track who's typing in which conversation
const typingUsers = new Map<string, Set<string>>(); // conversationId → Set<userId>

export function setTyping(
  conversationId: string,
  userId: string,
  isTyping: boolean,
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void,
): void {
  if (!typingUsers.has(conversationId)) {
    typingUsers.set(conversationId, new Set());
  }
  const set = typingUsers.get(conversationId)!;

  if (isTyping) {
    set.add(userId);
  } else {
    set.delete(userId);
  }

  // Broadcast to conversation channel
  broadcastEvent(`chat:${conversationId}`, 'user_typing', {
    type: 'user_typing',
    conversationId,
    userId,
    isTyping,
  });
}

// ─── Conversation join/leave tracking ───────────────────────────────────────

const conversationMembers = new Map<string, Set<string>>(); // conversationId → Set<userId>

export function joinConversation(conversationId: string, userId: string): void {
  if (!conversationMembers.has(conversationId)) {
    conversationMembers.set(conversationId, new Set());
  }
  conversationMembers.get(conversationId)!.add(userId);
}

export function leaveConversation(conversationId: string, userId: string): void {
  conversationMembers.get(conversationId)?.delete(userId);
  typingUsers.get(conversationId)?.delete(userId);
}

export function getConversationMembers(conversationId: string): string[] {
  return [...(conversationMembers.get(conversationId) ?? [])];
}

// ─── WS flood protection ───────────────────────────────────────────────────

const wsRateLimits = new Map<string, { count: number; resetAt: number }>();

const WS_MAX_MESSAGES_PER_SECOND = 10;

/**
 * Check if a WS message should be rate-limited.
 * Returns true if the message should be dropped.
 */
export function checkWsFlood(userId: string): boolean {
  const now = Date.now();
  const entry = wsRateLimits.get(userId);

  if (!entry || now > entry.resetAt) {
    wsRateLimits.set(userId, { count: 1, resetAt: now + 1000 });
    return false;
  }

  entry.count++;
  return entry.count > WS_MAX_MESSAGES_PER_SECOND;
}

// Clean up stale entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of wsRateLimits) {
    if (now > entry.resetAt) wsRateLimits.delete(key);
  }
  // Clean up stale presence
  for (const [userId, entry] of onlineUsers) {
    if (now - entry.lastSeen > 120_000) onlineUsers.delete(userId);
  }
}, 30_000);
