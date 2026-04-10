'use client';

import { useParams } from 'next/navigation';
import { ChatLayout } from '@/core-chat/components/chat/ChatLayout';
import { ChatErrorBoundary } from '@/core-chat/components/chat/ChatErrorBoundary';

/**
 * /chat/:conversationId — Active conversation view.
 */
export default function ConversationPage() {
  const params = useParams<{ conversationId: string }>();

  return (
    <ChatErrorBoundary>
      <ChatLayout conversationId={params.conversationId} />
    </ChatErrorBoundary>
  );
}
