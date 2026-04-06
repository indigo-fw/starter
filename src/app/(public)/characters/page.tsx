'use client';

import { CharacterBrowsePage } from '@/core-chat/components/CharacterBrowsePage';
import { ChatErrorBoundary } from '@/core-chat/components/ChatErrorBoundary';

/**
 * /characters — Browse AI characters with filters and pagination.
 */
export default function CharactersPage() {
  return (
    <ChatErrorBoundary>
      <CharacterBrowsePage />
    </ChatErrorBoundary>
  );
}
