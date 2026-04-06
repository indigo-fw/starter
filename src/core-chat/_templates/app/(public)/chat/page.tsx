'use client';

import { ChatLayout } from '@/core-chat/components/ChatLayout';
import { ChatErrorBoundary } from '@/core-chat/components/ChatErrorBoundary';

/**
 * /chat — Landing page (no conversation selected).
 * Shows conversation list + "start new chat" prompt.
 */
export default function ChatPage() {
  return (
    <ChatErrorBoundary>
      <ChatLayout />
    </ChatErrorBoundary>
  );
}
