'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useChannel, useWebSocket } from '@/core/lib/ws-client';
import { ChatMessage, type ChatMessageData } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatWsEvent, MessageRole, MessageStatus } from '@/core-chat/lib/types';
import { Loader2 } from 'lucide-react';

interface ChatPanelProps {
  conversationId: string;
  characterName: string;
  characterAvatar?: string | null;
}

interface StreamingMessage {
  tempId: string;
  content: string;
}

export function ChatPanel({ conversationId, characterName, characterAvatar }: ChatPanelProps) {
  useWebSocket();

  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety timeout: if AI response doesn't complete within 60s, unlock the input
  useEffect(() => {
    if (isSending) {
      sendTimeoutRef.current = setTimeout(() => {
        setIsSending(false);
        setStreaming(null);
      }, 60_000);
    } else {
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
        sendTimeoutRef.current = null;
      }
    }
    return () => {
      if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
    };
  }, [isSending]);

  // Fetch message history (composite cursor: { createdAt, id })
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.messages.list.useInfiniteQuery(
      { conversationId, limit: 50 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    );

  // Flatten pages into message list
  const serverMessages = data?.pages.flatMap((p) => p.messages) ?? [];
  const serverIds = new Set(serverMessages.map((m) => m.id));

  // Merge: server messages take precedence, local only for ids not yet on server
  const mergedMessages: ChatMessageData[] = [
    ...serverMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      status: m.status,
      createdAt: m.createdAt?.toISOString(),
    })),
    ...localMessages.filter((m) => !serverIds.has(m.id)),
  ];

  // WS channel subscription
  useChannel<{ type: string; [key: string]: unknown }>(`chat:${conversationId}`, (event) => {
    switch (event.type) {
      case ChatWsEvent.MSG_CONFIRMED: {
        const id = event.id as string;
        setLocalMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, status: MessageStatus.DELIVERED } : m),
        );
        break;
      }
      case ChatWsEvent.MSG_STATUS: {
        const id = event.id as string;
        const status = event.status as string;
        setLocalMessages((prev) =>
          prev.map((m) => m.id === id ? { ...m, status } : m),
        );
        // If tempId matches streaming, clear it on failure
        if (event.tempId && event.status === MessageStatus.FAILED) {
          setStreaming(null);
          setIsSending(false);
        }
        break;
      }
      case ChatWsEvent.MSG_STREAM_START: {
        setStreaming({ tempId: event.tempId as string, content: '' });
        break;
      }
      case ChatWsEvent.MSG_STREAM_CHUNK: {
        setStreaming((prev) => {
          if (!prev || prev.tempId !== event.tempId) return prev;
          return { ...prev, content: prev.content + (event.chunk as string) };
        });
        break;
      }
      case ChatWsEvent.MSG_STREAM_END: {
        const messageId = event.messageId as string;
        const content = event.content as string;
        // Replace streaming with final message
        setStreaming(null);
        setIsSending(false);
        setLocalMessages((prev) => [
          ...prev,
          {
            id: messageId,
            role: MessageRole.ASSISTANT,
            content,
            status: MessageStatus.DELIVERED,
            createdAt: new Date().toISOString(),
          },
        ]);
        break;
      }
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mergedMessages.length, streaming?.content]);

  // Send message mutation
  const sendMutation = trpc.messages.send.useMutation();
  const retryMutation = trpc.messages.retry.useMutation();

  const handleSend = useCallback((content: string) => {
    const id = crypto.randomUUID();

    // Optimistic insert
    setLocalMessages((prev) => [
      ...prev,
      {
        id,
        role: MessageRole.USER,
        content,
        status: MessageStatus.PENDING,
        createdAt: new Date().toISOString(),
      },
    ]);

    setIsSending(true);

    sendMutation.mutate(
      { id, conversationId, content },
      {
        onSuccess: (result) => {
          if (result.status === MessageStatus.MODERATED) {
            setLocalMessages((prev) =>
              prev.map((m) => m.id === id
                ? { ...m, status: MessageStatus.MODERATED, content: 'Message flagged by content filter' }
                : m,
              ),
            );
            setIsSending(false);
          }
        },
        onError: () => {
          setLocalMessages((prev) =>
            prev.map((m) => m.id === id ? { ...m, status: MessageStatus.FAILED } : m),
          );
          setIsSending(false);
        },
      },
    );
  }, [conversationId, sendMutation]);

  const handleRetry = useCallback(() => {
    setIsSending(true);
    retryMutation.mutate({ conversationId }, {
      onError: () => setIsSending(false),
    });
  }, [conversationId, retryMutation]);

  // Infinite scroll: load older messages on scroll to top
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasNextPage || isFetchingNextPage) return;
    if (scrollRef.current.scrollTop < 100) {
      fetchNextPage();
    }
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
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 space-y-1 scrollbar-thin"
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
        {streaming && (
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

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
