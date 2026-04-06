'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { useChannel, useWebSocket } from '@/core/lib/ws-client';
import { ChatMessage, type ChatMessageData } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { BlockMessage } from './BlockMessage';
import { VideoGenerationDialog } from './VideoGenerationDialog';
import { ChatWsEvent, MessageRole, MessageStatus } from '@/core-chat/lib/types';
import { Loader2 } from 'lucide-react';

interface ChatPanelProps {
  conversationId: string;
  characterName: string;
  blockStatus?: { blockType?: number; blockResetAt?: number } | null;
  characterAvatar?: string | null;
}

interface StreamingMessage {
  tempId: string;
  content: string;
}

export function ChatPanel({ conversationId, characterName, characterAvatar, blockStatus }: ChatPanelProps) {
  const __ = useBlankTranslations();
  useWebSocket();

  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);
  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const isBlocked = !!blockStatus?.blockType;
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety timeout
  useEffect(() => {
    if (isSending) {
      sendTimeoutRef.current = setTimeout(() => {
        setIsSending(false);
        setStreaming(null);
        setIsTyping(false);
      }, 60_000);
    } else {
      if (sendTimeoutRef.current) { clearTimeout(sendTimeoutRef.current); sendTimeoutRef.current = null; }
    }
    return () => { if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current); };
  }, [isSending]);

  // Fetch message history
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.messages.list.useInfiniteQuery(
      { conversationId, limit: 50 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    );

  const serverMessages = data?.pages.flatMap((p) => p.messages) ?? [];
  const serverIds = new Set(serverMessages.map((m) => m.id));

  const mergedMessages: ChatMessageData[] = [
    ...serverMessages.map((m) => {
      const modResult = m.moderationResult as { censorType?: number } | null;
      const metadata = m.metadata as { isNsfw?: boolean } | null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        createdAt: m.createdAt?.toISOString(),
        mediaId: m.mediaId ?? undefined,
        censorType: modResult?.censorType,
        isNsfw: metadata?.isNsfw,
      };
    }),
    ...localMessages.filter((m) => !serverIds.has(m.id)),
  ];

  // WS channel
  useChannel<{ type: string; [key: string]: unknown }>(`chat:${conversationId}`, (event) => {
    switch (event.type) {
      case ChatWsEvent.MSG_CONFIRMED: {
        setLocalMessages((prev) => prev.map((m) => m.id === event.id ? { ...m, status: MessageStatus.DELIVERED } : m));
        break;
      }
      case ChatWsEvent.MSG_STATUS: {
        if (event.status === MessageStatus.FAILED) {
          setStreaming(null);
          setIsTyping(false);
          setIsSending(false);
        }
        setLocalMessages((prev) => prev.map((m) => m.id === event.id ? {
          ...m,
          status: event.status as string,
          censorType: event.censorType as number | undefined,
        } : m));
        break;
      }
      case ChatWsEvent.MSG_STREAM_START: {
        setIsTyping(true);
        setStreaming({ tempId: event.tempId as string, content: '' });
        break;
      }
      case ChatWsEvent.MSG_STREAM_CHUNK: {
        setIsTyping(false); // First chunk → stop typing dots, show text
        setStreaming((prev) => {
          if (!prev || prev.tempId !== event.tempId) return prev;
          return { ...prev, content: prev.content + (event.chunk as string) };
        });
        break;
      }
      case ChatWsEvent.MSG_STREAM_END: {
        setStreaming(null);
        setIsTyping(false);
        setIsSending(false);
        setLocalMessages((prev) => [...prev, {
          id: event.messageId as string,
          role: MessageRole.ASSISTANT,
          content: event.content as string,
          status: MessageStatus.DELIVERED,
          createdAt: new Date().toISOString(),
        }]);
        break;
      }
      case ChatWsEvent.MSG_IMAGE_PROCESSING: {
        setIsTyping(true);
        break;
      }
      case ChatWsEvent.MSG_IMAGE_COMPLETE: {
        setIsTyping(false);
        setIsSending(false);
        setLocalMessages((prev) => [...prev, {
          id: event.messageId as string,
          role: MessageRole.ASSISTANT,
          content: '[Image]',
          status: MessageStatus.DELIVERED,
          mediaUrl: event.mediaUrl as string,
          mediaType: 'image',
          mediaWidth: event.width as number,
          mediaHeight: event.height as number,
          isNsfw: event.isNsfw as boolean | undefined,
          createdAt: new Date().toISOString(),
        }]);
        break;
      }
      case ChatWsEvent.MSG_VIDEO_PROCESSING: {
        setIsTyping(true);
        break;
      }
      case ChatWsEvent.MSG_VIDEO_COMPLETE: {
        setIsTyping(false);
        setIsSending(false);
        setLocalMessages((prev) => [...prev, {
          id: event.messageId as string,
          role: MessageRole.ASSISTANT,
          content: '[Video]',
          status: MessageStatus.DELIVERED,
          mediaUrl: event.mediaUrl as string,
          mediaType: 'video',
          createdAt: new Date().toISOString(),
        }]);
        break;
      }
    }
  });

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mergedMessages.length, streaming?.content, isTyping]);

  // Send
  const sendMutation = trpc.messages.send.useMutation();
  const retryMutation = trpc.messages.retry.useMutation();

  const handleSend = useCallback((content: string, mediaId?: string) => {
    const id = crypto.randomUUID();
    setLocalMessages((prev) => [...prev, {
      id, role: MessageRole.USER, content, status: MessageStatus.PENDING, createdAt: new Date().toISOString(),
    }]);
    setIsSending(true);

    sendMutation.mutate({ id, conversationId, content, mediaId }, {
      onSuccess: (result) => {
        if (result.status === MessageStatus.MODERATED) {
          setLocalMessages((prev) => prev.map((m) => m.id === id
            ? { ...m, status: MessageStatus.MODERATED, content: __('Message flagged by content filter') }
            : m));
          setIsSending(false);
        }
      },
      onError: () => {
        setLocalMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: MessageStatus.FAILED } : m));
        setIsSending(false);
      },
    });
  }, [conversationId, sendMutation, __]);

  // Mark conversation as read on open
  const markReadMutation = trpc.conversations.markRead.useMutation();
  useEffect(() => {
    markReadMutation.mutate({ id: conversationId });
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    setIsSending(true);
    retryMutation.mutate({ conversationId }, { onError: () => setIsSending(false) });
  }, [conversationId, retryMutation]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasNextPage || isFetchingNextPage) return;
    if (scrollRef.current.scrollTop < 100) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-(--text-tertiary)" size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 space-y-1 scrollbar-thin"
        role="log"
        aria-live="polite"
        aria-label={__('Chat messages')}
      >
        {isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Loader2 className="animate-spin text-(--text-tertiary)" size={16} />
          </div>
        )}

        {mergedMessages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            characterName={characterName}
            characterAvatar={characterAvatar}
            onRetry={msg.status === MessageStatus.FAILED ? handleRetry : undefined}
          />
        ))}

        {/* Streaming message */}
        {streaming && !isTyping && (
          <ChatMessage
            message={{
              id: streaming.tempId,
              role: MessageRole.ASSISTANT,
              content: streaming.content,
              status: MessageStatus.STREAMING,
              isStreaming: true,
            }}
            characterName={characterName}
            characterAvatar={characterAvatar}
          />
        )}

        {/* Typing indicator */}
        {isTyping && (
          <TypingIndicator characterName={characterName} characterAvatar={characterAvatar} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Block message overlay */}
      {isBlocked && blockStatus?.blockType && (
        <BlockMessage blockType={blockStatus.blockType} blockResetAt={blockStatus.blockResetAt} />
      )}

      <ChatInput
        onSend={handleSend}
        onVideoRequest={() => setShowVideoDialog(true)}
        disabled={isSending || isBlocked}
        blocked={isBlocked}
        placeholder={isBlocked ? __('Chat is currently unavailable') : __('Type a message...')}
      />

      {/* Video generation dialog */}
      {showVideoDialog && (
        <VideoGenerationDialog
          onSubmit={(opts) => {
            handleSend(`send random video ${opts.prompt}`);
            setShowVideoDialog(false);
          }}
          onClose={() => setShowVideoDialog(false)}
          isGenerating={isSending}
        />
      )}
    </div>
  );
}
