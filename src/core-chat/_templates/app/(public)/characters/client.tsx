'use client';

import { CharacterBrowsePage } from '@/core-chat/components/CharacterBrowsePage';
import { ChatErrorBoundary } from '@/core-chat/components/ChatErrorBoundary';

export function CharacterBrowsePageClient() {
  return (
    <ChatErrorBoundary>
      <CharacterBrowsePage />
    </ChatErrorBoundary>
  );
}
