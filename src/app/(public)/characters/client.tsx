'use client';

import { CharacterBrowsePage } from '@/core-chat/components/character/CharacterBrowsePage';
import { ChatErrorBoundary } from '@/core-chat/components/chat/ChatErrorBoundary';

export function CharacterBrowsePageClient() {
  return (
    <ChatErrorBoundary>
      <CharacterBrowsePage />
    </ChatErrorBoundary>
  );
}
