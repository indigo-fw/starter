'use client';

import { cn } from '@/lib/utils';
import { MessageRole, MessageStatus } from '@/core-chat/lib/types';
import { AlertTriangle, Check, Loader2, RotateCcw } from 'lucide-react';

export interface ChatMessageData {
  id: string;
  role: string;
  content: string;
  status: string;
  createdAt?: string;
  isStreaming?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  characterName?: string;
  characterAvatar?: string | null;
  onRetry?: () => void;
}

export function ChatMessage({ message, characterName, characterAvatar, onRetry }: ChatMessageProps) {
  const isUser = message.role === MessageRole.USER;
  const isModerated = message.status === MessageStatus.MODERATED;
  const isFailed = message.status === MessageStatus.FAILED;
  const isPending = message.status === MessageStatus.PENDING;

  return (
    <div className={cn('flex gap-3 px-4 py-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-(--surface-secondary) shrink-0 flex items-center justify-center overflow-hidden">
          {characterAvatar ? (
            <img src={characterAvatar} alt={characterName ?? ''} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-medium text-(--text-secondary)">
              {characterName?.[0]?.toUpperCase() ?? 'A'}
            </span>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-brand-500 text-white rounded-br-md'
            : 'bg-(--surface-secondary) text-(--text-primary) rounded-bl-md',
          isPending && 'opacity-60',
          isModerated && 'bg-red-500/10 border border-red-500/20',
          isFailed && 'bg-red-500/10 border border-red-500/20',
        )}
      >
        {isModerated ? (
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle size={14} />
            <span className="text-xs">Message flagged by content filter</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse" />
            )}
          </div>
        )}

        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors"
          >
            <RotateCcw size={12} />
            Retry
          </button>
        )}
      </div>

      {/* Status indicator for user messages */}
      {isUser && (
        <div className="flex items-end shrink-0">
          {isPending && <Loader2 size={12} className="text-(--text-tertiary) animate-spin" />}
          {message.status === MessageStatus.DELIVERED && (
            <Check size={12} className="text-(--text-tertiary)" />
          )}
        </div>
      )}
    </div>
  );
}
