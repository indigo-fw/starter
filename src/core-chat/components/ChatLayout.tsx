'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { ChatNav } from './ChatNav';
import { ConversationList } from './ConversationList';
import { ChatPanel } from './ChatPanel';
import { CharacterCard } from './CharacterCard';
import { CharacterPicker } from './CharacterPicker';
import { Loader2, Menu, X, User as UserIcon } from 'lucide-react';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface ChatLayoutProps {
  conversationId?: string;
}

export function ChatLayout({ conversationId }: ChatLayoutProps) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const [showNewChat, setShowNewChat] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCharInfo, setShowCharInfo] = useState(false);

  // Fetch conversation data if we have an ID
  const { data: conversation, isLoading } = trpc.conversations.get.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId },
  );

  const createConversation = trpc.conversations.create.useMutation();
  const utils = trpc.useUtils();

  const handleSelectConversation = useCallback((id: string) => {
    router.push(`/chat/${id}`);
    setShowSidebar(false);
  }, [router]);

  const handleNewChat = useCallback(() => {
    setShowNewChat(true);
  }, []);

  const handlePickCharacter = useCallback((characterId: string) => {
    createConversation.mutate({ characterId }, {
      onSuccess: (result) => {
        setShowNewChat(false);
        utils.conversations.list.invalidate();
        router.push(`/chat/${result.id}`);
      },
    });
  }, [createConversation, router, utils]);

  return (
    <div className="flex h-screen bg-(--surface-primary)">
      {/* Main app nav rail (desktop only) */}
      <ChatNav />

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="xl:hidden fixed top-3 left-3 z-50 rounded-lg p-2 bg-(--surface-secondary) text-(--text-secondary) shadow-sm"
      >
        {showSidebar ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Conversation list sidebar */}
      <div className={cn(
        'w-[280px] shrink-0 h-full',
        'max-xl:fixed max-xl:left-0 max-xl:top-0 max-xl:z-40 max-xl:shadow-lg',
        'max-xl:transition-transform max-xl:duration-200',
        showSidebar ? 'max-xl:translate-x-0' : 'max-xl:-translate-x-full',
      )}>
        <ConversationList
          activeConversationId={conversationId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Overlay for mobile sidebar */}
      {showSidebar && (
        <div
          className="xl:hidden fixed inset-0 bg-black/30 z-30"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        {conversation && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-(--border-primary)">
            <div className="flex items-center gap-3 ml-10 xl:ml-0">
              <div className="w-8 h-8 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
                {conversation.character.avatarUrl ? (
                  <img
                    src={conversation.character.avatarUrl}
                    alt={conversation.character.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-medium text-(--text-secondary)">
                    {conversation.character.name[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-sm font-semibold text-(--text-primary)">
                  {conversation.title ?? conversation.character.name}
                </h1>
                <p className="text-[11px] text-(--text-tertiary)">
                  {conversation.character.tagline}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCharInfo(!showCharInfo)}
              className="2xl:hidden rounded-lg p-1.5 text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors"
            >
              <UserIcon size={18} />
            </button>
          </div>
        )}

        {/* Chat content */}
        {!conversationId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-(--text-primary) mb-2">{__('Welcome to Chat')}</h2>
              <p className="text-sm text-(--text-tertiary) mb-4">
                {__('Select a conversation or start a new one')}
              </p>
              <button
                onClick={handleNewChat}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
              >
                {__('Start a new chat')}
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-(--text-tertiary)" size={24} />
          </div>
        ) : conversation ? (
          <ChatPanel
            conversationId={conversationId}
            characterName={conversation.character.name}
            characterAvatar={conversation.character.avatarUrl}
          />
        ) : null}
      </div>

      {/* Character info sidebar (desktop) */}
      {conversation && (
        <div className={cn(
          'w-[300px] shrink-0 h-full',
          'max-2xl:fixed max-2xl:right-0 max-2xl:top-0 max-2xl:z-40 max-2xl:shadow-lg',
          'max-2xl:transition-transform max-2xl:duration-200',
          showCharInfo ? 'max-2xl:translate-x-0' : 'max-2xl:translate-x-full',
          'hidden 2xl:block',
          showCharInfo && 'max-2xl:block',
        )}>
          <CharacterCard
            character={conversation.character}
            stats={{
              messageCount: conversation.messageCount,
              totalTokensUsed: conversation.totalTokensUsed,
              createdAt: conversation.createdAt,
            }}
          />
        </div>
      )}

      {/* Character info overlay for mobile */}
      {showCharInfo && (
        <div
          className="2xl:hidden fixed inset-0 bg-black/30 z-30"
          onClick={() => setShowCharInfo(false)}
        />
      )}

      {/* New chat character picker modal */}
      {showNewChat && (
        <CharacterPicker
          onSelect={handlePickCharacter}
          onClose={() => setShowNewChat(false)}
          isCreating={createConversation.isPending}
        />
      )}
    </div>
  );
}
